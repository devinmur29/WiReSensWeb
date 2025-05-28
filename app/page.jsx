"use client";
import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import dynamic from "next/dynamic"; // Import dynamic for client-side loading

// Dynamically import InteractiveHeatmap3D with ssr: false
// This ensures the component is only rendered on the client side,
// preventing 'document is not defined' and useImperativeHandle errors during SSR.
const InteractiveHeatmap3D = dynamic(
  () => import("./interactiveheatmap"),
  { ssr: false }
);

// FIX 2: Update path to be relative to app/page.jsx
import Toolbar from "./toolbar";
// FIX 3: Update path to be relative to app/page.module.css
import styles from "./page.module.css";
// FIX 4: Update path to be relative to app/constants
import defaultWiReSensConfig from "./constants";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
// FIX 5: Update path for AppSidebar to be relative to components/app-sidebar
import { AppSidebar } from "../components/app-sidebar";
import { AlignVerticalJustifyEnd } from "lucide-react"; // Imported but not used
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Function to generate a 2D array (single layer) for a sensor
// Output will be a 2D array: array[rows][cols]
const generateRandomArray = (rows, cols) => {
  const array = [];
  for (let r = 0; r < rows; r++) { // Iterate rows
    const row = [];
    for (let c = 0; c < cols; c++) { // Iterate columns
      row.push(0); // Initialize with 0
    }
    array.push(row);
  }
  return array;
};

