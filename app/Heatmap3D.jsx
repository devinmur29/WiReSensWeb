'use client'; // IMPORTANT: This directive marks the component as a Client Component

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

const Heatmap3D = ({ nodePositions, data, erasedNodes, cellSize = 3 }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    // --- Defensive check for mountRef ---
    if (!mount) {
      console.error("Heatmap3D: Mount reference is null. Cannot initialize Three.js scene.");
      return;
    }

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    // --- Basic validation for dimensions ---
    if (width <= 0 || height <= 0) {
      console.warn("Heatmap3D: Container has zero or negative dimensions. Skipping Three.js initialization.");
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee); // A light background for better visibility

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 100); // Adjust camera position as needed for your scene size

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mount.innerHTML = ""; // Clear previous canvas
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Enable damping (inertia)
    controls.dampingFactor = 0.05; // How much to damp
    controls.screenSpacePanning = false; // Prevents panning beyond limits, good for fixed scenes
    controls.minDistance = 10; // Minimum zoom distance
    controls.maxDistance = 500; // Maximum zoom distance

    // --- Add lights for better visibility of 3D objects ---
    const ambientLight = new THREE.AmbientLight(0x606060); // Soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Main light source
    directionalLight.position.set(100, 100, 100).normalize();
    scene.add(directionalLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3); // Secondary light
    fillLight.position.set(-100, -100, -100).normalize();
    scene.add(fillLight);

    // --- 1. Calculate Global Min/Max for 3D Data ---
    let globalMin = Infinity;
    let globalMax = -Infinity;

    // --- Defensive check for 'data' prop ---
    if (!Array.isArray(data) || data.length === 0) {
      console.warn("Heatmap3D: 'data' prop is invalid or empty. Using default color range.");
      globalMin = 0;
      globalMax = 4096; // Fallback default
    } else {
      data.forEach(value => {
        if (typeof value === 'number' && !isNaN(value)) {
          globalMin = Math.min(globalMin, value);
          globalMax = Math.max(globalMax, value);
        }
      });
      // Fallback if no valid min/max found in data
      if (globalMin === Infinity) globalMin = 0;
      if (globalMax === -Infinity) globalMax = 4096; // Default max, adjust if your data range is different
    }

    const dataRange = globalMax - globalMin;

    // --- 2. Color Mapping Function for THREE.Color ---
    const getThreeColor = (value) => {
      // Ensure value is a number, fallback to globalMin if invalid
      const safeValue = typeof value === 'number' && !isNaN(value) ? value : globalMin;

      let normalizedValue = 0;
      if (dataRange > 0) {
        normalizedValue = (safeValue - globalMin) / dataRange;
      } else {
        normalizedValue = 0.5; // Neutral if no range (all values same)
      }
      normalizedValue = Math.max(0, Math.min(1, normalizedValue)); // Clamp 0-1

      // Map normalizedValue to a hue.
      // Example: 0 (low value) -> Blue (hue 240)
      //          1 (high value) -> Red (hue 0)
      const hue = (1 - normalizedValue) * 240; // HSL hue from 0 to 240 degrees
      const saturation = 1; // 100% saturation
      const lightness = 0.5; // 50% lightness

      // Create a THREE.Color from HSL values
      const color = new THREE.Color();
      color.setHSL(hue / 360, saturation, lightness); // setHSL expects hue in 0-1 range
      return color;
    };

    // --- Create a group to hold all cubes for easier manipulation ---
    const heatmapGroup = new THREE.Group();
    scene.add(heatmapGroup);

    // --- Iterate and create cubes with dynamic colors ---
    // --- Defensive checks for nodePositions and data lengths ---
    if (!Array.isArray(nodePositions) || nodePositions.length === 0) {
      console.warn("Heatmap3D: 'nodePositions' prop is invalid or empty. No cubes will be rendered.");
    } else if (nodePositions.length !== data.length) {
      console.warn("Heatmap3D: 'nodePositions' and 'data' arrays have different lengths. This may lead to incorrect rendering.");
    } else {
      nodePositions.forEach((pos, i) => {
        const value = data[i];

        // Skip if position is erased or not valid
        // --- More robust check for erasedNodes ---
        const isErased = Array.isArray(erasedNodes) && erasedNodes.includes(i);
        if (isErased) return;

        // --- Validate position object ---
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number' || isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
          console.warn(`Heatmap3D: Invalid position object at index ${i}. Skipping cube.`);
          return;
        }

        // --- Validate value ---
        if (typeof value !== 'number' || isNaN(value)) {
          console.warn(`Heatmap3D: Invalid data value at index ${i}. Skipping cube or using fallback color.`);
          // If you want to render a cube with a default color even if value is bad:
          // const geometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
          // const material = new THREE.MeshBasicMaterial({ color: 0x808080 }); // Gray fallback
          // const cube = new THREE.Mesh(geometry, material);
          // cube.position.set(pos.x, pos.y, pos.z);
          // heatmapGroup.add(cube);
          return; // Skip rendering if value is bad
        }

        const geometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
        const dynamicColor = getThreeColor(value); // Use dynamic color
        const material = new THREE.MeshStandardMaterial({ color: dynamicColor }); // Use MeshStandardMaterial for better lighting interaction
        const cube = new THREE.Mesh(geometry, material);
        cube.position.set(pos.x, pos.y, pos.z); // Use Z from nodePositions for 3D
        heatmapGroup.add(cube); // Add to group
      });
    }

    // --- Animation Loop ---
    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update(); // Only required if controls.enableDamping or controls.autoRotate are set to true
      renderer.render(scene, camera);
    };
    animate();

    // --- Handle window resize ---
    const handleResize = () => {
      if (!mountRef.current) return;
      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;
      renderer.setSize(newWidth, newHeight);
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);


    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(frameId); // Stop animation loop
      window.removeEventListener("resize", handleResize); // Remove resize listener
      controls.dispose(); // Dispose controls
      renderer.dispose(); // Dispose renderer
      // Dispose of geometries and materials in the heatmapGroup
      heatmapGroup.traverse((object) => {
        if (object.isMesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      scene.remove(heatmapGroup); // Remove group from scene
      mount.innerHTML = ""; // Clear previous canvas
    };
  }, [nodePositions, data, erasedNodes, cellSize]); // Dependencies: Re-render if these props change

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", minHeight: "500px", background: "#f0f0f0" }} // Changed background to a lighter color
      className="rounded-xl overflow-hidden shadow"
    />
  );
};

export default Heatmap3D;