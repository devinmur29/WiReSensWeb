import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

const Heatmap3D = ({ nodePositions, data, erasedNodes, cellSize = 3 }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return; // Ensure mountRef is available

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 100; // Adjust camera position as needed for your scene size

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mount.innerHTML = ""; // Clear previous canvas
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Enable damping (inertia)
    controls.dampingFactor = 0.05; // How much to damp

    // --- 1. Calculate Global Min/Max for 3D Data ---
    let globalMin = Infinity;
    let globalMax = -Infinity;

    if (Array.isArray(data)) {
      data.forEach(value => {
        if (typeof value === 'number' && !isNaN(value)) {
          globalMin = Math.min(globalMin, value);
          globalMax = Math.max(globalMax, value);
        }
      });
    }

    // Fallback if no valid min/max found
    if (globalMin === Infinity) globalMin = 0;
    if (globalMax === -Infinity) globalMax = 4096; // Default max, adjust if your data range is different

    const dataRange = globalMax - globalMin;

    // --- 2. Color Mapping Function for THREE.Color ---
    const getThreeColor = (value) => {
      let normalizedValue = 0;
      if (dataRange > 0) {
        normalizedValue = (value - globalMin) / dataRange;
      } else {
        normalizedValue = 0.5; // Neutral if no range (all values same)
      }
      normalizedValue = Math.max(0, Math.min(1, normalizedValue)); // Clamp 0-1

      // Map normalizedValue to a hue.
      // Example: 0 (low value) -> Blue (hue 240)
      //          1 (high value) -> Red (hue 0)
      const hue = (1 - normalizedValue) * 240; // HSL hue from 0 to 240
      const saturation = 1; // 100% saturation
      const lightness = 0.5; // 50% lightness

      // Create a THREE.Color from HSL values
      const color = new THREE.Color();
      color.setHSL(hue / 360, saturation, lightness); // setHSL expects hue in 0-1 range
      return color;
    };

    // --- Add a simple light source for better visibility ---
    const ambientLight = new THREE.AmbientLight(0x404040); // soft white light
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);


    // --- Iterate and create cubes with dynamic colors ---
    data.forEach((value, i) => {
      const pos = nodePositions[i];
      // Skip if position is erased or not valid
      if (!pos || (erasedNodes && erasedNodes.includes(i))) return; // Assuming erasedNodes contains indices

      const geometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);

      // Get the dynamic color based on the value
      const dynamicColor = getThreeColor(value);

      const material = new THREE.MeshBasicMaterial({ color: dynamicColor }); // Use dynamic color
      const cube = new THREE.Mesh(geometry, material);
      cube.position.set(pos.x, pos.y, pos.z); // Use Z from nodePositions for 3D
      scene.add(cube);
    });

    // --- Animation Loop ---
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update(); // Only required if controls.enableDamping or controls.autoRotate are set to true
      renderer.render(scene, camera);
    };
    animate();

    // --- Cleanup ---
    return () => {
      controls.dispose(); // Dispose controls
      renderer.dispose(); // Dispose renderer
      mount.innerHTML = ""; // Clear previous canvas
    };
  }, [nodePositions, data, erasedNodes, cellSize]); // Dependencies: Re-render if these props change

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: "100%", minHeight: "500px", background: "white" }}
      className="rounded-xl overflow-hidden shadow"
    />
  );
};

export default Heatmap3D;