// components/InteractiveHeatmap.js
"use client"; // Ensure this is at the very top
import React, {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from "react";
// Removed direct import of styles if they conflict, will use inline or assume simpler base styles
// import styles from "./InteractiveHeatmap.module.css"; // Assuming this only defines .heatmapContainer now
import dynamic from "next/dynamic";
const ResizableBox = dynamic(() => import("react-resizable").then(mod => mod.ResizableBox), { ssr: false });

import Colorbar from "./colorbar";
import "react-resizable/css/styles.css"; // Ensure this CSS is globally available or imported correctly

const InteractiveHeatmap = forwardRef(
  (
    {
      data,
      dim,
      sensorDivRef,
      pitch,
      selectMode,
      eraseMode,
      setSelectMode,
      showADC,
    },
    ref
  ) => {
    const [dragging, setDragging] = useState(false);
    const [draggedNodes, setDraggedNodes] = useState(null);
    const [erasedNodes, setErasedNodes] = useState([]);
    const [dragCoords, setDragCoords] = useState(null);
    const [positions, setPositions] = useState({});
    const [bboxStart, setBboxStart] = useState(null);
    const [bboxEnd, setBboxEnd] = useState(null);
    const [isCircle, setIsCircle] = useState(false);
    const [templateDimensions, setTemplateDimensions] = useState({
      width: 0,
      height: 0,
    });
    const [templateOffset, setTemplateOffset] = useState({ top: 0, left: 0 });
    const containerRef = useRef(null); // This will be the main heatmap container div
    const [outlineImage, setOutlineImage] = useState(null); // Store uploaded image

    const marginNodes = 2; //Number of nodes to leave for "dragging room" on top and bottom of heatmap

    const [cellSize, setCellSize] = useState(0);

    // Recalculate cellSize and templateDimensions on dim or sensorDivRef changes
    useEffect(() => {
      const currentContainer = sensorDivRef.current;
      if (currentContainer && dim && dim.length === 2) { // Ensure dim is valid
        const numCols = dim[0];
        const numRows = dim[1];
        const { clientWidth, clientHeight } = currentContainer;

        if (numCols > 0 && numRows > 0 && clientWidth > 0 && clientHeight > 60) {
            // Calculate a temporary cell size that fits within the available space,
            // taking into account pitch and margins.
            const horizontalSpacePerCell = (clientWidth - 2 * marginNodes * pitch) / (numCols + 2 * marginNodes);
            const verticalSpacePerCell = (clientHeight - 60 - 2 * marginNodes * pitch) / (numRows + 2 * marginNodes);
            
            const calculatedCellSize = Math.min(horizontalSpacePerCell, verticalSpacePerCell);

            setCellSize(calculatedCellSize - pitch); // Effective size of the cell itself

            const actualGridWidth = (calculatedCellSize - pitch) * numCols;
            const actualGridHeight = (calculatedCellSize - pitch) * numRows;

            setTemplateDimensions({
              width: actualGridWidth,
              height: actualGridHeight,
            });
            // TemplateOffset is for the background image, centered relative to container
            setTemplateOffset({
              top: (clientHeight - actualGridHeight) / 2,
              left: (clientWidth - actualGridWidth) / 2,
            });
        } else {
            setCellSize(0);
            setTemplateDimensions({width:0, height:0});
            setTemplateOffset({top:0, left:0});
        }
      }
    }, [sensorDivRef, dim, pitch, marginNodes]);

    // Initialize positions when cellSize or dim changes
    useEffect(() => {
      const initialPositions = {};
      const currentContainer = sensorDivRef.current;
      if (dim && dim.length === 2 && cellSize > 0 && currentContainer) {
        const numRows = dim[1];
        const numCols = dim[0];
        const { clientWidth, clientHeight } = currentContainer;

        const totalGridWidth = (cellSize + pitch) * numCols;
        const totalGridHeight = (cellSize + pitch) * numRows;

        // FIX: Centering logic for the heatmap cells - use actual container dimensions
        const offsetX = (clientWidth - totalGridWidth) / 2;
        const offsetY = (clientHeight - totalGridHeight) / 2;

        for(let rowIndex = 0; rowIndex < numRows; rowIndex++) {
          for(let colIndex = 0; colIndex < numCols; colIndex++) {
            initialPositions[`${rowIndex}-${colIndex}`] = {
              x: colIndex * (cellSize + pitch) + offsetX,
              y: rowIndex * (cellSize + pitch) + offsetY,
            };
          }
        }
      }
      setPositions(initialPositions);
    }, [cellSize, dim, pitch, sensorDivRef]);

    const onResize = (event, { size }) => {
      let deltaX = size.width - templateDimensions.width;
      let deltaY = size.height - templateDimensions.height;
      setTemplateDimensions(size);
      setTemplateOffset((prevOffset) => ({
        top: prevOffset.top - deltaY,
        left: prevOffset.left - deltaX,
      }));
    };

    const handleMouseDownCell = (row, col, event) => {
      if (eraseMode) {
        setErasedNodes((prevErased) => {
          if (prevErased.includes(`${row}-${col}`)) {
            return prevErased.filter((id) => id !== `${row}-${col}`);
          } else {
            return [...prevErased, `${row}-${col}`];
          }
        });
      } else if (!selectMode) {
        setDragging(true);
        const { clientX, clientY } = event;
        const rect = containerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        setDragCoords({ x, y });
        if (!(event.ctrlKey || event.metaKey)) {
          setDraggedNodes([`${row}-${col}`]);
        } else {
            setDraggedNodes(prev => {
                const nodeId = `${row}-${col}`;
                if (prev && prev.includes(nodeId)) {
                    return prev.filter(id => id !== nodeId);
                } else {
                    return prev ? [...prev, nodeId] : [nodeId];
                }
            });
        }
      }
    };

    const handleMouseDownHeatmap = (event) => {
      if (selectMode) {
        const rect = containerRef.current.getBoundingClientRect();
        setDragging(true);
        setBboxStart({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
        setBboxEnd({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
        setDraggedNodes(null);
      }
    };

    const getEncapsulatedNodes = useCallback(() => {
      if (!bboxStart || !bboxEnd || !positions) return [];

      let boxLeft = Math.min(bboxStart.x, bboxEnd.x);
      let boxTop = Math.min(bboxStart.y, bboxEnd.y);
      let boxRight = Math.max(bboxStart.x, bboxEnd.x);
      let boxBottom = Math.max(bboxStart.y, bboxEnd.y);
      const encapsulatedNodes = [];

      Object.entries(positions).forEach(([nodeId, { x, y }]) => {
        const nodeLeft = x;
        const nodeRight = x + cellSize;
        const nodeTop = y;
        const nodeBottom = y + cellSize;

        const isEncapsulated = !(
          nodeRight < boxLeft ||
          nodeLeft > boxRight ||
          nodeBottom < boxTop ||
          nodeTop > boxBottom
        );

        if (isEncapsulated) {
          encapsulatedNodes.push(nodeId);
        }
      });
      return encapsulatedNodes;
    }, [bboxStart, bboxEnd, positions, cellSize]);

    const saveLayout = () => {
      const layoutData = {
        positions,
        erasedNodes,
        isCircle,
      };

      const blob = new Blob([JSON.stringify(layoutData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "layout.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log("InteractiveHeatmap2D: Layout saved.");
    };

    const loadLayout = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const layoutData = JSON.parse(e.target.result);
          if (layoutData.positions && Array.isArray(layoutData.erasedNodes)) {
            setPositions(layoutData.positions);
            setErasedNodes(layoutData.erasedNodes);
            if (layoutData.isCircle !== undefined) {
              setIsCircle(layoutData.isCircle);
            }
            console.log("InteractiveHeatmap2D: Layout loaded.");
          } else {
            console.error("Invalid file format: Missing 'positions' or 'erasedNodes' array.");
            alert("Failed to load layout: Invalid file format.");
          }
        } catch (error) {
          console.error("Error reading file", error);
          alert("Failed to load layout: Error reading file.");
        }
      };
      reader.readAsText(file);
    };

    const uploadBackgroundImage = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        setOutlineImage(e.target.result);
        console.log("InteractiveHeatmap2D: Background image uploaded.");
      };
      reader.readAsDataURL(file);
    };

    const setShape = () => {
      setIsCircle((prev) => !prev);
      console.log(`InteractiveHeatmap2D: Shape toggled to ${!isCircle ? 'circle' : 'square'}.`);
    };

    useImperativeHandle(ref, () => ({
      saveLayout,
      loadLayout,
      uploadBackgroundImage,
      setShape,
      setEraseMode: (mode) => console.log(`Erase mode set to: ${mode}`),
      setSelectMode: (mode) => console.log(`Select mode set to: ${mode}`),
    }));

    const handleMouseUp = () => {
      setDragging(false);
      if (selectMode) {
        if (eraseMode) {
          setErasedNodes((prevErased) => {
            let newNodesToErase = getEncapsulatedNodes();
            const uniqueNewNodes = newNodesToErase.filter(
              (nodeId) => !prevErased.includes(nodeId)
            );
            return [...prevErased, ...uniqueNewNodes];
          });
        } else {
          setDraggedNodes(getEncapsulatedNodes());
        }
        setSelectMode(false);
      } else {
        setDraggedNodes(null);
      }
      setBboxEnd(null);
      setBboxStart(null);
      setDragCoords(null);
    };

    const handleMouseLeave = () => {
      if (dragging) {
        handleMouseUp();
      }
    };

    const handleMouseMove = (event) => {
      if (dragging && dragCoords && !selectMode) {
        const { clientX, clientY } = event;
        const rect = containerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const deltaX = x - dragCoords.x;
        const deltaY = y - dragCoords.y;
        const updatedPositions = { ...positions };
        if (Array.isArray(draggedNodes)) {
            draggedNodes.forEach((nodeId) => {
                if (updatedPositions[nodeId]) {
                    updatedPositions[nodeId] = {
                        x: updatedPositions[nodeId].x + deltaX,
                        y: updatedPositions[nodeId].y + deltaY,
                    };
                }
            });
            setPositions(updatedPositions);
        }
        setDragCoords({ x, y });
      } else if (dragging && selectMode) {
        const rect = containerRef.current.getBoundingClientRect();
        setBboxEnd({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      }
    };

    const getColor = (value) => {
      const clampedValue = Math.max(0, Math.min(value, 4095));
      const hue = (1 - clampedValue / 4095) * 240;
      return `hsl(${hue}, 100%, 50%)`;
    };

    const onDragStart = (e) => {
      e.preventDefault();
    };

    const onDrop = (e) => {
      e.preventDefault();
    };

    const getBoundingBoxStyle = () => {
      if (!bboxStart || !bboxEnd) return {};

      const left = Math.min(bboxStart.x, bboxEnd.x);
      const top = Math.min(bboxStart.y, bboxEnd.y);
      const width = Math.abs(bboxStart.x - bboxEnd.x);
      const height = Math.abs(bboxStart.y - bboxEnd.y);

      return {
        position: "absolute",
        left,
        top,
        width,
        height,
        border: "2px dashed blue",
        backgroundColor: "rgba(0, 0, 255, 0.1)",
        pointerEvents: "none",
        zIndex: 5,
      };
    };

    

    return (
      <div
        className={`heatmap`} // Assuming styles.heatmap is just 'heatmap' class, using a string literal here
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseDown={handleMouseDownHeatmap}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'relative', // Ensure positioning context for absolute children
          width: '100%', // Ensure it fills its parent
          height: '100%', // Ensure it fills its parent
          overflow: 'hidden', // Hide overflow
          // Removed flexbox properties here to allow absolute positioning to work as intended
          // display: 'flex',
          // alignItems: 'center',
          // justifyContent: 'center',
        }}
      >
        {selectMode && bboxStart && bboxEnd && <div style={getBoundingBoxStyle()} />}
        <Colorbar></Colorbar>
        {data.map((row, rowIndex) => (
          <div key={rowIndex} className={`row`}> {/* Assuming styles.row is just 'row' class */}
            {row.map((value, colIndex) => {
              const position = positions[`${rowIndex}-${colIndex}`];
              const nodeId = `${rowIndex}-${colIndex}`;

              if (!position) return null;

              return (
                <div
                  key={colIndex}
                  className={`cell`} // Assuming styles.cell is just 'cell' class
                  style={{
                    backgroundColor:
                      draggedNodes && draggedNodes.includes(nodeId)
                        ? "aquamarine"
                        : getColor(value),
                    position: "absolute",
                    left: position.x,
                    top: position.y,
                    zIndex:
                      draggedNodes && draggedNodes.includes(nodeId) ? 1000 : 2,
                    cursor: dragging ? "grabbing" : (selectMode ? "crosshair" : (draggedNodes && draggedNodes.includes(nodeId) ? "grab" : "default")),
                    width: cellSize,
                    height: cellSize,
                    fontSize: cellSize > 40 ? cellSize - 40 : '0.8em',
                    borderRadius: isCircle ? "50%" : "0px",
                    display:
                      erasedNodes && erasedNodes.includes(nodeId)
                        ? "none"
                        : "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: (draggedNodes && draggedNodes.includes(nodeId)) ? "2px solid aquamarine" : "none",
                    boxSizing: 'border-box',
                    transition: 'background-color 0.1s ease, border 0.1s ease',
                  }}
                  onMouseDown={(e) =>
                    handleMouseDownCell(rowIndex, colIndex, e)
                  }
                  onMouseEnter={(e) => {
                    if (!selectMode && !dragging) {
                        e.currentTarget.style.border = "1px solid black";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selectMode && !dragging) {
                        e.currentTarget.style.border = "none";
                    }
                  }}
                  draggable
                  onDragStart={onDragStart}
                  onDrop={onDrop}
                >
                  {showADC && <span>{Math.round(value)}</span>}
                </div>
              );
            })}
          </div>
        ))}
        {outlineImage && (
          <ResizableBox
            style={{
              position: "absolute",
              top: templateOffset.top,
              left: templateOffset.left,
              zIndex: 1,
              userSelect: "none",
              display: (dim && dim[0] > 0 && dim[1] > 0) ? 'block' : 'none',
            }}
            width={templateDimensions.width}
            height={templateDimensions.height}
            onResize={onResize}
            resizeHandles={["nw", "ne", "sw", "se"]}
          >
            <img
              className={`noselect`} // Assuming styles.noselect is just 'noselect' class
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                position: "absolute",
                zIndex: -1,
              }}
              src={outlineImage}
              alt="Heatmap background"
            ></img>
          </ResizableBox>
        )}
      </div>
    );
  }
);

export default InteractiveHeatmap;
