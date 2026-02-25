"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { TPS } from 'transformation-models';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Button } from '@/components/ui/button';
import styles from './SensorMapper.module.css';

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 512;
const POINT_RADIUS = 5;

const SensorMapper = ({ isVisible, onClose, handProfile = 'left' }) => {
    const svgCanvasRef = useRef(null);
    const uvCanvasRef = useRef(null);

    // sensorMap will now hold { svgPoints: {...}, uvMap: {...} }
    const [sensorMap, setSensorMap] = useState({ svgPoints: {}, uvMap: {}, palmBoundary: [] });
    const [uvTexture, setUvTexture] = useState(null);

    // --- New State for Advanced Tools ---
    const [selectedPointIds, setSelectedPointIds] = useState(new Set());
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState(null); // {startX, startY, initialPositions: Map<id, {u, v}>}
    const [isLassoing, setIsLassoing] = useState(false);
    const [isRotating, setIsRotating] = useState(false);
    const [rotationStart, setRotationStart] = useState(null); // { initialPositions: Map<id, {u, v}> }
    const [lassoPoints, setLassoPoints] = useState([]);
    const [lassoCanvas, setLassoCanvas] = useState(null); // 'svg' or 'uv'
    const [isDrawingBoundary, setIsDrawingBoundary] = useState(false);

    // Memoize the draw function to prevent re-creation on every render
    const draw = useCallback(() => {
        if (!svgCanvasRef.current || !uvCanvasRef.current) return;

        // Draw SVG canvas (Source)
        const svgCtx = svgCanvasRef.current.getContext('2d');
        svgCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        svgCtx.fillStyle = '#222';
        svgCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        const { svgPoints, uvMap, palmBoundary } = sensorMap || {};
        if (!svgPoints || !uvMap) return;

        // Find bounds of SVG points to scale them
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        Object.values(svgPoints).forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        const scaleX = CANVAS_WIDTH / (maxX - minX) * 0.9;
        const scaleY = CANVAS_HEIGHT / (maxY - minY) * 0.9;
        const scale = Math.min(scaleX, scaleY);
        const offsetX = (CANVAS_WIDTH - (maxX - minX) * scale) / 2 - minX * scale;
        const offsetY = (CANVAS_HEIGHT - (maxY - minY) * scale) / 2 - minY * scale;

        // Draw all sensor points
        Object.entries(svgPoints).forEach(([id, p]) => {
            const isSelected = selectedPointIds.has(id);
            svgCtx.fillStyle = isSelected ? '#ff00ff' : '#00ff00'; // Magenta if selected, else green
            svgCtx.beginPath();
            svgCtx.arc(p.x * scale + offsetX, p.y * scale + offsetY, isSelected ? POINT_RADIUS : 3, 0, 2 * Math.PI);
            svgCtx.fill();
        });

        // Draw UV canvas (Destination)
        const uvCtx = uvCanvasRef.current.getContext('2d');
        uvCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        if (uvTexture) {
            const img = new Image();
            img.onload = () => {
                uvCtx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
                // Draw all mapped points on UV map
                Object.entries(uvMap).forEach(([id, p]) => {
                    const isSelected = selectedPointIds.has(id);
                    uvCtx.fillStyle = isSelected ? '#ff00ff' : '#00ff00'; // Magenta if selected
                    uvCtx.beginPath();
                    uvCtx.arc(p.u * CANVAS_WIDTH, (1 - p.v) * CANVAS_HEIGHT, isSelected ? POINT_RADIUS : 3, 0, 2 * Math.PI);
                    uvCtx.fill();
                });
            };
            // Draw palm boundary on UV map
            if (palmBoundary && palmBoundary.length > 1) {
                uvCtx.strokeStyle = 'rgba(0, 255, 255, 0.9)'; // Cyan
                uvCtx.lineWidth = 2;
                uvCtx.beginPath();
                uvCtx.moveTo(palmBoundary[0].u * CANVAS_WIDTH, (1 - palmBoundary[0].v) * CANVAS_HEIGHT);
                for (let i = 1; i < palmBoundary.length; i++) {
                    const p = palmBoundary[i];
                    uvCtx.lineTo(p.u * CANVAS_WIDTH, (1 - p.v) * CANVAS_HEIGHT);
                }
                uvCtx.closePath();
                uvCtx.stroke();
            }

            img.src = uvTexture;
        }

        // Draw lasso
        if (isLassoing && lassoPoints.length > 1) {
            const ctx = lassoCanvas === 'svg' ? svgCtx : uvCanvasRef.current.getContext('2d');
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
            lassoPoints.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.stroke();
        }
    }, [sensorMap, uvTexture, selectedPointIds, isLassoing, lassoPoints, lassoCanvas, isDrawingBoundary]);

    // Combined effect for loading and drawing
    useEffect(() => {
        if (!isVisible) return;

        let isMounted = true;

        const loadAndDraw = async () => {
            // Step 1: Fetch sensor map
            let rawMap;
            try {
                const response = await fetch('/hand_sensor_map.json');
                rawMap = await response.json();
            } catch (error) {
                console.error("Failed to load hand_sensor_map.json", error);
                alert("Could not load hand_sensor_map.json. Make sure it's in the /public folder.");
                return;
            }

            // Step 2: CONVERT old anchor-based map to new 1-to-1 uvMap if necessary
            if (rawMap.anchors && !rawMap.uvMap) {
                console.log("Old anchor-based map detected. Converting to 1-to-1 mapping...");
                const { anchors, svgPoints, palmBoundary } = rawMap;
                const validAnchors = anchors.filter(a => a.svg && a.uv);
                const fromPoints = validAnchors.map(a => [a.svg.x, a.svg.y]);
                const toPoints = validAnchors.map(a => [a.uv.x, a.uv.y]);
                const tps = new TPS(fromPoints, toPoints);

                const newUvMap = {};
                Object.entries(svgPoints).forEach(([id, svgCoord]) => {
                    const transformed = tps.forward([svgCoord.x, svgCoord.y]);
                    newUvMap[id] = { u: transformed[0], v: transformed[1] };
                });
                
                if (isMounted) {
                    setSensorMap({ svgPoints: rawMap.svgPoints, uvMap: newUvMap, palmBoundary: palmBoundary || [] });
                }
            } else {
                // It's already in the new format
                if (isMounted && rawMap) {
                    setSensorMap(rawMap);
                }
            }

            // Step 2: Render UVs
            let generatedUvTexture;
            const url = `https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/${handProfile}.glb`;
            const loader = new GLTFLoader();
            try {
                const gltf = await loader.loadAsync(url);
                const handMesh = gltf.scene.getObjectByProperty('isSkinnedMesh', true);
                if (handMesh) {
                    const uvAttribute = handMesh.geometry.attributes.uv;
                    const index = handMesh.geometry.index;
                    const canvas = document.createElement('canvas');
                    canvas.width = CANVAS_WIDTH;
                    canvas.height = CANVAS_HEIGHT;
                    const ctx = canvas.getContext('2d');
                    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
                    ctx.lineWidth = 1;

                    for (let i = 0; i < index.count; i += 3) {
                        const a = index.getX(i);
                        const b = index.getX(i + 1);
                        const c = index.getX(i + 2);
                        const uvA = new THREE.Vector2().fromBufferAttribute(uvAttribute, a);
                        const uvB = new THREE.Vector2().fromBufferAttribute(uvAttribute, b);
                        const uvC = new THREE.Vector2().fromBufferAttribute(uvAttribute, c);
                        ctx.beginPath();
                        ctx.moveTo(uvA.x * CANVAS_WIDTH, (1 - uvA.y) * CANVAS_HEIGHT);
                        ctx.lineTo(uvB.x * CANVAS_WIDTH, (1 - uvB.y) * CANVAS_HEIGHT);
                        ctx.lineTo(uvC.x * CANVAS_WIDTH, (1 - uvC.y) * CANVAS_HEIGHT);
                        ctx.closePath();
                        ctx.stroke();
                    }
                    generatedUvTexture = canvas.toDataURL();
                    if (isMounted) setUvTexture(generatedUvTexture);
                }
            } catch (error) {
                console.error("Failed to load hand model for UV mapping:", error);
            }
        };

        loadAndDraw();

        return () => { isMounted = false; };
    }, [isVisible, handProfile]);

    useEffect(draw, [draw]);

    const getPointAtCursor = (canvas, e, type) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (!sensorMap) return null;

        // Find bounds for SVG points
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; // These need to be calculated once, not in a hot function
        Object.values(sensorMap.svgPoints).forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });
        const scaleX = CANVAS_WIDTH / (maxX - minX) * 0.9;
        const scaleY = CANVAS_HEIGHT / (maxY - minY) * 0.9;
        const scale = Math.min(scaleX, scaleY);
        const offsetX = (CANVAS_WIDTH - (maxX - minX) * scale) / 2 - minX * scale;
        const offsetY = (CANVAS_HEIGHT - (maxY - minY) * scale) / 2 - minY * scale;

        if (type === 'uv') {
            for (const [id, p] of Object.entries(sensorMap.uvMap || {})) {
                const dx = x - (p.u * CANVAS_WIDTH);
                const dy = y - ((1 - p.v) * CANVAS_HEIGHT);
                if (dx * dx + dy * dy < POINT_RADIUS * POINT_RADIUS) {
                    return id;
                }
            }
        } else if (type === 'svg') {
            for (const [id, p] of Object.entries(sensorMap.svgPoints || {})) {
                const dx = x - (p.x * scale + offsetX);
                const dy = y - (p.y * scale + offsetY);
                if (dx * dx + dy * dy < POINT_RADIUS * POINT_RADIUS) {
                    return id;
                }
            }
        }
        return null;
    };

    // Helper function for point-in-polygon check (Lasso)
    const isPointInLasso = (point, lassoPolygon) => {
        let isInside = false;
        for (let i = 0, j = lassoPolygon.length - 1; i < lassoPolygon.length; j = i++) {
            const xi = lassoPolygon[i].x, yi = lassoPolygon[i].y;
            const xj = lassoPolygon[j].x, yj = lassoPolygon[j].y;
            const intersect = ((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) isInside = !isInside;
        }
        return isInside;
    };

    const handleMouseDown = (e, canvasType) => {
        e.preventDefault();
        const canvas = canvasType === 'svg' ? svgCanvasRef.current : uvCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (isDrawingBoundary && canvasType === 'uv') {
            const newU = Math.max(0, Math.min(1, x / CANVAS_WIDTH));
            const newV = Math.max(0, Math.min(1, 1 - (y / CANVAS_HEIGHT))); // Invert Y for UV coords
            setSensorMap(prev => ({
                ...prev,
                palmBoundary: [...(prev.palmBoundary || []), { u: newU, v: newV }]
            }));
            return;
        }

        if (isDrawingBoundary) {
            return; // Don't do other actions while drawing boundary
        }

        if (isLassoing) {
            setLassoCanvas(canvasType);
            setLassoPoints([{ x, y }]);
            return;
        }

        const clickedPointId = getPointAtCursor(canvas, e, canvasType);

        if (clickedPointId) {
            let newSelectedIds;
            // If the clicked point is already selected, and we are not using Ctrl, we prepare to drag the whole group.
            if (selectedPointIds.has(clickedPointId) && !e.ctrlKey) {
                newSelectedIds = selectedPointIds;
            } else { // Otherwise, we update the selection
                newSelectedIds = new Set(e.ctrlKey ? selectedPointIds : []);
                newSelectedIds.add(clickedPointId);
            }
            setSelectedPointIds(newSelectedIds);

            // Allow dragging only on the UV map
            if (canvasType === 'uv') {
                setIsDragging(true);
                const initialPositions = new Map();
                newSelectedIds.forEach(id => initialPositions.set(id, sensorMap.uvMap[id]));
                setDragStart({ startX: e.clientX, startY: e.clientY, initialPositions });
            }
        } else {
            setSelectedPointIds(new Set());
        }
    };

    const handleMouseMove = (e) => {
        e.preventDefault();
        if (isLassoing && lassoPoints.length > 0) {
            const canvas = lassoCanvas === 'svg' ? svgCanvasRef.current : uvCanvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setLassoPoints(prev => [...prev, { x, y }]);
            return;
        }

        if (isDragging && dragStart) {
            const dx = (e.clientX - dragStart.startX) / CANVAS_WIDTH;
            const dy = (e.clientY - dragStart.startY) / CANVAS_HEIGHT;

            setSensorMap(prevMap => {
                const newUvMap = { ...prevMap.uvMap };
                dragStart.initialPositions.forEach((startPos, id) => {
                    if (newUvMap[id]) {
                        newUvMap[id] = {
                            u: Math.max(0, Math.min(1, startPos.u + dx)),
                            v: Math.max(0, Math.min(1, startPos.v - dy)) // Y is inverted in canvas space
                        };
                    }
                });
                return { ...prevMap, uvMap: newUvMap };
            });
        }
    };

    const handleMouseUp = (e) => {
        e.preventDefault();
        if (isLassoing) {
            // Finalize lasso selection
            const newSelectedIds = new Set(e.ctrlKey ? selectedPointIds : []);
            if (lassoCanvas === 'svg') {
                // Calculate SVG scaling factors again
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                Object.values(sensorMap.svgPoints).forEach(p => {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
                const scaleX = CANVAS_WIDTH / (maxX - minX) * 0.9;
                const scaleY = CANVAS_HEIGHT / (maxY - minY) * 0.9;
                const scale = Math.min(scaleX, scaleY);
                const offsetX = (CANVAS_WIDTH - (maxX - minX) * scale) / 2 - minX * scale;
                const offsetY = (CANVAS_HEIGHT - (maxY - minY) * scale) / 2 - minY * scale;

                Object.entries(sensorMap.svgPoints).forEach(([id, p]) => {
                    const canvasPoint = {
                        x: p.x * scale + offsetX,
                        y: p.y * scale + offsetY
                    };
                    if (isPointInLasso(canvasPoint, lassoPoints)) {
                        newSelectedIds.add(id);
                    }
                });
            } else { // UV Canvas
                Object.entries(sensorMap.uvMap).forEach(([id, p]) => {
                    const canvasPoint = {
                        x: p.u * CANVAS_WIDTH,
                        y: (1 - p.v) * CANVAS_HEIGHT
                    };
                    if (isPointInLasso(canvasPoint, lassoPoints)) {
                        newSelectedIds.add(id);
                    }
                });
            }

            setSelectedPointIds(newSelectedIds);
            setIsLassoing(false);
            setLassoPoints([]);
            setLassoCanvas(null);
            return;
        }

        setIsDragging(false);
        setDragStart(null);
    };

    const handleMirror = (axis) => {
        if (selectedPointIds.size === 0) return;

        setSensorMap(prevMap => {
            const newUvMap = { ...prevMap.uvMap };
            const selectedCoords = Array.from(selectedPointIds).map(id => newUvMap[id]);

            // Find the center of the selected group
            const centerX = selectedCoords.reduce((sum, p) => sum + p.u, 0) / selectedCoords.length;
            const centerY = selectedCoords.reduce((sum, p) => sum + p.v, 0) / selectedCoords.length;

            selectedPointIds.forEach(id => {
                const point = newUvMap[id];
                if (axis === 'horizontal') {
                    const mirroredV = centerY - (point.v - centerY);
                    newUvMap[id] = { ...point, v: mirroredV };
                } else { // vertical
                    const mirroredU = centerX - (point.u - centerX);
                    newUvMap[id] = { ...point, u: mirroredU };
                }
            });
            return { ...prevMap, uvMap: newUvMap };
        });
    };

    const applyRotation = (angleInDegrees) => {
        if (!rotationStart) return;

        const angleInRadians = angleInDegrees * (Math.PI / 180);
        const cosAngle = Math.cos(angleInRadians);
        const sinAngle = Math.sin(angleInRadians);

        setSensorMap(prevMap => {
            const newUvMap = { ...prevMap.uvMap }; // Start with a fresh copy
            const initialCoords = Array.from(rotationStart.initialPositions.values());

            // Find the center (centroid) of the selected group to use as a pivot
            const centerX = initialCoords.reduce((sum, p) => sum + p.u, 0) / initialCoords.length;
            const centerY = initialCoords.reduce((sum, p) => sum + p.v, 0) / initialCoords.length;

            rotationStart.initialPositions.forEach((startPos, id) => {
                if (newUvMap[id]) {
                    // 1. Translate the original point so the pivot is at the origin
                    const translatedU = startPos.u - centerX;
                    const translatedV = startPos.v - centerY;

                    // 2. Rotate the point
                    const rotatedU = translatedU * cosAngle - translatedV * sinAngle;
                    const rotatedV = translatedU * sinAngle + translatedV * cosAngle;

                    // 3. Translate the point back and update the map
                    newUvMap[id] = { u: rotatedU + centerX, v: rotatedV + centerY };
                }
            });
                
            return { ...prevMap, uvMap: newUvMap };
        });
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Necessary to allow dropping
    };

    const handleDropOnUv = (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        if (!id) return;

        const rect = uvCanvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const newU = Math.max(0, Math.min(1, x / CANVAS_WIDTH));
        const newV = Math.max(0, Math.min(1, 1 - (y / CANVAS_HEIGHT)));

        setSensorMap(prevMap => {
            const newUvMap = { ...prevMap.uvMap };
            newUvMap[id] = { u: newU, v: newV };
            return { ...prevMap, uvMap: newUvMap };
        });
    };


    const handleSave = () => {
        if (sensorMap) {
            const jsonString = JSON.stringify(sensorMap, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'hand_sensor_map.json';
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    if (!isVisible) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.mapperContainer}>
                <div className={styles.header}>
                    <h2>Advanced Sensor Mapper</h2>
                    <p>Drag from Left to Right. Ctrl+Click to multi-select. Drag groups on the Right. Use tools to manipulate selections.</p>
                    <div className={styles.toolBar}>
                        <Button onClick={() => setIsLassoing(!isLassoing)} variant={isLassoing ? 'secondary' : 'outline'}>
                            {isLassoing ? 'Disable Lasso' : 'Enable Lasso'}
                        </Button>
                        <Button onClick={() => setIsDrawingBoundary(!isDrawingBoundary)} variant={isDrawingBoundary ? 'secondary' : 'outline'}>
                            {isDrawingBoundary ? 'Finish Boundary' : 'Draw Palm Boundary'}
                        </Button>
                        <Button onClick={() => setSensorMap(p => ({...p, palmBoundary: []}))} variant="destructive" disabled={!sensorMap?.palmBoundary?.length}>
                            Clear Boundary
                        </Button>
                        <Button onClick={() => handleMirror('vertical')} variant="outline" disabled={selectedPointIds.size === 0}>Mirror Vertical</Button>
                        <Button onClick={() => handleMirror('horizontal')} variant="outline" disabled={selectedPointIds.size === 0}>Mirror Horizontal</Button>
                        <div className={styles.sliderContainer}>
                            <label htmlFor="rotation-slider">Rotate</label>
                            <input
                                type="range"
                                id="rotation-slider"
                                min="-180"
                                max="180"
                                defaultValue="0"
                                className={styles.slider}
                                disabled={selectedPointIds.size === 0}
                                onMouseDown={() => {
                                    if (selectedPointIds.size > 0) {
                                        const initialPositions = new Map();
                                        selectedPointIds.forEach(id => initialPositions.set(id, sensorMap.uvMap[id]));
                                        setRotationStart({ initialPositions });
                                    }
                                }}
                                onMouseUp={() => setRotationStart(null)}
                                onChange={(e) => applyRotation(parseInt(e.target.value, 10))}
                            />
                        </div>
                    </div>
                </div>
                <div className={styles.canvases}>
                    <div className={styles.canvasWrapper}>
                        <h3>Source Layout</h3>
                        <canvas
                            ref={svgCanvasRef}
                            width={CANVAS_WIDTH}
                            height={CANVAS_HEIGHT}
                            onMouseDown={(e) => handleMouseDown(e, 'svg')}
                            draggable="true"
                            onDragStart={(e) => {
                                const id = getPointAtCursor(svgCanvasRef.current, e, 'svg');
                                if (id) e.dataTransfer.setData("text/plain", id);
                            }}
                        />
                    </div>
                    <div className={styles.canvasWrapper}>
                        <h3>Destination UV Map</h3>
                        <canvas
                            ref={uvCanvasRef}
                            width={CANVAS_WIDTH}
                            height={CANVAS_HEIGHT}
                            onDragOver={handleDragOver}
                            onDrop={handleDropOnUv}
                            onMouseDown={(e) => handleMouseDown(e, 'uv')}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp} // Stop dragging if mouse leaves canvas
                        />
                    </div>
                </div>
                <div className={styles.footer}>
                    <Button onClick={handleSave} className={styles.button}>Save and Download JSON</Button>
                    <Button onClick={onClose} variant="outline" className={styles.button}>Close</Button>
                </div>
            </div>
        </div>
    );
};

export default SensorMapper;