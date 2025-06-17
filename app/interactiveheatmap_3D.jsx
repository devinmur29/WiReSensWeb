"use client";
import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useCallback,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import styles from "./InteractiveHeatmap.module.css";
import Colorbar from "./colorbar";

const InteractiveHeatmap3D = forwardRef(
  (
    {
      data,
      dim,
      sensorDivRef,
      pitch = 0.0,
      selectMode,
      eraseMode,
      setSelectMode,
      showADC,
      invertLastLayer = false,
      customLayout,
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

    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());

    const [dragging, setDragging] = useState(false);
    const [draggedNodes, setDraggedNodes] = useState([]);
    const [erasedNodes, setErasedNodes] = useState([]);
    const [isCircle, setIsCircle] = useState(false);
    const [currentLayer, setCurrentLayer] = useState(0);

    const [bboxStart, setBboxStart] = useState(null);
    const [bboxEnd, setBboxEnd] = useState(null);

    const cellMeshes = useRef(new Map());
    const initialCellPositions = useRef(new Map());

    const baseCellDimension = 7.0;
    const minScaleFactorXY = 1.0;
    const maxScaleFactorXY = 1.0;
    const minScaleFactorZ = 0.01;
    const maxScaleFactorZ = 5.0;

    const MAX_PRESSURE_VALUE = 2500;
    const MIN_PRESSURE_VALUE = 0;

    const [numCols, numRows, numLayers] = dim;
    const cameraDistanceMultiplier = 2.0;

    const getColor = useCallback((value) => {
      const effectiveMinForColoring = MIN_PRESSURE_VALUE; // Start mapping colors from 0

      const clampedValue = Math.max(MIN_PRESSURE_VALUE, Math.min(value, MAX_PRESSURE_VALUE));
      const valueForColorCalculation = Math.max(effectiveMinForColoring, clampedValue);

      const normalizedForColor = (valueForColorCalculation - effectiveMinForColoring) / (MAX_PRESSURE_VALUE - effectiveMinForColoring);

      const hue = (1 - normalizedForColor) * 240 - 0.001; // Blue (0) to Red (240) based on value

      return new THREE.Color(`hsl(${hue}, 100%, 50%)`);
    }, [MIN_PRESSURE_VALUE, MAX_PRESSURE_VALUE]);


    useEffect(() => {
      const currentContainer = containerRef.current;
      if (!currentContainer) {
        return;
      }

      if (!Array.isArray(dim) || dim.length !== 3 ||
          !Number.isInteger(numCols) || numCols <= 0 ||
          !Number.isInteger(numRows) || numRows <= 0 ||
          !Number.isInteger(numLayers) || numLayers <= 0) {
          console.error("InteractiveHeatmap3D: Invalid dimensions for heatmap:", dim, ". Cannot setup scene.");
          return;
      }

      if (currentContainer.clientWidth === 0 || currentContainer.clientHeight === 0) {
        console.warn("InteractiveHeatmap3D: Container has zero width or height, visual may not appear:", currentContainer.clientWidth, "x", currentContainer.clientHeight);
      }

      if (renderer.current && renderer.current.domElement.parentNode === currentContainer) {
        currentContainer.removeChild(renderer.current.domElement);
      }
      if (labelRenderer.current && labelRenderer.current.domElement.parentNode === currentContainer) {
        currentContainer.removeChild(labelRenderer.current.domElement);
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }

      renderer.current = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      labelRenderer.current = new CSS2DRenderer();
      controls.current = new OrbitControls(camera.current, renderer.current.domElement);

      const width = currentContainer.clientWidth;
      const height = currentContainer.clientHeight;

      renderer.current.setSize(width, height);
      renderer.current.setPixelRatio(window.devicePixelRatio);
      renderer.current.setClearColor(0xf0f0f0, 0);
      currentContainer.appendChild(renderer.current.domElement);

      labelRenderer.current.setSize(width, height);
      labelRenderer.current.domElement.style.position = 'absolute';
      labelRenderer.current.domElement.style.top = '0px';
      labelRenderer.current.domElement.style.pointerEvents = 'none';
      currentContainer.appendChild(labelRenderer.current.domElement);

      camera.current.position.set(
        (numCols * baseCellDimension) / 2,
        (numRows * baseCellDimension) / 2,
        Math.max(numCols, numRows, numLayers) * baseCellDimension * cameraDistanceMultiplier
      );
      camera.current.lookAt(
        (numCols * baseCellDimension) / 2,
        (numRows * baseCellDimension) / 2,
        (numLayers * baseCellDimension) / 2
      );

      controls.current.enableDamping = true;
      controls.current.dampingFactor = 0.25;
      controls.current.maxPolarAngle = Math.PI / 2;

      scene.current.add(new THREE.AmbientLight(0x606060));
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
      directionalLight.position.set(1, 1, 1).normalize();
      scene.current.add(directionalLight);

      const animate = () => {
        animationFrameId.current = requestAnimationFrame(animate);
        controls.current.update();
        renderer.current.render(scene.current, camera.current);
        labelRenderer.current.render(scene.current, camera.current);
      };
      animate();

      const handleResize = () => {
        const newWidth = currentContainer.clientWidth;
        const newHeight = currentContainer.clientHeight;
        if (camera.current && renderer.current && labelRenderer.current) {
            renderer.current.setSize(newWidth, newHeight);
            labelRenderer.current.setSize(newWidth, newHeight);
            camera.current.aspect = newWidth / newHeight;
            camera.current.updateProjectionMatrix();
        }
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
        }
        if (currentContainer && renderer.current && labelRenderer.current) {
          if (renderer.current.domElement.parentNode === currentContainer) {
            currentContainer.removeChild(renderer.current.domElement);
          }
          if (labelRenderer.current.domElement.parentNode === currentContainer) {
            currentContainer.removeChild(labelRenderer.current.domElement);
          }
        }
        if (controls.current) controls.current.dispose();
        cellMeshes.current.forEach(({ mesh, label }) => {
            if (mesh) {
                scene.current.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
            }
            if (label) scene.current.remove(label);
        });
        cellMeshes.current.clear();
        initialCellPositions.current.clear();
        scene.current.clear();
      };
    }, [numCols, numRows, numLayers, baseCellDimension, cameraDistanceMultiplier, dim]);

    useEffect(() => {
        if (!scene.current || !dim || dim.length < 3) {
            return;
        }

        const [newNumCols, newNumRows, newNumLayers] = dim;

        cellMeshes.current.forEach(({ mesh, label }) => {
            scene.current.remove(mesh);
            if (label) scene.current.remove(label);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        cellMeshes.current.clear();
        initialCellPositions.current.clear();

        const geometry = isCircle ? new THREE.SphereGeometry(baseCellDimension / 2, 32, 32) : new THREE.BoxGeometry(baseCellDimension, baseCellDimension, baseCellDimension);

        const initialErasedNodes = [];

        for (let layerIndex = 0; layerIndex < newNumLayers; layerIndex++) {
            for (let rowIndex = 0; rowIndex < newNumRows; rowIndex++) {
                for (let colIndex = 0; colIndex < newNumCols; colIndex++) {
                    const nodeId = `${rowIndex}-${colIndex}-${layerIndex}`;
                    const material = new THREE.MeshLambertMaterial({ color: 0x0000ff });
                    const cellMesh = new THREE.Mesh(geometry, material);

                    const offsetX = (newNumCols * baseCellDimension) / 2 - (baseCellDimension / 2);
                    const offsetY = (newNumRows * baseCellDimension) / 2 - (baseCellDimension / 2);
                    const initialLayerBaseZ = (layerIndex * baseCellDimension) - ((newNumLayers * baseCellDimension) / 2 - (baseCellDimension / 2));

                    cellMesh.position.set(
                        colIndex * baseCellDimension - offsetX,
                        rowIndex * baseCellDimension - offsetY,
                        initialLayerBaseZ + (baseCellDimension * minScaleFactorZ) / 2
                    );
                    cellMesh.scale.set(minScaleFactorXY, minScaleFactorXY, minScaleFactorZ);

                    const loadedNodeData = customLayout?.cellPositions?.find(item => item.nodeId === nodeId);
                    if (loadedNodeData) {
                        cellMesh.position.set(...loadedNodeData.position);
                        cellMesh.scale.set(...loadedNodeData.scale);
                    }

                    const isNodeErasedInLayout = customLayout?.erasedNodes?.includes(nodeId);
                    if (isNodeErasedInLayout) {
                        cellMesh.visible = false;
                        initialErasedNodes.push(nodeId);
                    } else {
                        cellMesh.visible = true;
                    }

                    if (customLayout?.currentLayer !== undefined) {
                        setCurrentLayer(customLayout.currentLayer);
                    }

                    cellMesh.userData.nodeId = nodeId;
                    cellMesh.userData.value = MIN_PRESSURE_VALUE;

                    scene.current.add(cellMesh);
                    const currentMeshBottomZ = cellMesh.position.z - (baseCellDimension * cellMesh.scale.z) / 2;
                    initialCellPositions.current.set(nodeId, new THREE.Vector3(cellMesh.position.x, cellMesh.position.y, currentMeshBottomZ));

                    let label = null;
                    if (showADC) {
                        const adcDiv = document.createElement('div');
                        adcDiv.className = styles.adcLabel;
                        adcDiv.textContent = String(MIN_PRESSURE_VALUE);
                        label = new CSS2DObject(adcDiv);
                        label.position.copy(cellMesh.position);
                        label.position.z += (baseCellDimension * cellMesh.scale.z) / 2 + 0.1;
                        label.visible = cellMesh.visible;
                        scene.current.add(label);
                    }

                    cellMeshes.current.set(nodeId, { mesh: cellMesh, label: label });
                }
            }
        }
        geometry.dispose();

        setErasedNodes(initialErasedNodes);

        if (renderer.current && camera.current && labelRenderer.current) {
            renderer.current.render(scene.current, camera.current);
            labelRenderer.current.render(scene.current, camera.current);
        }

    }, [dim, isCircle, baseCellDimension, minScaleFactorXY, minScaleFactorZ, customLayout, showADC, numCols, numRows, numLayers]);


    useEffect(() => {
        if (!data || !scene.current || cellMeshes.current.size === 0 || !dim || dim.length < 3) {
            return;
        }

        const [numCols, numRows, numLayers] = dim;

        cellMeshes.current.forEach(({ mesh, label }, nodeId) => {
            const [nodeRow, nodeCol, nodeLayer] = nodeId.split("-").map(Number);

            let value = MIN_PRESSURE_VALUE;
            if (data[nodeLayer]) {
                let layerData = data[nodeLayer];
                if (Array.isArray(layerData[0])) {
                    value = layerData[nodeRow]?.[nodeCol];
                } else if (typeof layerData[0] === 'number') {
                    value = layerData[nodeRow * numCols + nodeCol];
                }
            }

            if (value === undefined || isNaN(value)) {
                value = MIN_PRESSURE_VALUE;
            }

            let displayValue = value;
            if (invertLastLayer && nodeLayer === numLayers - 1) {
                displayValue = MAX_PRESSURE_VALUE - value;
            }

            mesh.userData.value = displayValue;

            const normalizedValue = Math.max(0, Math.min(
                (displayValue - MIN_PRESSURE_VALUE) / (MAX_PRESSURE_VALUE - MIN_PRESSURE_VALUE), 1
            ));

            const currentScaleFactorXY = minScaleFactorXY + (maxScaleFactorXY - minScaleFactorXY) * normalizedValue;
            const currentScaleFactorZ = minScaleFactorZ + (maxScaleFactorZ - minScaleFactorZ) * normalizedValue;

            mesh.scale.set(currentScaleFactorXY, currentScaleFactorXY, currentScaleFactorZ);

            const initialMeshBaseZ = initialCellPositions.current.get(nodeId)?.z;
            if (initialMeshBaseZ !== undefined) {
                mesh.position.z = initialMeshBaseZ + (baseCellDimension * currentScaleFactorZ) / 2;
            }

            if (mesh.visible) {
                mesh.material.color.copy(getColor(displayValue));
            }


            if (label) {
                label.visible = showADC && mesh.visible;
                const roundedDisplayValue = Math.round(displayValue);
                if (label.element.textContent !== String(roundedDisplayValue)) {
                    label.element.textContent = roundedDisplayValue;
                }
                label.position.copy(mesh.position);
                label.position.z = mesh.position.z + (baseCellDimension * mesh.scale.z) / 2 + 0.1;
            }
        });

        if (renderer.current && camera.current && labelRenderer.current) {
            renderer.current.render(scene.current, camera.current);
            labelRenderer.current.render(scene.current, camera.current);
        }

    }, [data, dim, showADC, invertLastLayer, baseCellDimension, minScaleFactorXY, maxScaleFactorXY, minScaleFactorZ, maxScaleFactorZ, MIN_PRESSURE_VALUE, MAX_PRESSURE_VALUE, getColor]);


    useEffect(() => {
        if (!cellMeshes.current || !scene.current) {
            return;
        }

        cellMeshes.current.forEach(({ mesh, label }, nodeId) => {
            const isSelected = draggedNodes && draggedNodes.includes(nodeId);
            const erased = erasedNodes.includes(nodeId);

            if (erased) {
                mesh.visible = false;
                if (label) label.visible = false;
            } else {
                mesh.visible = true;
                if (isSelected) {
                    mesh.material.color.set(0x7fffd4);
                } else {
                    mesh.material.color.copy(getColor(mesh.userData.value));
                }

                if (label) {
                    label.visible = showADC;
                }
            }
        });

        if (renderer.current && camera.current && labelRenderer.current) {
            renderer.current.render(scene.current, camera.current);
            labelRenderer.current.render(scene.current, camera.current);
        }

    }, [draggedNodes, erasedNodes, showADC, getColor]);


    const getIntersectedObject = (event) => {
      const container = containerRef.current;
      if (!container || !renderer.current || !camera.current) return null;

      const rect = container.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera.current);
      const intersects = raycaster.current.intersectObjects(
        Array.from(cellMeshes.current.values()).filter(item => item.mesh.visible).map(item => item.mesh)
      );

      return intersects.length > 0 ? intersects[0] : null;
    };

    const handleMouseDown = (event) => {
      if (!controls.current) return;

      if (selectMode || eraseMode) {
        controls.current.enabled = false;
      } else {
        controls.current.enabled = true;
      }

      const intersected = getIntersectedObject(event);

      if (intersected) {
        const nodeId = intersected.object.userData.nodeId;

        if (eraseMode) {
          setErasedNodes((prev) => {
            if (prev.includes(nodeId)) {
                return prev.filter((id) => id !== nodeId);
            } else {
                return [...prev, nodeId];
            }
          });
          setDraggedNodes([]);
        } else if (selectMode) {
          setBboxStart(null);
          setBboxEnd(null);
          setDraggedNodes((prev) => {
            if (event.ctrlKey || event.metaKey) {
              return prev.includes(nodeId)
                ? prev.filter((id) => id !== nodeId)
                : [...prev, nodeId];
            } else {
              return [nodeId];
            }
          });
        }
      } else {
        if (selectMode) {
            const container = containerRef.current;
            const rect = container.getBoundingClientRect();
            setBboxStart({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
            });
            setBboxEnd(null);
            setDragging(true);
            setDraggedNodes([]);
        } else if (!dragging) {
            setDraggedNodes([]);
        }
      }
    };

    const handleMouseMove = (event) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (selectMode && bboxStart && dragging) {
            setBboxEnd({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
            });
        }
    };

    const handleMouseUp = () => {
      setDragging(false);
      if (controls.current) controls.current.enabled = true;

      if (selectMode && bboxStart && bboxEnd) {
        const newSelectedNodes = [];
        const container = containerRef.current;
        const rect = container.getBoundingClientRect();

        const minX = Math.min(bboxStart.x, bboxEnd.x);
        const maxX = Math.max(bboxStart.x, bboxEnd.x);
        const minY = Math.min(bboxStart.y, bboxEnd.y);
        const maxY = Math.max(bboxStart.y - 1, bboxEnd.y - 1);

        cellMeshes.current.forEach(({ mesh }, nodeId) => {
          if (!mesh.visible) return;

          const vector = new THREE.Vector3();
          mesh.updateMatrixWorld();
          vector.setFromMatrixPosition(mesh.matrixWorld);
          vector.project(camera.current);

          const screenX = (vector.x * 0.5 + 0.5) * rect.width;
          const screenY = (-vector.y * 0.5 + 0.5) * rect.height;

          if (
            screenX >= minX &&
            screenX <= maxX &&
            screenY >= minY &&
            screenY <= maxY
          ) {
            newSelectedNodes.push(nodeId);
          }
        });
        setDraggedNodes(newSelectedNodes);
      }

      setBboxStart(null);
      setBboxEnd(null);
    };

    const getBoundingBoxStyle = () => {
        if (!bboxStart || !bboxEnd) return {};

        const left = Math.min(bboxStart.x, bboxEnd.x);
        const top = Math.min(bboxStart.y, bboxEnd.y);
        const width = Math.abs(bboxStart.x - bboxEnd.x);
        const height = Math.abs(bboxStart.y - bboxEnd.y);

        return {
            position: 'absolute',
            left: left,
            top: top,
            width: width,
            height: height,
            border: '1px solid aquamarine',
            backgroundColor: 'rgba(127, 255, 212, 0.2)',
            pointerEvents: 'none',
            zIndex: 999,
        };
    };

    const shiftAllCells = useCallback((xOffset, yOffset, zOffset) => {
      cellMeshes.current.forEach(({ mesh }) => {
          mesh.position.x += xOffset;
          mesh.position.y += yOffset;
          mesh.position.z += zOffset;
      });
      if (renderer.current && camera.current && labelRenderer.current) {
          renderer.current.render(scene.current, camera.current);
          labelRenderer.current.render(scene.current, camera.current);
      }
    }, []);

    useImperativeHandle(ref, () => ({
      saveLayout: () => {
        const layoutData = {
          cellPositions: Array.from(cellMeshes.current.entries()).map(([nodeId, { mesh }]) => ({
            nodeId,
            position: mesh.position.toArray(),
            scale: mesh.scale.toArray(),
          })),
          erasedNodes: [...erasedNodes],
          currentLayer,
        };
        const blob = new Blob([JSON.stringify(layoutData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "heatmap3d_layout.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log("InteractiveHeatmap3D: Layout saved.");
      },
      getLayout: () => {
        return {
          cellPositions: Array.from(cellMeshes.current.entries()).map(([nodeId, { mesh }]) => ({
            nodeId,
            position: mesh.position.toArray(),
            scale: mesh.scale.toArray(),
          })),
          erasedNodes: [...erasedNodes],
          currentLayer: currentLayer,
        };
      },
      uploadBackgroundImage: (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          const texture = new THREE.TextureLoader().load(e.target.result);
          const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
          const planeGeometry = new THREE.PlaneGeometry(
            numCols * baseCellDimension * 1.2,
            numRows * baseCellDimension * 1.2
          );
          const backgroundPlane = new THREE.Mesh(planeGeometry, material);
          backgroundPlane.position.set(
            (numCols * baseCellDimension) / 2 - (baseCellDimension / 2),
            (numRows * baseCellDimension) / 2 - (baseCellDimension / 2),
            -(numLayers * baseCellDimension) / 2 - baseCellDimension * 2
          );
          scene.current.add(backgroundPlane);
          if (renderer.current && camera.current) {
              renderer.current.render(scene.current, camera.current);
          }
          console.log("InteractiveHeatmap3D: Background image uploaded.");
        };
        reader.readAsDataURL(file);
      },
      setShape: () => setIsCircle((prev) => !prev),
      setCurrentLayer,
      currentLayer,
      setSelectMode,
      setEraseMode: (mode) => { console.log(`Erase mode set to: ${mode}`); },
      shiftAllCells: shiftAllCells,
    }));

    return (
      <div
        ref={containerRef}
        className={`${styles.heatmapContainer} ${styles.noselect}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}
      >
        {selectMode && bboxStart && bboxEnd && (
            <div style={getBoundingBoxStyle()} />
        )}
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

export default InteractiveHeatmap3D;