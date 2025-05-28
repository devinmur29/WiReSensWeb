import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'; // For HTML labels
import styles from "./InteractiveHeatmap.module.css"; // Reuse your existing CSS for container/base styles
import Colorbar from "./colorbar"; // Your existing Colorbar component

const InteractiveHeatmap3D = forwardRef(
  (
    {
      data, // Expected format: data[layerIndex][rowIndex][colIndex] or data[layerIndex][flat_index]
      dim, // [numCols, numRows, numLayers]
      sensorDivRef, // Still useful for initial sizing, though Three.js takes over rendering
      pitch = 0.0, // Set pitch to 0 for a continuous surface
      selectMode, // Controls click-to-select vs. click-to-drag
      eraseMode,  // Controls click-to-erase
      setSelectMode, // Function to toggle selectMode from parent
      showADC, // To show ADC values as HTML labels
      invertLastLayer = false, // New prop: if true, inverts the last layer's visualization
    },
    ref
  ) => {
    const containerRef = useRef(null); // The DOM element where the Three.js canvas will be placed
    const scene = useRef(new THREE.Scene());
    const camera = useRef(new THREE.PerspectiveCamera(75, 1, 0.1, 2000));
    const renderer = useRef(null); // Initialize as null, set in useEffect
    const labelRenderer = useRef(null); // Initialize as null, set in useEffect
    const controls = useRef(null);
    const animationFrameId = useRef(null); // To manage animation frame cleanup

    const raycaster = useRef(new THREE.Raycaster());
    const mouse = useRef(new THREE.Vector2());
    const initialIntersectedPoint = useRef(new THREE.Vector3()); // Point on object when drag starts

    // State to manage heatmap's visual properties and interactions
    const [dragging, setDragging] = useState(false);
    // Stores nodeIds of currently selected/dragged meshes
    const [draggedNodes, setDraggedNodes] = useState([]);
    const [erasedNodes, setErasedNodes] = useState([]); // Stores nodeIds of erased meshes
    const [isCircle, setIsCircle] = useState(false); // Shape of cells
    const [currentLayer, setCurrentLayer] = useState(0); // For layer-specific operations or highlighting

    // State for bounding box selection
    const [bboxStart, setBboxStart] = useState(null); // { x, y } screen coordinates
    const [bboxEnd, setBboxEnd] = useState(null);   // { x, y } screen coordinates

    const cellMeshes = useRef(new Map()); // Map nodeId -> { mesh: THREE.Mesh, label: CSS2DObject }
    const initialCellPositions = useRef(new Map()); // Store original positions for relative dragging

    const baseCellDimension = 7.0; // Base dimension for cells (width, depth, and initial height for geometry)

    // Scaling factors for X, Y, and Z axes based on normalized input value
    const minScaleFactorXY = 1.0; // Keeps width/depth constant for a continuous surface
    const maxScaleFactorXY = 1.0; // Keeps width/depth constant for a continuous surface
    const minScaleFactorZ = 0.01; // Minimum scale for height (e.g., 1% of baseCellDimension, almost flat)
    const maxScaleFactorZ = 5.0; // Maximum scale for height (e.g., 500% of baseCellDimension)

    // New constant for Z-axis shifting based on value
    const maxZShift = baseCellDimension * 4; // Maximum backward shift for a zero-value block

    const [numCols, numRows, numLayers] = dim;
    const cameraDistanceMultiplier = 2.0; // Adjusted for better initial view

    // --- Three.js Scene Setup ---
    useEffect(() => {
      const currentContainer = containerRef.current;
      if (!currentContainer) {
        console.log("Container ref is null, returning from useEffect.");
        return;
      }

      // Ensure dimensions are valid before proceeding
      if (!Array.isArray(dim) || dim.length !== 3 ||
          !Number.isInteger(numCols) || numCols <= 0 ||
          !Number.isInteger(numRows) || numRows <= 0 ||
          !Number.isInteger(numLayers) || numLayers <= 0) {
          console.warn("Invalid dimensions for heatmap:", dim, "Returning from useEffect.");
          return;
      }
      console.log("Dimensions received by Heatmap3D:", dim);

      // Check container size
      if (currentContainer.clientWidth === 0 || currentContainer.clientHeight === 0) {
        console.warn("Heatmap container has zero width or height, visual may not appear:", currentContainer.clientWidth, "x", currentContainer.clientHeight);
      }

      // Cleanup previous renderers, scene objects, and cancel animation frame
      if (renderer.current && renderer.current.domElement.parentNode === currentContainer) {
        currentContainer.removeChild(renderer.current.domElement);
      }
      if (labelRenderer.current && labelRenderer.current.domElement.parentNode === currentContainer) {
        currentContainer.removeChild(labelRenderer.current.domElement);
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }

      // Initialize renderers and controls here (inside useEffect)
      renderer.current = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      labelRenderer.current = new CSS2DRenderer();
      controls.current = new OrbitControls(camera.current, renderer.current.domElement);


      const width = currentContainer.clientWidth;
      const height = currentContainer.clientHeight;

      // Renderer setup
      renderer.current.setSize(width, height);
      renderer.current.setPixelRatio(window.devicePixelRatio);
      renderer.current.setClearColor(0xf0f0f0, 0); // Light gray background, 0 alpha for transparency
      currentContainer.appendChild(renderer.current.domElement);
      console.log("WebGLRenderer appended to container.");


      // Label Renderer for HTML labels
      labelRenderer.current.setSize(width, height);
      labelRenderer.current.domElement.style.position = 'absolute';
      labelRenderer.current.domElement.style.top = '0px';
      labelRenderer.current.domElement.style.pointerEvents = 'none'; // So clicks pass through to webgl renderer
      currentContainer.appendChild(labelRenderer.current.domElement);
      console.log("CSS2DRenderer appended to container.");


      // Camera position - roughly center the heatmap and move back
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
      console.log("Camera position set to:", camera.current.position);
      console.log("Camera looking at:", camera.current.lookAt);


      // OrbitControls for camera interaction
      controls.current.enableDamping = true;
      controls.current.dampingFactor = 0.25;
      controls.current.maxPolarAngle = Math.PI / 2; // Prevent camera from going below ground

      // Lighting (essential for MeshLambertMaterial/MeshPhongMaterial)
      scene.current.add(new THREE.AmbientLight(0x606060));
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
      directionalLight.position.set(1, 1, 1).normalize();
      scene.current.add(directionalLight);

      // Animation loop
      const animate = () => {
        animationFrameId.current = requestAnimationFrame(animate);
        controls.current.update();
        renderer.current.render(scene.current, camera.current);
        labelRenderer.current.render(scene.current, camera.current); // Render HTML labels
      };
      animate();

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
        // Cleanup on component unmount
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
        scene.current.children = []; // Clear all objects from the scene
        cellMeshes.current.forEach(({ mesh, label }) => {
            if (mesh) {
                mesh.geometry.dispose();
                mesh.material.dispose();
            }
            if (label) scene.current.remove(label); // Remove CSS2DObject from scene
        });
        cellMeshes.current.clear();
        initialCellPositions.current.clear();
      };
    }, [numCols, numRows, numLayers, pitch, baseCellDimension, isCircle, cameraDistanceMultiplier]); // Dependencies for setup effect


    // Utility to convert flat data to 2D grid for a layer
    const convertFlatArrayTo2D = (flatArray, rows, cols) => {
        if (!Array.isArray(flatArray)) {
            console.warn("Input to convertFlatArrayTo2D is not an array:", flatArray);
            return [];
        }
        const grid = [];
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                const index = r * cols + c;
                row.push(flatArray[index] !== undefined ? flatArray[index] : 0);
            }
            grid.push(row);
        }
        return grid;
    };


    // --- Data Rendering and Mesh Creation / Update ---
    // This effect runs when 'data', 'dim', 'isCircle', or 'showADC' changes.
    // It's responsible for creating/recreating meshes and setting their initial state.
    useEffect(() => {
        if (!data || !scene.current || !dim || dim.length < 3) return;

        console.log("Data rendering/update effect triggered.");

        const [newNumCols, newNumRows, newNumLayers] = dim;

        // Dispose of old meshes and labels before creating new ones
        cellMeshes.current.forEach(({ mesh, label }) => {
            scene.current.remove(mesh);
            if (label) scene.current.remove(label);
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        cellMeshes.current.clear();
        initialCellPositions.current.clear();

        // Recreate geometry based on isCircle state
        const geometry = isCircle ? new THREE.SphereGeometry(baseCellDimension / 2, 32, 32) : new THREE.BoxGeometry(baseCellDimension, baseCellDimension, baseCellDimension);

        data.forEach((layerData, layerIndex) => {
            let processedLayerData;
            if (Array.isArray(layerData) && Array.isArray(layerData[0])) {
                processedLayerData = layerData;
            } else if (Array.isArray(layerData) && typeof layerData[0] === 'number') {
                processedLayerData = convertFlatArrayTo2D(layerData, newNumRows, newNumCols);
            } else {
                console.warn(`Layer data for layer ${layerIndex} is not in expected format.`);
                return;
            }

            processedLayerData.forEach((row, rowIndex) => {
                row.forEach((value, colIndex) => {
                    const nodeId = `${rowIndex}-${colIndex}-${layerIndex}`;
                    const material = new THREE.MeshLambertMaterial({ color: getColor(value) });
                    const cellMesh = new THREE.Mesh(geometry, material);

                    // --- Apply inversion for the last layer if invertLastLayer is true ---
                    let displayValue = value;
                    if (invertLastLayer && layerIndex === numLayers - 1) {
                        displayValue = 4096 - value; // Invert the value for display
                    }

                    // --- Calculate dynamic scale and position using displayValue ---
                    const normalizedValue = Math.max(0, Math.min(displayValue, 4096)) / 4096; // Normalize displayValue to 0-1
                    const currentScaleFactorXY = minScaleFactorXY + (maxScaleFactorXY - minScaleFactorXY) * normalizedValue;
                    const currentScaleFactorZ = minScaleFactorZ + (maxScaleFactorZ - minScaleFactorZ) * normalizedValue;

                    // Calculate the Z-shift amount: higher value means less shift (closer to front)
                    const zShiftAmount = (1 - normalizedValue) * maxZShift;

                    // Calculate positions in 3D space, centered around (0,0,0)
                    const offsetX = (newNumCols * baseCellDimension) / 2 - (baseCellDimension / 2);
                    const offsetY = (newNumRows * baseCellDimension) / 2 - (baseCellDimension / 2);
                    const initialLayerBaseZ = (layerIndex * baseCellDimension) - ((newNumLayers * baseCellDimension) / 2 - (baseCellDimension / 2));
                    
                    // The center of the cell after scaling and shifting
                    const newZCenter = initialLayerBaseZ + (baseCellDimension * currentScaleFactorZ) / 2 - zShiftAmount;

                    cellMesh.position.set(
                        colIndex * baseCellDimension - offsetX,
                        rowIndex * baseCellDimension - offsetY,
                        newZCenter
                    );
                    // Apply scaling
                    cellMesh.scale.set(currentScaleFactorXY, currentScaleFactorXY, currentScaleFactorZ);


                    cellMesh.userData.nodeId = nodeId; // Store nodeId for raycasting
                    cellMesh.userData.value = displayValue;   // Store displayValue for ADC display/color updates

                    scene.current.add(cellMesh);
                    initialCellPositions.current.set(nodeId, cellMesh.position.clone()); // Store initial position

                    let label = null;
                    if (showADC) {
                        const adcDiv = document.createElement('div');
                        adcDiv.className = styles.adcLabel; // Use CSS module for styling
                        adcDiv.textContent = Math.round(displayValue); // Use displayValue for label
                        label = new CSS2DObject(adcDiv);
                        label.position.copy(cellMesh.position); // Position label at cell center
                        label.position.z += (baseCellDimension * currentScaleFactorZ) / 2 + 0.1; // Offset slightly above the scaled cell
                        scene.current.add(label);
                    }

                    cellMeshes.current.set(nodeId, { mesh: cellMesh, label: label });
                });
            });
        });
        // Dispose the shared geometry only once after all meshes are created
        geometry.dispose(); // Important: Dispose geometry after meshes are created from it
        console.log("Meshes created and added to scene with dynamic scaling and Z-shifting.");

    }, [data, dim, pitch, isCircle, showADC, baseCellDimension, minScaleFactorXY, maxScaleFactorXY, minScaleFactorZ, maxScaleFactorZ, invertLastLayer, maxZShift]);


    // --- Update Mesh Visuals (Colors, Visibility, and now Width/Height) based on State ---
    // This effect runs when 'draggedNodes', 'erasedNodes', 'showADC' changes.
    // It updates properties of already existing meshes.
    useEffect(() => {
        if (!data || !dim || dim.length < 3) return;

        console.log("Updating mesh visuals based on state changes (selection, erasure).");

        cellMeshes.current.forEach(({ mesh, label }, nodeId) => {
            const [nodeRow, nodeCol, nodeLayer] = nodeId.split("-").map(Number);
            let value;
            if (data[nodeLayer] && Array.isArray(data[nodeLayer])) {
                if (Array.isArray(data[nodeLayer][0])) { // 2D array (rows x cols)
                    value = data[nodeLayer][nodeRow]?.[nodeCol];
                } else { // Flat array
                    value = data[nodeLayer][nodeRow * dim[0] + nodeCol];
                }
            }
            if (value === undefined || isNaN(value)) {
                value = 0;
            }

            // --- Apply inversion for the last layer if invertLastLayer is true ---
            let displayValue = value;
            if (invertLastLayer && nodeLayer === numLayers - 1) {
                displayValue = 4096 - value; // Invert the value for display
            }

            const isSelected = draggedNodes.includes(nodeId);
            const erased = erasedNodes.includes(nodeId);

            // --- Recalculate dynamic scale and position for updates ---
            const normalizedValue = Math.max(0, Math.min(displayValue, 4096)) / 4096;
            const currentScaleFactorXY = minScaleFactorXY + (maxScaleFactorXY - minScaleFactorXY) * normalizedValue;
            const currentScaleFactorZ = minScaleFactorZ + (maxScaleFactorZ - minScaleFactorZ) * normalizedValue;

            // Calculate the Z-shift amount
            const zShiftAmount = (1 - normalizedValue) * maxZShift;

            const [numCols, numRows, numLayers] = dim; // Re-extract dims for calculations
            const offsetX = (numCols * baseCellDimension) / 2 - (baseCellDimension / 2);
            const offsetY = (numRows * baseCellDimension) / 2 - (baseCellDimension / 2);
            const initialLayerBaseZ = (nodeLayer * baseCellDimension) - ((numLayers * baseCellDimension) / 2 - (baseCellDimension / 2));
            const newZCenter = initialLayerBaseZ + (baseCellDimension * currentScaleFactorZ) / 2 - zShiftAmount;

            const newPosition = new THREE.Vector3(
                nodeCol * baseCellDimension - offsetX,
                nodeRow * baseCellDimension - offsetY,
                newZCenter
            );

            if (erased) {
                mesh.visible = false;
                // Set scale to almost zero when erased to prevent interaction/rendering artifacts
                mesh.scale.set(0.001, 0.001, 0.001);
                if (label) label.visible = false;
            } else {
                mesh.visible = true;
                mesh.material.color.copy(getColor(displayValue)); // Use displayValue for color
                mesh.scale.set(currentScaleFactorXY, currentScaleFactorXY, currentScaleFactorZ); // Apply scale
                mesh.position.copy(newPosition); // Update position

                if (isSelected) {
                    mesh.material.color.set(0x7fffd4); // Aquamarine for selected
                }

                if (label) {
                    label.visible = showADC;
                    if (label.element.textContent !== String(Math.round(displayValue))) { // Use displayValue for label
                        label.element.textContent = Math.round(displayValue);
                    }
                    label.position.copy(newPosition);
                    label.position.z += (baseCellDimension * currentScaleFactorZ) / 2 + 0.1;
                }
            }
        });
    }, [draggedNodes, erasedNodes, isCircle, showADC, data, dim, baseCellDimension, pitch, minScaleFactorXY, maxScaleFactorXY, minScaleFactorZ, maxScaleFactorZ, invertLastLayer, maxZShift]);


    // --- Color Utility ---
    const getColor = (value) => {
      const clampedValue = Math.max(0, Math.min(value, 4096));
      const hue = (1 - clampedValue / 4096) * 240; // Full range of hues from red (0) to blue (240)
      return new THREE.Color(`hsl(${hue}, 100%, 50%)`);
    };

    // --- Interaction Handlers ---
    const getIntersectedObject = (event) => {
      const container = containerRef.current;
      if (!container || !renderer.current || !camera.current) return null; // Removed instancedMesh.current check as we're using individual meshes

      const rect = container.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera.current);
      const intersects = raycaster.current.intersectObjects(
        Array.from(cellMeshes.current.values()).map(item => item.mesh) // Raycast against all individual meshes
      );

      return intersects.length > 0 ? intersects[0] : null;
    };

    const handleMouseDown = (event) => {
      if (!controls.current) return;

      // Allow OrbitControls if not dragging or in a selection/erase mode
      if (!selectMode && !eraseMode) {
        controls.current.enabled = true;
        // If background is clicked, clear selected nodes
        const intersected = getIntersectedObject(event);
        if (!intersected) {
          setDraggedNodes([]);
        }
        return;
      }

      controls.current.enabled = false; // Disable controls during selection/erasure/drag

      const intersected = getIntersectedObject(event);

      if (intersected) {
        const nodeId = intersected.object.userData.nodeId;
        initialIntersectedPoint.current.copy(intersected.point); // Store point for dragging

        if (eraseMode) {
          setErasedNodes((prev) => [...prev, nodeId]);
          setDraggedNodes([]); // Clear selection when erasing
        } else if (selectMode) {
          // In select mode, clicking a cell adds/removes it from selection
          // If a cell is clicked, it's a direct selection, not a bounding box drag
          setBboxStart(null); // Clear any pending bounding box
          setBboxEnd(null);
          setDraggedNodes((prev) => {
            if (event.ctrlKey || event.metaKey) { // Allow multi-select with Ctrl/Cmd
              return prev.includes(nodeId)
                ? prev.filter((id) => id !== nodeId)
                : [...prev, nodeId];
            } else {
              return [nodeId]; // Single select
            }
          });
        } else { // Not in selectMode, but not eraseMode: This is drag mode
          setDragging(true);
          setDraggedNodes([nodeId]); // Select the clicked node for dragging
          initialCellPositions.current.clear(); // Clear initial positions for dragging
          draggedNodes.forEach(id => {
            const mesh = cellMeshes.current.get(id)?.mesh;
            if(mesh) initialCellPositions.current.set(id, mesh.position.clone());
          });
        }
      } else {
        // Clicked background
        if (selectMode) {
            // Start bounding box selection
            const container = containerRef.current;
            const rect = container.getBoundingClientRect();
            setBboxStart({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
            });
            setBboxEnd(null); // Reset end point
            setDragging(true); // Indicate a drag operation (for bounding box)
            setDraggedNodes([]); // Clear previous selection when starting new bbox
        } else if (!dragging) {
            setDraggedNodes([]); // Clear selection if background clicked and not dragging
        }
      }
    };

    const handleMouseMove = (event) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();

        // Update mouse coordinates for raycaster
        mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        if (selectMode && bboxStart && dragging) {
            // Update bounding box end point
            setBboxEnd({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
            });
        } else if (dragging && draggedNodes.length && !selectMode && !eraseMode) {
            // Existing drag logic for moving cells
            const plane = new THREE.Plane();
            plane.setFromNormalAndCoplanarPoint(
                camera.current.getWorldDirection(new THREE.Vector3()),
                initialIntersectedPoint.current
            );

            raycaster.current.setFromCamera(mouse.current, camera.current);
            const newIntersectedPoint = new THREE.Vector3();
            if (raycaster.current.ray.intersectPlane(plane, newIntersectedPoint)) {
                const delta = newIntersectedPoint.clone().sub(initialIntersectedPoint.current);

                draggedNodes.forEach(nodeId => {
                    const { mesh, label } = cellMeshes.current.get(nodeId) || {};
                    if (mesh) {
                        const initialPos = initialCellPositions.current.get(nodeId);
                        if (initialPos) {
                            // Get the original value for this node to calculate its Z properties
                            const [nodeRow, nodeCol, nodeLayer] = nodeId.split("-").map(Number);
                            let value;
                            if (data[nodeLayer] && Array.isArray(data[nodeLayer])) {
                                if (Array.isArray(data[nodeLayer][0])) { // 2D array (rows x cols)
                                    value = data[nodeLayer][nodeRow]?.[nodeCol];
                                } else { // Flat array
                                    value = data[nodeLayer][nodeRow * dim[0] + nodeCol];
                                }
                            }
                            if (value === undefined || isNaN(value)) {
                                value = 0;
                            }

                            // Apply inversion if applicable (same logic as in useEffect)
                            let displayValue = value;
                            if (invertLastLayer && nodeLayer === numLayers - 1) {
                                displayValue = 4096 - value;
                            }

                            const normalizedValue = Math.max(0, Math.min(displayValue, 4096)) / 4096;
                            const currentScaleZ = minScaleFactorZ + (maxScaleFactorZ - minScaleFactorZ) * normalizedValue;
                            const zShiftAmount = (1 - normalizedValue) * maxZShift;

                            const [numCols, numRows, numLayers] = dim; // Re-extract dims for calculations
                            const offsetX = (numCols * baseCellDimension) / 2 - (baseCellDimension / 2);
                            const offsetY = (numRows * baseCellDimension) / 2 - (baseCellDimension / 2);
                            const initialLayerBaseZ = (nodeLayer * baseCellDimension) - ((numLayers * baseCellDimension) / 2 - (baseCellDimension / 2));
                            const newZCenter = initialLayerBaseZ + (baseCellDimension * currentScaleZ) / 2 - zShiftAmount; // Apply shift here

                            // The delta from mouse movement is applied to XY, Z is fixed by value
                            const newX = initialPos.x + delta.x;
                            const newY = initialPos.y + delta.y;

                            mesh.position.set(newX, newY, newZCenter); // Z is fixed based on value, not dragged
                            
                            if (label) {
                                label.position.copy(mesh.position);
                                label.position.z += (baseCellDimension * currentScaleZ) / 2 + 0.1;
                            }
                        }
                    }
                });
                initialIntersectedPoint.current.copy(newIntersectedPoint);
            }
        }
    };

    const handleMouseUp = () => {
      setDragging(false);
      if (controls.current) controls.current.enabled = true; // Re-enable orbit controls

      if (selectMode && bboxStart && bboxEnd) {
        // Perform bounding box selection
        const newSelectedNodes = [];
        const container = containerRef.current;
        const rect = container.getBoundingClientRect();

        // Calculate normalized bounding box coordinates
        const minX = Math.min(bboxStart.x, bboxEnd.x);
        const maxX = Math.max(bboxStart.x, bboxEnd.x);
        const minY = Math.min(bboxStart.y, bboxEnd.y);
        const maxY = Math.max(bboxStart.y, bboxEnd.y);

        cellMeshes.current.forEach(({ mesh }, nodeId) => {
          // Project 3D object position to 2D screen coordinates
          const vector = new THREE.Vector3();
          mesh.updateMatrixWorld(); // Ensure world matrix is up to date
          vector.setFromMatrixPosition(mesh.matrixWorld);
          vector.project(camera.current); // Project to normalized device coordinates (-1 to 1)

          // Convert normalized device coordinates to pixel coordinates
          const screenX = (vector.x * 0.5 + 0.5) * rect.width;
          const screenY = (-vector.y * 0.5 + 0.5) * rect.height;

          // Check if the projected point is within the bounding box
          if (
            screenX >= minX &&
            screenX <= maxX &&
            screenY >= minY &&
            screenY <= maxY
          ) {
            newSelectedNodes.push(nodeId);
          }
        });
        setDraggedNodes(newSelectedNodes); // Update selected nodes based on bounding box
      }

      setBboxStart(null); // Clear bounding box
      setBboxEnd(null);
    };

    // Style for the 2D bounding box overlay
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
            backgroundColor: 'rgba(127, 255, 212, 0.2)', // Aquamarine with transparency
            pointerEvents: 'none', // Important: allow mouse events to pass through to the canvas
            zIndex: 999, // Ensure it's on top
        };
    };


    // --- Imperative Handle ---
    useImperativeHandle(ref, () => ({
      // Example of saving/loading layout for 3D
      saveLayout: () => {
        const layoutData = {
          cellPositions: Array.from(cellMeshes.current.entries()).map(([nodeId, { mesh }]) => ({
            nodeId,
            position: mesh.position.toArray(), // Save as array [x,y,z]
            scale: mesh.scale.toArray(), // Save scale as well
          })),
          erasedNodes: [...erasedNodes],
          currentLayer, // Still relevant for UI state
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
      },
      loadLayout: (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const layoutData = JSON.parse(e.target.result);
            if (layoutData.cellPositions && layoutData.erasedNodes) {
              // Update mesh positions and visibility
              layoutData.cellPositions.forEach(({ nodeId, position, scale }) => {
                const { mesh, label } = cellMeshes.current.get(nodeId) || {};
                if (mesh) {
                  mesh.position.set(position[0], position[1], position[2]);
                  mesh.scale.set(scale[0], scale[1], scale[2]); // Apply loaded scale
                  if (label) {
                      label.position.copy(mesh.position);
                      label.position.z += scale[2] * baseCellDimension / 2 + 0.1; // Adjust label based on loaded scale
                  }
                }
              });
              setErasedNodes(layoutData.erasedNodes);
              if (layoutData.currentLayer !== undefined) {
                setCurrentLayer(layoutData.currentLayer);
              }
              setDraggedNodes([]); // Clear selection after loading
            } else {
              console.error("Invalid 3D layout file format");
            }
          } catch (error) {
            console.error("Error reading 3D layout file", error);
          }
        };
        reader.readAsText(file);
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
        };
        reader.readAsDataURL(file);
      },
      setShape: () => setIsCircle((prev) => !prev),
      setCurrentLayer, // This could be used to, for example, highlight or dim other layers
      currentLayer, // Provide current layer for external UI to display
      setSelectMode, // Expose for parent to toggle
      setEraseMode: (mode) => { /* You'll need to pass setEraseMode as a prop as well */ },
      // ... other methods as needed
    }));

    return (
      <div
        ref={containerRef}
        className={`${styles.heatmapContainer} ${styles.noselect}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp} // Treat mouse leave as mouse up to end drag/selection
        style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}
      >
        {/* The Three.js canvas and CSS2DRenderer will be appended here by useEffect */}
        {/* Bounding box for selection */}
        {selectMode && bboxStart && bboxEnd && (
            <div style={getBoundingBoxStyle()} />
        )}
        {/* Colorbar as an overlay */}
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