const Home = () => {
  const [WiSensConfig, setWiSensConfig] = useState(defaultWiReSensConfig);
  const [selectMode, setSelectMode] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [adcMode, setAdcMode] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [socket, setSocket] = useState(null);
  const interactiveHeatmapRefs = useRef({}); // Store refs dynamically
  const hiddenFileInputRefs = useRef({});
  const hiddenFileInput2Refs = useRef({});
  const sensorDivRefs = useRef({});
  const [open, setOpen] = useState(false);
  const [calibrating, setCalibrating] = useState(false);

  const defaultSensors = {};
  const defaultDims = {};
  
  // Define the desired high definition dimensions
  const HIGH_DEF_COLS = 64; 
  const HIGH_DEF_ROWS = 64; 

  defaultWiReSensConfig.sensors.forEach((sensorConfig) => {
    // Override calculated dimensions with high definition values
    const numReadWires = HIGH_DEF_ROWS;
    const numGroundWires = HIGH_DEF_COLS;

    defaultSensors[sensorConfig.id] = generateRandomArray(
      numReadWires, // rows
      numGroundWires // cols
    );
    // Add numLayers to dim, assuming 1 layer for now: [cols, rows, layers]
    defaultDims[sensorConfig.id] = [numGroundWires, numReadWires, 1];
    
    // Ensure refs are initialized for each sensor
    interactiveHeatmapRefs.current[sensorConfig.id] = interactiveHeatmapRefs.current[sensorConfig.id] || React.createRef();
    hiddenFileInputRefs.current[sensorConfig.id] = hiddenFileInputRefs.current[sensorConfig.id] || React.createRef();
    hiddenFileInput2Refs.current[sensorConfig.id] = hiddenFileInput2Refs.current[sensorConfig.id] || React.createRef();
    sensorDivRefs.current[sensorConfig.id] = sensorDivRefs.current[sensorConfig.id] || React.createRef();
  });

  const [sensors, setSensors] = useState(defaultSensors);
  // Initialize sensorDims with the high definition values for all sensors
  const [sensorDims, setSensorDims] = useState(defaultDims);
  // Correctly initialize acks based on the number of sensors initially
  const [acks, setAcks] = useState(Array(defaultWiReSensConfig.sensors.length).fill(false));

  // Ref to store the last time sensor data was processed for throttling
  const lastSensorDataUpdateTime = useRef(0);
  // Throttle delay in milliseconds (e.g., 50ms means max 20 updates per second)
  const THROTTLE_DELAY_MS = 50;


  const onSelectNodesClick = () => {
    setSelectMode(!selectMode);
  };

  const onEraseModeClick = () => {
    setEraseMode(!eraseMode);
  };

  const onAdcModeClick = () => {
    setAdcMode(!adcMode);
  };

  const updateSensorObjects = (config) => {
    const updatedSensors = { ...sensors };
    const updatedDims = { ...sensorDims };
    config.sensors.forEach((sensorConfig) => {
      // Override calculated dimensions with high definition values for updates
      const numReadWires = HIGH_DEF_ROWS;
      const numGroundWires = HIGH_DEF_COLS;

      // Only re-initialize if it's a new device or dimensions are changing to the high-def
      if (
        !updatedSensors[sensorConfig.id] ||
        updatedDims[sensorConfig.id][0] !== numGroundWires || // Compare numCols
        updatedDims[sensorConfig.id][1] !== numReadWires    // Compare numRows
      ) {
        console.log("Updating sensor ", sensorConfig.id);
        updatedSensors[sensorConfig.id] = generateRandomArray(
          numReadWires, // rows
          numGroundWires // cols
        );
        // Add numLayers to dim for updated config
        updatedDims[sensorConfig.id] = [numGroundWires, numReadWires, 1]; // [cols, rows, layers]
      }
      // Ensure refs exist for newly added/updated sensors
      interactiveHeatmapRefs.current[sensorConfig.id] = interactiveHeatmapRefs.current[sensorConfig.id] || React.createRef();
      hiddenFileInputRefs.current[sensorConfig.id] = hiddenFileInputRefs.current[sensorConfig.id] || React.createRef();
      hiddenFileInput2Refs.current[sensorConfig.id] = hiddenFileInput2Refs.current[sensorConfig.id] || React.createRef();
      sensorDivRefs.current[sensorConfig.id] = sensorDivRefs.current[sensorConfig.id] || React.createRef();
    });
    setSensorDims(updatedDims);
    setSensors(updatedSensors);
    setWiSensConfig(config);
    // Reset acks based on the new configuration's sensor count
    setAcks(Array(config.sensors.length).fill(false));
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const config = JSON.parse(e.target.result);
        updateSensorObjects(config);
      };
      reader.readAsText(file);
    }
  };

  useEffect(() => {
    const localIp = WiSensConfig.vizOptions?.localIp // Use optional chaining for safety
      ? WiSensConfig.vizOptions.localIp
      : "127.0.0.1";

    const newSocket = io(`http://${localIp}:5328`);

    newSocket.on("connect", () => {
      console.log("Connected to server");
    });

    newSocket.on("disconnect", () => {
      console.log("Disconnected from server");
    });

    newSocket.on("sensor_data", (data) => {
      const currentTime = Date.now();
      // Throttle sensor data updates
      if (currentTime - lastSensorDataUpdateTime.current < THROTTLE_DELAY_MS) {
        return; // Skip update if too soon
      }
      lastSensorDataUpdateTime.current = currentTime;

      const dataObj = JSON.parse(data); // This is expected to be an object like { "sensorId1": [[...]], "sensorId2": [[...]] }
      console.log("Received sensor_data:", dataObj); // LOGGING INCOMING DATA

      setSensors(prevSensors => {
        const updatedSensors = { ...prevSensors };
        for (const sensorId in dataObj) {
          const incomingLayerData = dataObj[sensorId]; // This is the 2D array from backend
          const incomingRows = incomingLayerData.length;
          const incomingCols = incomingLayerData[0] ? incomingLayerData[0].length : 0;

          const newSensorData = generateRandomArray(HIGH_DEF_ROWS, HIGH_DEF_COLS); // Create target high-def grid

          // Perform Bilinear Interpolation
          for (let r = 0; r < HIGH_DEF_ROWS; r++) {
            for (let c = 0; c < HIGH_DEF_COLS; c++) {
              // Calculate floating-point coordinates in the source grid
              const srcX = (c / (HIGH_DEF_COLS - 1)) * (incomingCols - 1);
              const srcY = (r / (HIGH_DEF_ROWS - 1)) * (incomingRows - 1);

              // Get the integer coordinates of the top-left pixel
              const x1 = Math.floor(srcX);
              const y1 = Math.floor(srcY);

              // Get the integer coordinates of the bottom-right pixel
              const x2 = Math.min(x1 + 1, incomingCols - 1);
              const y2 = Math.min(y1 + 1, incomingRows - 1);

              // Get the fractional parts
              const fx = srcX - x1;
              const fy = srcY - y1;

              // Get the values of the four surrounding pixels
              const q11 = incomingLayerData[y1]?.[x1] || 0;
              const q12 = incomingLayerData[y1]?.[x2] || 0;
              const q21 = incomingLayerData[y2]?.[x1] || 0;
              const q22 = incomingLayerData[y2]?.[x2] || 0;

              // Perform interpolation
              const interpolatedValue =
                q11 * (1 - fx) * (1 - fy) +
                q12 * fx * (1 - fy) +
                q21 * (1 - fx) * fy +
                q22 * fx * fy;

              newSensorData[r][c] = interpolatedValue;
            }
          }
          updatedSensors[sensorId] = newSensorData;
        }
        console.log("Updated sensors state (interpolated):", updatedSensors); // LOGGING UPDATED STATE
        return updatedSensors;
      });
    });

    newSocket.on("step", (count) => {
      setStepCount(count);
    });

    newSocket.on("connection_status", (msg) => {
      let status = msg["connected"];
      let id = msg["id"];
      console.log("Connection Status Message Received");
      if (status) {
        const index = WiSensConfig.sensors.findIndex(
          (sensor) => sensor.id === id
        );
        // Safely update acks state to avoid direct mutation and ensure index exists
        setAcks(prevAcks => {
          const updatedAcks = [...prevAcks];
          if (index !== -1 && index < updatedAcks.length) {
            updatedAcks[index] = true;
          }
          return updatedAcks;
        });
      }
    });

    newSocket.on("calibration_done", (data) => {
      console.log("Calibration Done");
      let sensor_id = data.id;
      let resistance = data.value;
      setCalibrating(false); // End calibration state regardless of update
      // Update WiSensConfig using a functional update to ensure latest state
      setWiSensConfig((prevConfig) => {
        const foundDevice = prevConfig.sensors.find(
          (sensor) => sensor.id === sensor_id
        );

        if (foundDevice) {
          const newDevice = { ...foundDevice, resistance };
          const updatedSensors = prevConfig.sensors
            .map((sensor) => (sensor.id === sensor_id ? newDevice : sensor))
            .sort((a, b) => a.id - b.id); // Re-sort if order matters
          return { ...prevConfig, sensors: updatedSensors };
        }
        return prevConfig;
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [WiSensConfig.vizOptions?.localIp]); // Dependency only on the relevant config part

  useEffect(() => {
    // Check if all acks are true IF there are sensors configured
    if (WiSensConfig.sensors.length > 0 && acks.every((ack) => ack === true)) {
      setConnecting(false);
    }
  }, [acks, WiSensConfig.sensors.length]); // Add WiSensConfig.sensors.length to dependency array

  const handleClick = (hiddenFileRef) => {
    hiddenFileRef.current.click();
  };

  const onConnectDevices = () => {
    // If all sensors are connected based on current config, stop. Else, start.
    if (WiSensConfig.sensors.length > 0 && acks.every((ack) => ack === true)) {
      if (socket) socket.emit("stopViz");
      setAcks(Array(WiSensConfig.sensors.length).fill(false)); // Reset acks for next connection attempt
    } else if (!connecting && socket) { // Ensure socket exists before emitting
      socket.emit("startViz", WiSensConfig);
      setConnecting(true);
    }
  };

  const onCalibrate = (sensorId) => {
    setCalibrating(true);
    if (socket) socket.emit("calibrate", sensorId);
  };

  const onPlay = (settings) => {
    console.log("start replay");
    if (socket) socket.emit("replay", settings);
  };

  const onPause = () => {
    console.log("stop replay");
    if (socket) socket.emit("stopViz");
  };

  const toggleDrawer = () => setOpen(!open);

  const handleDeleteDevice = (id) => {
    setWiSensConfig((prevConfig) => {
      const newSensors = prevConfig.sensors.filter((device) => device.id !== id);
      return { ...prevConfig, sensors: newSensors };
    });
    // Remove data and dims for the deleted device
    setSensors((prevSensors) => {
      const newSensors = { ...prevSensors };
      delete newSensors[id];
      return newSensors;
    });
    setSensorDims((prevDims) => {
      const newDims = { ...prevDims };
      delete newDims[id];
      return newDims;
    });
    // Update acks array length
    setAcks(prevAcks => prevAcks.slice(0, prevAcks.length - 1)); 
  };

  const handleAddDevice = () => {
    const newId = WiSensConfig.sensors.length > 0 ? Math.max(...WiSensConfig.sensors.map(s => s.id)) + 1 : 1;
    const newDevice = {
      id: newId,
      protocol: "ble",
      serialPort: "",
      deviceName: `New Device ${newId}`,
      startCoord: [0, 0],
      endCoord: [7, 7], // Default to 8x8 in config, but will be overridden for visualization
      resistance: 1000,
      intermittent: { enabled: false, p: 0, d: 0 },
      outlineImage: "",
    };

    setWiSensConfig((prevConfig) => {
      const updatedSensors = [...prevConfig.sensors, newDevice].sort((a, b) => a.id - b.id);
      return { ...prevConfig, sensors: updatedSensors };
    });

    // Initialize new sensor's data and dims with high definition
    const numReadWires = HIGH_DEF_ROWS;
    const numGroundWires = HIGH_DEF_COLS;
    setSensors((prev) => ({
      ...prev,
      [newDevice.id]: generateRandomArray(numReadWires, numGroundWires),
    }));
    setSensorDims((prev) => ({
      ...prev,
      [newDevice.id]: [numGroundWires, numReadWires, 1], // [cols, rows, layers]
    }));
    // Ensure refs are created for the new device
    interactiveHeatmapRefs.current[newDevice.id] = React.createRef();
    hiddenFileInputRefs.current[newDevice.id] = React.createRef();
    hiddenFileInput2Refs.current[newDevice.id] = React.createRef();
    sensorDivRefs.current[newDevice.id] = React.createRef();
    // Expand acks array for the new device
    setAcks(prevAcks => [...prevAcks, false]);
  };


  return (
    <SidebarProvider defaultOpen={false} open={open}>
      <div className={styles.pageDiv}>
        <Toolbar
          onPlay={onPlay}
          onPause={onPause}
          config={WiSensConfig}
          onConnectDevices={onConnectDevices}
          onSave={updateSensorObjects}
          onLoadConfig={handleFileChange}
          onSelectNodes={onSelectNodesClick}
          onRemoveNodes={onEraseModeClick}
          onAdcMode={onAdcModeClick}
          toggleDrawer={toggleDrawer}
          connected={acks.every((ack) => ack === true)}
          connecting={connecting}
          eraseMode={eraseMode}
          selectMode={selectMode}
          adcMode={adcMode}
        ></Toolbar>
        <div
          style={{
            paddingLeft: "10%",
            paddingTop: "20px",
            fontSize: "large",
          }}
        >
          {/* <b>{`Step Count: ${stepCount}`}</b> */}
        </div>
        <div className={styles.sensorDiv}>
          {/* Use sensorConfig directly in map for clarity and correct property access */}
          {WiSensConfig.sensors.map((sensorConfig) => (
            <div key={sensorConfig.id} className={styles.heatmapContainer}>
              <div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <button
                          disabled={calibrating}
                          className={styles.toolbarButton}
                          onClick={() => {
                            onCalibrate(sensorConfig.id); // Use sensorConfig.id
                          }}
                        >
                          Calibrate
                        </button>
                      </span>
                    </TooltipTrigger>
                    {calibrating && (
                      <TooltipContent>Device is Calibrating</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <button
                  className={styles.toolbarButton}
                  onClick={() => {
                    // Ensure the ref exists before calling methods
                    if (interactiveHeatmapRefs.current[sensorConfig.id]?.current) {
                      interactiveHeatmapRefs.current[sensorConfig.id].current.setShape();
                    }
                  }}
                >
                  Toggle Shape
                </button>
                <button
                  className={styles.toolbarButton}
                  onClick={() => {
                    if (interactiveHeatmapRefs.current[sensorConfig.id]?.current) {
                      interactiveHeatmapRefs.current[sensorConfig.id].current.saveLayout();
                    }
                  }}
                >
                  Save Layout
                </button>
                <button
                  className={styles.toolbarButton}
                  onClick={() => {
                    handleClick(hiddenFileInputRefs.current[sensorConfig.id]);
                  }}
                >
                  Load Layout
                </button>
                <input
                  type="file"
                  ref={hiddenFileInputRefs.current[sensorConfig.id]}
                  onChange={(event) => {
                    if (interactiveHeatmapRefs.current[sensorConfig.id]?.current) {
                      interactiveHeatmapRefs.current[sensorConfig.id].current.loadLayout(event);
                    }
                  }}
                  style={{ display: "none" }}
                />
                <button
                  className={styles.toolbarButton}
                  onClick={() => {
                    handleClick(hiddenFileInput2Refs.current[sensorConfig.id]);
                  }}
                >
                  Upload Image
                </button>
                <input
                  type="file"
                  ref={hiddenFileInput2Refs.current[sensorConfig.id]}
                  onChange={(event) => {
                    if (interactiveHeatmapRefs.current[sensorConfig.id]?.current) {
                      interactiveHeatmapRefs.current[sensorConfig.id].current.uploadBackgroundImage(event);
                    }
                  }}
                  style={{ display: "none" }}
                />
                <div
                  className={styles.sensorTitle}
                >{`${sensorConfig.deviceName}`}</div>
              </div>
              <div
                ref={sensorDivRefs.current[sensorConfig.id]}
                className={`${styles.interactiveHeatmapDiv} ${styles.noselect}`}
              >
                {/* FIX 1 & 3: Use InteractiveHeatmap3D and wrap data in an array for single layer */}
                {/* Also, ensure sensors[sensorConfig.id] and sensorDims[sensorConfig.id] exist before rendering */}
                {sensors[sensorConfig.id] && sensorDims[sensorConfig.id] ? (
                  <InteractiveHeatmap3D
                    ref={interactiveHeatmapRefs.current[sensorConfig.id]}
                    data={[sensors[sensorConfig.id]]} // Wrap 2D data in an array for 3D component
                    dim={sensorDims[sensorConfig.id]} // Now correctly [cols, rows, 1]
                    sensorDivRef={sensorDivRefs.current[sensorConfig.id]}
                    pitch={WiSensConfig.vizOptions.pitch}
                    selectMode={selectMode}
                    eraseMode={eraseMode}
                    setSelectMode={setSelectMode}
                    showADC={adcMode}
                  />
                ) : (
                  <div>Loading sensor data...</div> // Fallback while data is not ready
                )}
              </div>
            </div>
          ))}
          {/* Add a button for adding new devices (if not already handled in AppSidebar) */}
           {/* Removed Add New Device button as requested */}
        </div>
      </div>
      <AppSidebar
        Config={WiSensConfig}
        handleDeleteDevice={handleDeleteDevice}
        updateSensorObjects={updateSensorObjects}
        socket={socket}
        connected={acks.every((ack) => ack === true)}
        handleAddDevice={handleAddDevice} // Pass handleAddDevice to AppSidebar
      />
    </SidebarProvider>
  );
};

export default Home;
