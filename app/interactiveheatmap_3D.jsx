"use client";
import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle
} from "react";
import PropTypes from 'prop-types';
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { TPS } from 'transformation-models';
import styles from "./InteractiveHeatmap.module.css";
import Colorbar from "./colorbar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

const TEXTURE_SIZE = 256; // Power of 2 for texture dimensions

const InteractiveHeatmap3D = forwardRef(
  (
    {
      data,
      dim,
      // Add new props for visualization
      showSensorMapping,
      setShowSensorMapping,
      isSmall, // Assuming 'small' or 'large' affects mapping
      isLeft = true,
    },
    ref
  ) => {
    const containerRef = useRef(null);
    const scene = useRef(new THREE.Scene());
    const camera = useRef(new THREE.PerspectiveCamera(75, 1, 0.1, 2000));
    const renderer = useRef(null);
    const labelRenderer = useRef(null);
    const controls = useRef(null);
    const animationFrameId = useRef(null);
    const baseCellDimension = 7.0;
    
    const MAX_PRESSURE_VALUE = 4000;
    const MIN_PRESSURE_VALUE = 1000;

    const [numCols, numRows, numLayers] = dim;
    const handModelRef = useRef(null);
    const sensorPointsGroup = useRef(new THREE.Group());

    // Refs for texture-based rendering
    const textureCanvasRef = useRef(document.createElement('canvas'));
    const textureContextRef = useRef(textureCanvasRef.current.getContext('2d'));
    const heatmapTextureRef = useRef(new THREE.CanvasTexture(textureCanvasRef.current));
    const [sensor3DPositions, setSensor3DPositions] = useState([]);
    const [pressureThreshold, setPressureThreshold] = useState(MIN_PRESSURE_VALUE);
    const interpolationData = useRef(null); // Will store pre-computed weights

    const getColor = (value) => {
      // Clamp value between min and the current threshold
      const clampedValue = Math.max(MIN_PRESSURE_VALUE, Math.min(value, pressureThreshold));
      // Renormalize based on the threshold
      const range = pressureThreshold - MIN_PRESSURE_VALUE;
      // Avoid division by zero if threshold is at min
      const normalized = range > 0 ? (clampedValue - MIN_PRESSURE_VALUE) / range : 0;
      // Hue now goes from 0 (red) to 240 (blue) as value increases.
      const hue = normalized * 240;
      return new THREE.Color(`hsl(${hue}, 100%, 50%)`);
    };
    
    const getHslColorString = (value) => {
      const clampedValue = Math.max(MIN_PRESSURE_VALUE, Math.min(value, pressureThreshold));
      const range = pressureThreshold - MIN_PRESSURE_VALUE;
      const normalized = range > 0 ? (clampedValue - MIN_PRESSURE_VALUE) / range : 0;
      const hue = normalized * 240;
      return `hsl(${hue}, 100%, 50%)`;
    }

    const loadHandModel = async () => {
      if (handModelRef.current) {
        scene.current.remove(handModelRef.current);
        handModelRef.current = null;
      }

      const handProfile = isLeft ? 'left' : 'right';
      const url = `https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/${handProfile}.glb`;
      const loader = new GLTFLoader();

      try {
        const gltf = await loader.loadAsync(url);
        const handModel = gltf.scene;
        handModelRef.current = handModel;

        handModel.traverse((child) => {
          if (child.isSkinnedMesh) {
            // Use the new texture for the material
            child.material = new THREE.MeshStandardMaterial({
              map: heatmapTextureRef.current, // Apply the texture here
              metalness: 0.2,
              roughness: 0.8,
            });
          }
        });

        handModel.scale.set(1, 1, 1);
        handModel.position.set(0, -0.05, 0);
        handModel.rotation.set(0, Math.PI / 2, Math.PI);
        // Pre-computation must happen AFTER the model is transformed and added to the scene
        const handMesh = handModel.getObjectByProperty('isSkinnedMesh', true);
        if (handMesh) {
          precomputeSensorPositions(handMesh);
          precomputeInterpolationWeights(handMesh); // New pre-computation step
        }
        scene.current.add(handModel);
      } catch (error) {
        console.error("Failed to load hand model:", error);
      }
    };

    const precomputeSensorPositions = async (handMesh) => {
        if (!handMesh || !handMesh.geometry) return;

        try {
            const mapResponse = await fetch('/hand_sensor_map.json');
            const sensorMap = await mapResponse.json();
            const { uvMap } = sensorMap;

            const tempSensorPositions = [];
            const geometry = handMesh.geometry;
            const uvAttribute = geometry.attributes.uv;
            const index = geometry.index;

            // Helper: Convert UV (Vector2) to Vector3 for math operations
            const toVec3 = (uv, idx) => {
                return new THREE.Vector3(uv.getX(idx), uv.getY(idx), 0);
            };

            const getPositionFromUV = (targetUv) => {
                // Convert target to Vector3 for compatibility
                const targetPoint = new THREE.Vector3(targetUv.x, targetUv.y, 0);
                
                let closestFace = null;
                let minDistanceSq = Infinity;
                let finalBarycentric = new THREE.Vector3();

                // Scratch vectors to avoid garbage collection
                const triangle = new THREE.Triangle();
                const closestPoint = new THREE.Vector3();
                const barycentric = new THREE.Vector3();

                for (let i = 0; i < index.count; i += 3) {
                    const a = index.getX(i);
                    const b = index.getX(i + 1);
                    const c = index.getX(i + 2);
                    
                    // Create Vector3s from UVs (z=0)
                    triangle.set(toVec3(uvAttribute, a), toVec3(uvAttribute, b), toVec3(uvAttribute, c));

                    triangle.closestPointToPoint(targetPoint, closestPoint);
                    const distSq = targetPoint.distanceToSquared(closestPoint);

                    if (distSq < minDistanceSq) {
                        triangle.getBarycoord(closestPoint, barycentric);
                        
                        // Strict check: Barycentric coords must be numbers
                        if (!isNaN(barycentric.x)) {
                            minDistanceSq = distSq;
                            closestFace = { a, b, c };
                            finalBarycentric.copy(barycentric);
                        }
                    }
                }

                if (closestFace) {
                    const posAttribute = geometry.attributes.position;
                    const normAttribute = geometry.attributes.normal;

                    // Interpolate Position
                    const posA = new THREE.Vector3().fromBufferAttribute(posAttribute, closestFace.a);
                    const posB = new THREE.Vector3().fromBufferAttribute(posAttribute, closestFace.b);
                    const posC = new THREE.Vector3().fromBufferAttribute(posAttribute, closestFace.c);
                    const position = new THREE.Vector3()
                        .addScaledVector(posA, finalBarycentric.x)
                        .addScaledVector(posB, finalBarycentric.y)
                        .addScaledVector(posC, finalBarycentric.z);

                    // Interpolate Normal
                    const normA = new THREE.Vector3().fromBufferAttribute(normAttribute, closestFace.a);
                    const normB = new THREE.Vector3().fromBufferAttribute(normAttribute, closestFace.b);
                    const normC = new THREE.Vector3().fromBufferAttribute(normAttribute, closestFace.c);
                    const normal = new THREE.Vector3()
                        .addScaledVector(normA, finalBarycentric.x)
                        .addScaledVector(normB, finalBarycentric.y)
                        .addScaledVector(normC, finalBarycentric.z)
                        .normalize();

                    // Transform to World Space
                    handMesh.updateWorldMatrix(true, true);
                    normal.transformDirection(handMesh.matrixWorld);
                    const worldPos = position.applyMatrix4(handMesh.matrixWorld);
                    
                    // Offset by 4mm to ensure it sits visibly ON TOP of the skin
                    worldPos.add(normal.multiplyScalar(0.004));

                    return worldPos;
                }
                return null;
            };

            Object.entries(uvMap).forEach(([id, uv]) => {
                // Try original UV
                let pos = getPositionFromUV(new THREE.Vector2(uv.u, uv.v));
                
                // If failed, try inverted V (fixes Top-Left vs Bottom-Left origin mismatch)
                if (!pos) {
                    pos = getPositionFromUV(new THREE.Vector2(uv.u, 1.0 - uv.v));
                }

                if (pos) {
                    tempSensorPositions.push({ id, position: pos });
                }
            });

            console.log(`Final Result: Mapped ${tempSensorPositions.length} sensors.`);
            setSensor3DPositions(tempSensorPositions);

        } catch (error) {
            console.error("Error in sensor mapping:", error);
        }
    };

    const precomputeInterpolationWeights = async (handMesh) => {
        if (!handMesh || !handMesh.geometry) return;

        try {
            const mapResponse = await fetch('/hand_sensor_map.json');
            const sensorMap = await mapResponse.json();
            const { uvMap, palmBoundary } = sensorMap;

            if (!palmBoundary || palmBoundary.length < 3) {
                console.warn("Palm boundary not defined or invalid. Skipping heatmap interpolation.");
                return;
            }

            const sensorUVs = Object.entries(uvMap).map(([id, uv]) => ({ id, ...uv }));
            const textureWeights = new Array(TEXTURE_SIZE * TEXTURE_SIZE);

            // Point-in-polygon test
            const isPointInPolygon = (point, polygon) => {
                let isInside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                    const xi = polygon[i].u, yi = polygon[i].v;
                    const xj = polygon[j].u, yj = polygon[j].v;
                    const intersect = ((yi > point.v) !== (yj > point.v)) && (point.u < (xj - xi) * (point.v - yi) / (yj - yi) + xi);
                    if (intersect) isInside = !isInside;
                }
                return isInside;
            };

            for (let y = 0; y < TEXTURE_SIZE; y++) {
                for (let x = 0; x < TEXTURE_SIZE; x++) {
                    const u = x / (TEXTURE_SIZE - 1);
                    const v = 1.0 - (y / (TEXTURE_SIZE - 1)); // Invert V to match canvas coords

                    const idx = y * TEXTURE_SIZE + x;

                    if (isPointInPolygon({ u, v }, palmBoundary)) {
                        let totalWeight = 0;
                        const weights = sensorUVs.map(sensor => {
                            const distSq = (sensor.u - u) ** 2 + (sensor.v - v) ** 2;
                            const weight = 1 / (distSq + 0.0001); // Add epsilon to avoid division by zero
                            totalWeight += weight;
                            return { id: sensor.id, weight };
                        });

                        // Normalize weights
                        textureWeights[idx] = weights.map(w => ({ ...w, weight: w.weight / totalWeight }));
                    } else {
                        textureWeights[idx] = null; // Mark as outside the boundary
                    }
                }
            }
            interpolationData.current = textureWeights;
            console.log("Interpolation weights pre-computed.");
        } catch (error) {
            console.error("Error pre-computing interpolation weights:", error);
        }
    };
    useEffect(() => {
      const currentContainer = containerRef.current;
      if (!currentContainer) return;

      // Scene setup
      renderer.current = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      labelRenderer.current = new CSS2DRenderer();

      // Setup for texture rendering
      textureCanvasRef.current.width = TEXTURE_SIZE;
      textureCanvasRef.current.height = TEXTURE_SIZE;
      textureContextRef.current.fillStyle = '#ffffff'; // White for non-active areas
      textureContextRef.current.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
      heatmapTextureRef.current.needsUpdate = true;
      
      const width = currentContainer.clientWidth;
      const height = currentContainer.clientHeight;

      renderer.current.setSize(width, height);
      renderer.current.setPixelRatio(window.devicePixelRatio);
      renderer.current.setClearColor(0xffffff, 1); // Set a white, opaque background
      currentContainer.appendChild(renderer.current.domElement);

      labelRenderer.current.setSize(width, height);
      labelRenderer.current.domElement.style.position = 'absolute';
      labelRenderer.current.domElement.style.top = '0px';
      labelRenderer.current.domElement.style.pointerEvents = 'none';
      currentContainer.appendChild(labelRenderer.current.domElement);

      camera.current.aspect = width / height;
      camera.current.position.set(0, 0, 0.2); // Adjusted for better initial view
      camera.current.updateProjectionMatrix();

      controls.current = new OrbitControls(camera.current, renderer.current.domElement);
      controls.current.enableDamping = true;
      controls.current.dampingFactor = 0.25;

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(1, 1, 1).normalize();
      scene.current.add(sensorPointsGroup.current);
      scene.current.add(directionalLight);

      const animate = () => {
        animationFrameId.current = requestAnimationFrame(animate);
        controls.current.update();
        renderer.current.render(scene.current, camera.current);
        labelRenderer.current.render(scene.current, camera.current);
      };
      animate();

      // Load the model here, which will trigger the pre-computation
      loadHandModel();

      const handleResize = () => {
        const newWidth = currentContainer.clientWidth;
        const newHeight = currentContainer.clientHeight;
        renderer.current.setSize(newWidth, newHeight);
        labelRenderer.current.setSize(newWidth, newHeight);
        camera.current.aspect = newWidth / newHeight;
        camera.current.updateProjectionMatrix();
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        cancelAnimationFrame(animationFrameId.current);
        if (renderer.current) currentContainer.removeChild(renderer.current.domElement);
        if (labelRenderer.current) currentContainer.removeChild(labelRenderer.current.domElement);
        if (controls.current) controls.current.dispose();
        if (scene.current) scene.current.clear();
        if (handModelRef.current) handModelRef.current = null;
        }
    }, [isLeft, dim]);
    
    useEffect(() => {
      // New texture-based rendering logic
      if (!data || !handModelRef.current || !interpolationData.current) return;

      // console.log("Received new data, updating heatmap texture.", data);

      const ctx = textureContextRef.current;
      const imageData = ctx.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
      const pixels = imageData.data;

      // Flatten the data for easier lookup
      const flatData = {};
      if (!isLeft) {
         Object.entries(data).forEach(([row, cols]) => {
          Object.entries(cols).forEach(([col, value]) => {
              flatData[`${15-col}-${15-row}`] = value;
          });
      })} else {
          Object.entries(data).forEach(([row, cols]) => {
          Object.entries(cols).forEach(([col, value]) => {
              flatData[`${row}-${col}`] = value;
          })});
      }
     

      for (let i = 0; i < interpolationData.current.length; i++) {
          const weights = interpolationData.current[i];
          let color;

          if (weights) {
              let interpolatedValue = 0;
              weights.forEach(({ id, weight }) => {
                  const value = flatData[id] !== undefined ? flatData[id] : MIN_PRESSURE_VALUE;
                  interpolatedValue += value * weight;
              });
              if (interpolatedValue > pressureThreshold) {
                color = new THREE.Color('#ffffff'); // Base color for above threshold
              } else {
                color = getColor(interpolatedValue);
              }
          } else {
              color = new THREE.Color('#ffffff'); // Default color for outside the boundary
          }

          pixels[i * 4] = color.r * 255;
          pixels[i * 4 + 1] = color.g * 255;
          pixels[i * 4 + 2] = color.b * 255;
          pixels[i * 4 + 3] = 255; // Alpha
      }

      ctx.putImageData(imageData, 0, 0);
      heatmapTextureRef.current.needsUpdate = true;
    }, [data, pressureThreshold, isLeft]); // pressureThreshold is now a dependency

    useEffect(() => {
      // Logic to show/hide sensor mapping points
      console.log(`Debug: Sensor points useEffect triggered. showSensorMapping: ${showSensorMapping}, sensor3DPositions.length: ${sensor3DPositions.length}`);
      sensorPointsGroup.current.clear();
      if (showSensorMapping && sensor3DPositions.length > 0) {
        console.log("Debug: Conditions met. Creating and adding sensor point meshes.");
        const pointGeometry = new THREE.SphereGeometry(0.002, 16, 16);
        const pointMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff00ff, 
            depthTest: false, // Renders the point even if behind the hand mesh
            transparent: true 
        });
// You also need to set renderOrder to ensure it draws on top
// pointMesh.renderOrder = 999;

        sensor3DPositions.forEach((sensor, index) => {
          const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
          pointMesh.position.copy(sensor.position);
          sensorPointsGroup.current.add(pointMesh);
          if (index === 0) {
            console.log("Debug: Position of first point mesh added to group:", pointMesh.position);
          }
        });
        console.log("Debug: Total point meshes added to group:", sensorPointsGroup.current.children.length);
      }
    }, [showSensorMapping, sensor3DPositions]);

    useImperativeHandle(ref, () => ({
      // Expose a method to toggle the sensor mapping visualization
      toggleSensorMapping: () => {
        setShowSensorMapping(prev => !prev);
      }
    }));

    return (
      <div
        ref={containerRef}
        className={`${styles.heatmapContainer} ${styles.noselect}`}
        style={{ width: "100%", height: "700px", position: "relative", overflow: "hidden" }}
      >
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1 }}>
            <Button onClick={() => setShowSensorMapping(p => !p)}>
                {showSensorMapping ? 'Hide Sensor Map' : 'Show Sensor Map'}
            </Button>
        </div>
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 1, width: '50%', background: 'rgba(40, 40, 40, 0.8)', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <label htmlFor="thresholdSlider" style={{ color: 'white', whiteSpace: 'nowrap' }}>Upper Threshold: {pressureThreshold}</label>
            <Slider
                id="thresholdSlider"
                min={MIN_PRESSURE_VALUE}
                max={MAX_PRESSURE_VALUE}
                step={50}
                value={[pressureThreshold]}
                onValueChange={(value) => setPressureThreshold(value[0])}
                className="w-full"
            />
            <Button onClick={() => setPressureThreshold(MIN_PRESSURE_VALUE)} variant="outline" size="sm">
                Reset
            </Button>
        </div>
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1, pointerEvents: 'none' }}>

        </div>
        <Colorbar
          width={20}
          height={containerRef.current ? containerRef.current.clientHeight * 0.8 : 300}
          x={containerRef.current ? containerRef.current.clientWidth - 50 : 0}
          y={containerRef.current ? (containerRef.current.clientHeight * 0.1) : 0}
        />
      </div>
    );
  }
);

InteractiveHeatmap3D.propTypes = {
    data: PropTypes.array,
    dim: PropTypes.array.isRequired,
    isLeft: PropTypes.bool,
    isSmall: PropTypes.bool,
    showSensorMapping: PropTypes.bool,
    setShowSensorMapping: PropTypes.func,
};

InteractiveHeatmap3D.displayName = 'InteractiveHeatmap3D';
export default InteractiveHeatmap3D;