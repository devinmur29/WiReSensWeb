// page.jsx
"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import dynamic from "next/dynamic";

// Import both heatmap components after you've renamed them
// Adjust paths based on where you put them (e.g., in a 'components' folder)
// FIX: Ensure dynamic imports correctly target the default export
const InteractiveHeatmap2D = dynamic(
  () => import("./interactiveheatmap.jsx").then(mod => {
    console.log('InteractiveHeatmap2D mod.default:', mod.default); // Debugging line
    return mod.default;
  }),
  { ssr: false }
);
const InteractiveHeatmap3D = dynamic(
  () => import("./interactiveheatmap_3D.jsx").then(mod => {
    console.log('InteractiveHeatmap3D mod.default:', mod.default); // Debugging line
    return mod.default;
  }),
  { ssr: false }
);

import Toolbar from "./toolbar"; // Your existing toolbar
import styles from "./page.module.css";
import defaultWiReSensConfig from "./constants";
import { Button } from "@/components/ui/button"; // From your 3D code
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"; // From your 3D code
import { AppSidebar } from "../components/app-sidebar"; // From your 3D code
import { AlignVerticalJustifyEnd } from "lucide-react"; // From your 3D code
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"; // From your 3D code

// Constants for 3D specific dimensions
const HIGH_DEF_COLS = 64;
const HIGH_DEF_ROWS = 64;

const generateRandomArray = (rows, cols) => {
  const array = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(0);
    }
    array.push(row);
  }
  return array;
};

const Home = () => {
  // NEW STATE FOR TOGGLE
  const [is3DMode, setIs3DMode] = useState(false); // Start in 2D mode by default? Or based on config?

  const [WiSensConfig, setWiSensConfig] = useState(defaultWiReSensConfig);
  const [selectMode, setSelectMode] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [adcMode, setAdcMode] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [socket, setSocket] = useState(null);
  const interactiveHeatmapRefs = useRef({});
  const hiddenFileInputRefs = useRef({});
  const hiddenFileInputConfigRefs = useRef({}); // Only for 3D's specific config loading
  const hiddenFileInput2Refs = useRef({});
  const sensorDivRefs = useRef({});
  const [open, setOpen] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [loadedLayouts, setLoadedLayouts] = useState({}); // From 3D code

  // FIX: Define acks state here
  const initialAcksLength = Array.isArray(defaultWiReSensConfig.sensors) ? defaultWiReSensConfig.sensors.length : 0;
  const [acks, setAcks] = useState(Array(initialAcksLength).fill(false));

  // FIX: Declare sensors and sensorDims state variables
  // Initialize them with empty objects, as their content will be populated
  // by the useEffect below based on WiSensConfig.sensors and is3DMode.
  const [sensors, setSensors] = useState({});
  const [sensorDims, setSensorDims] = useState({});

  // Initialize refs based on current WiSensConfig and mode (this needs to be dynamic)
  useEffect(() => {
    const currentDefaultSensors = {};
    const currentDefaultDims = {};

    if (WiSensConfig && Array.isArray(WiSensConfig.sensors)) {
      WiSensConfig.sensors.forEach((sensorConfig) => {
        let numReadWires, numGroundWires;
        if (is3DMode) {
          numReadWires = HIGH_DEF_ROWS;
          numGroundWires = HIGH_DEF_COLS;
          currentDefaultDims[sensorConfig.id] = [numGroundWires, numReadWires, 1]; // 3D dim
        } else {
          numReadWires = sensorConfig.endCoord[0] - sensorConfig.startCoord[0] + 1;
          numGroundWires = sensorConfig.endCoord[1] - sensorConfig.startCoord[1] + 1;
          currentDefaultDims[sensorConfig.id] = [numReadWires, numGroundWires]; // 2D dim
        }
        currentDefaultSensors[sensorConfig.id] = generateRandomArray(
          numReadWires,
          numGroundWires
        );
        interactiveHeatmapRefs.current[sensorConfig.id] = interactiveHeatmapRefs.current[sensorConfig.id] || React.createRef();
        hiddenFileInputRefs.current[sensorConfig.id] = hiddenFileInputRefs.current[sensorConfig.id] || React.createRef();
        hiddenFileInput2Refs.current[sensorConfig.id] = hiddenFileInput2Refs.current[sensorConfig.id] || React.createRef();
        sensorDivRefs.current[sensorConfig.id] = sensorDivRefs.current[sensorConfig.id] || React.createRef();

        // Only create config ref if it's the main config (from 3D)
        if (is3DMode && !hiddenFileInputConfigRefs.current['mainConfig']) {
          hiddenFileInputConfigRefs.current['mainConfig'] = React.createRef();
        }
      });
    } else {
      console.warn("WiSensConfig.sensors is undefined or not an array. Initializing with empty sensor data.");
    }

    // Set the state here
    setSensors(currentDefaultSensors);
    setSensorDims(currentDefaultDims);
    // Ensure acks state is also updated if config changes, as its length depends on WiSensConfig.sensors
    setAcks(Array(Array.isArray(WiSensConfig.sensors) ? WiSensConfig.sensors.length : 0).fill(false));
  }, [is3DMode, WiSensConfig.sensors]); // Added WiSensConfig.sensors to dependencies

  const lastSensorDataUpdateTime = useRef(0);
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

  const toggleHeatmapMode = useCallback(() => {
    setIs3DMode(prevMode => {
      const newMode = !prevMode;
      console.log(`Heatmap mode toggled to: ${newMode ? '3D' : '2D'}`);
      return newMode;
    });
    // When switching modes, clear current sensor data and dims
    // The useEffect above will re-initialize them based on the new mode
    setSensors({});
    setSensorDims({});
    setAcks(Array(Array.isArray(WiSensConfig.sensors) ? WiSensConfig.sensors.length : 0).fill(false)); // Reset acks
  }, [WiSensConfig.sensors]);

  const updateSensorObjects = (config) => {
    if (!config || !Array.isArray(config.sensors)) {
      console.error("updateSensorObjects: Invalid configuration provided. Expected config.sensors to be an array.");
      return;
    }

    const updatedSensors = {};
    const updatedDims = {};
    const newAcksLength = config.sensors.length;

    config.sensors.forEach((sensorConfig) => {
      let numReadWires, numGroundWires;
      if (is3DMode) {
        numReadWires = HIGH_DEF_ROWS;
        numGroundWires = HIGH_DEF_COLS;
        updatedDims[sensorConfig.id] = [numGroundWires, numReadWires, 1]; // 3D dim
      } else {
        numReadWires = sensorConfig.endCoord[0] - sensorConfig.startCoord[0] + 1;
        numGroundWires = sensorConfig.endCoord[1] - sensorConfig.startCoord[1] + 1;
        updatedDims[sensorConfig.id] = [numReadWires, numGroundWires]; // 2D dim
      }
      updatedSensors[sensorConfig.id] = generateRandomArray(
        numReadWires,
        numGroundWires
      );

      // Ensure refs exist for new/updated sensors
      if (!interactiveHeatmapRefs.current[sensorConfig.id]) {
        interactiveHeatmapRefs.current[sensorConfig.id] = React.createRef();
      }
      if (!hiddenFileInputRefs.current[sensorConfig.id]) {
        hiddenFileInputRefs.current[sensorConfig.id] = React.createRef();
      }
      if (!hiddenFileInput2Refs.current[sensorConfig.id]) {
        hiddenFileInput2Refs.current[sensorConfig.id] = React.createRef();
      }
      if (!sensorDivRefs.current[sensorConfig.id]) {
        sensorDivRefs.current[sensorConfig.id] = React.createRef();
      }
      // Only create config ref if it's the main config (from 3D)
      if (is3DMode && !hiddenFileInputConfigRefs.current['mainConfig']) {
        hiddenFileInputConfigRefs.current['mainConfig'] = React.createRef();
      }
    });

    setSensorDims(updatedDims);
    setSensors(updatedSensors);
    setWiSensConfig(config);
    setAcks(Array(newAcksLength).fill(false));
  };

  const handleConfigFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsedConfig = JSON.parse(e.target.result);
          if (parsedConfig && Array.isArray(parsedConfig.sensors)) {
            updateSensorObjects(parsedConfig);
            console.log("Main configuration loaded successfully.");
          } else {
            console.error("Error: Parsed configuration file does not have the expected 'sensors' array.");
            alert("Failed to parse configuration file: Missing or invalid 'sensors' array.");
          }
        } catch (error) {
          console.error("Error parsing config file:", error);
          alert("Failed to parse configuration file. Please ensure it's valid JSON.");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleLayoutFileChange = (event, sensorId) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loadedLayoutData = JSON.parse(e.target.result);
        if (is3DMode) { // Specific check for 3D layout structure
          if (loadedLayoutData.cellPositions && loadedLayoutData.erasedNodes !== undefined) {
              setLoadedLayouts(prev => ({
                  ...prev,
                  [sensorId]: loadedLayoutData
              }));
              console.log(`Layout data for sensor ${sensorId} queued.`);
          } else {
              console.error("Error: Parsed layout file does not have the expected 'cellPositions' or 'erasedNodes'.");
              alert("Failed to parse layout file. Please ensure it's a valid layout JSON for 3D.");
          }
        } else { // 2D layout structure might be different, or handled within InteractiveHeatmap2D
          if (interactiveHeatmapRefs.current[sensorId]?.current) {
            interactiveHeatmapRefs.current[sensorId].current.loadLayout(event); // Assume 2D component handles event
          } else {
            console.warn(`Cannot load layout for sensor ${sensorId}: interactiveHeatmapRef is not ready (2D mode).`);
          }
        }
      } catch (error) {
        console.error("Error parsing layout file:", error);
        alert("Failed to parse layout file. Please ensure it's valid JSON.");
      }
    };
    reader.readAsText(file);
  };


  useEffect(() => {
    const localIp = WiSensConfig.vizOptions?.localIp
      ? WiSensConfig.vizOptions.localIp
      : "127.0.0.1";

    // FIX: Add explicit transports to the Socket.IO client options
    const newSocket = io(`http://${localIp}:5328`, {
      transports: ['websocket', 'polling'], // Prioritize websocket, then fallback to polling
      jsonp: false // Disable JSONP unless specifically needed
    });

    newSocket.on("connect", () => {
      console.log("Connected to server");
    });

    newSocket.on("disconnect", () => {
      console.log("Disconnected from server");
    });

    newSocket.on("sensor_data", (data) => {
      const currentTime = Date.now();
      if (currentTime - lastSensorDataUpdateTime.current < THROTTLE_DELAY_MS) {
        return;
      }
      lastSensorDataUpdateTime.current = currentTime;

      let dataObj;
      try {
        dataObj = JSON.parse(data);
      } catch (error) {
        console.error("Error parsing sensor_data JSON:", error);
        return;
      }

      setSensors(prevSensors => {
        const updatedSensors = { ...prevSensors };
        for (const sensorId in dataObj) {
          const incomingLayerData = dataObj[sensorId];
          if (!Array.isArray(incomingLayerData) || incomingLayerData.length === 0) {
            console.warn(`Sensor data for ID ${sensorId} is malformed or empty.`);
            continue;
          }

          if (is3DMode) {
            const incomingRows = incomingLayerData.length;
            const incomingCols = incomingLayerData[0] ? incomingLayerData[0].length : 0;
            const newSensorData = generateRandomArray(HIGH_DEF_ROWS, HIGH_DEF_COLS);

            for (let r = 0; r < HIGH_DEF_ROWS; r++) {
              for (let c = 0; c < HIGH_DEF_COLS; c++) {
                const srcX = (c / (HIGH_DEF_COLS - 1)) * (incomingCols - 1);
                const srcY = (r / (HIGH_DEF_ROWS - 1)) * (incomingRows - 1);

                const x1 = Math.floor(srcX);
                const y1 = Math.floor(srcY);

                const x2 = Math.min(x1 + 1, incomingCols - 1);
                const y2 = Math.min(y1 + 1, incomingRows - 1);

                const fx = srcX - x1;
                const fy = srcY - y1;

                const q11 = (incomingLayerData[y1] && incomingLayerData[y1][x1] !== undefined) ? incomingLayerData[y1][x1] : 0;
                const q12 = (incomingLayerData[y1] && incomingLayerData[y1][x2] !== undefined) ? incomingLayerData[y1][x2] : 0;
                const q21 = (incomingLayerData[y2] && incomingLayerData[y2][x1] !== undefined) ? incomingLayerData[y2][x1] : 0;
                const q22 = (incomingLayerData[y2] && incomingLayerData[y2][x2] !== undefined) ? incomingLayerData[y2][x2] : 0;

                const interpolatedValue =
                  q11 * (1 - fx) * (1 - fy) +
                  q12 * fx * (1 - fy) +
                  q21 * (1 - fx) * fy +
                  q22 * fx * fy;

                newSensorData[r][c] = interpolatedValue;
              }
            }
            updatedSensors[sensorId] = newSensorData;
          } else { // 2D mode, direct assignment
            updatedSensors[sensorId] = incomingLayerData;
          }
        }
        return updatedSensors;
      });
    });

    newSocket.on("step", (count) => {
      setStepCount(count);
    });

    newSocket.on("connection_status", (msg) => {
      if (!msg || typeof msg.connected === 'undefined' || typeof msg.id === 'undefined') {
        console.warn("Received malformed connection_status message:", msg);
        return;
      }
      let status = msg["connected"];
      let id = msg["id"];
      console.log("Connection Status Message Received");
      if (status) {
        const index = Array.isArray(WiSensConfig.sensors) ? WiSensConfig.sensors.findIndex(
          (sensor) => sensor.id === id
        ) : -1;
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
      if (!data || typeof data.id === 'undefined' || typeof data.value === 'undefined') {
        console.warn("Received malformed calibration_done message:", data);
        return;
      }
      console.log("Calibration Done");
      let sensor_id = data.id;
      let resistance = data.value;
      setCalibrating(false);
      setWiSensConfig((prevConfig) => {
        if (!prevConfig || !Array.isArray(prevConfig.sensors)) {
          console.warn("Calibration done received, but WiSensConfig.sensors is not an array.");
          return prevConfig;
        }

        const foundDevice = prevConfig.sensors.find(
          (sensor) => sensor.id === sensor_id
        );

        if (foundDevice) {
          const newDevice = { ...foundDevice, resistance };
          const updatedSensors = prevConfig.sensors
            .map((sensor) => (sensor.id === sensor_id ? newDevice : sensor))
            .sort((a, b) => a.id - b.id);
          return { ...prevConfig, sensors: updatedSensors };
        }
        return prevConfig;
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [WiSensConfig.vizOptions?.localIp, WiSensConfig.sensors, is3DMode]);

  useEffect(() => {
    if (Array.isArray(WiSensConfig.sensors) && WiSensConfig.sensors.length > 0 && acks.every((ack) => ack === true)) {
      setConnecting(false);
    }
  }, [acks, WiSensConfig.sensors.length, WiSensConfig.sensors]);


  const handleClick = (hiddenFileRef) => {
    if (hiddenFileRef && hiddenFileRef.current) {
      hiddenFileRef.current.click();
    } else {
      console.warn("Attempted to click a hidden file input, but the ref is not set.");
    }
  };

  const onConnectDevices = () => {
    if (Array.isArray(WiSensConfig.sensors) && WiSensConfig.sensors.length > 0 && acks.every((ack) => ack === true)) {
      if (socket) socket.emit("stopViz");
      setAcks(Array(WiSensConfig.sensors.length).fill(false));
    } else if (!connecting && socket) {
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
      if (!prevConfig || !Array.isArray(prevConfig.sensors)) {
        console.warn("handleDeleteDevice: WiSensConfig.sensors is not an array.");
        return prevConfig;
      }
      const newSensors = prevConfig.sensors.filter((device) => device.id !== id);
      return { ...prevConfig, sensors: newSensors };
    });
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
    setLoadedLayouts(prev => { // Keep for 3D layout compatibility
        const newLayouts = { ...prev };
        delete newLayouts[id];
        return newLayouts;
    });
    setAcks(prevAcks => prevAcks.slice(0, Math.max(0, prevAcks.length - 1)));
  };

  const handleAddDevice = () => {
    const newId = (Array.isArray(WiSensConfig.sensors) && WiSensConfig.sensors.length > 0) ? Math.max(...WiSensConfig.sensors.map(s => s.id)) + 1 : 1;
    const newDevice = {
      id: newId,
      protocol: "ble",
      serialPort: "",
      deviceName: `New Device ${newId}`,
      startCoord: [0, 0],
      endCoord: [7, 7], // Default 2D dimensions
      resistance: 1000,
      intermittent: { enabled: false, p: 0, d: 0 },
      outlineImage: "",
    };

    setWiSensConfig((prevConfig) => {
      const currentSensors = Array.isArray(prevConfig.sensors) ? prevConfig.sensors : [];
      const updatedSensors = [...currentSensors, newDevice].sort((a, b) => a.id - b.id);
      return { ...prevConfig, sensors: updatedSensors };
    });

    let numReadWires, numGroundWires;
    if (is3DMode) {
      numReadWires = HIGH_DEF_ROWS;
      numGroundWires = HIGH_DEF_COLS;
    } else {
      numReadWires = newDevice.endCoord[0] - newDevice.startCoord[0] + 1;
      numGroundWires = newDevice.endCoord[1] - newDevice.startCoord[1] + 1;
    }

    setSensors((prev) => ({
      ...prev,
      [newDevice.id]: generateRandomArray(numReadWires, numGroundWires),
    }));
    setSensorDims((prev) => ({
      ...prev,
      [newDevice.id]: is3DMode ? [numGroundWires, numReadWires, 1] : [numReadWires, numGroundWires],
    }));

    // Ensure refs exist
    if (!interactiveHeatmapRefs.current[newDevice.id]) {
      interactiveHeatmapRefs.current[newDevice.id] = React.createRef();
    }
    if (!hiddenFileInputRefs.current[newDevice.id]) {
      hiddenFileInputRefs.current[newDevice.id] = React.createRef();
    }
    if (!hiddenFileInput2Refs.current[newDevice.id]) {
      hiddenFileInput2Refs.current[newDevice.id] = React.createRef();
    }
    if (!sensorDivRefs.current[newDevice.id]) {
      sensorDivRefs.current[newDevice.id] = React.createRef();
    }
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
          onLoadConfig={(event) => {
            if (is3DMode) {
              handleConfigFileChange(event);
            } else {
              handleConfigFileChange(event); // Re-using for now, check its compatibility
            }
          }}
          onSelectNodes={onSelectNodesClick}
          onRemoveNodes={onEraseModeClick}
          onAdcMode={onAdcModeClick}
          toggleDrawer={toggleDrawer}
          connected={Array.isArray(acks) && acks.every((ack) => ack === true)}
          connecting={connecting}
          eraseMode={eraseMode}
          selectMode={selectMode}
          adcMode={adcMode}
          // NEW PROP FOR TOGGLE
          onToggle2D3D={toggleHeatmapMode}
          is3DMode={is3DMode}
        ></Toolbar>
        {is3DMode && ( // Only render this input if in 3D mode as per your 3D file
          <input
            type="file"
            ref={hiddenFileInputConfigRefs.current['mainConfig']}
            onChange={handleConfigFileChange}
            style={{ display: "none" }}
          />
        )}
        <div
          style={{
            paddingLeft: "10%",
            paddingTop: "20px",
            fontSize: "large",
          }}
        >
        </div>
        <div className={styles.sensorDiv}>
          {Array.isArray(WiSensConfig.sensors) && WiSensConfig.sensors.length > 0 ? (
            WiSensConfig.sensors.map((sensorConfig) => (
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
                              onCalibrate(sensorConfig.id);
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
                      if (interactiveHeatmapRefs.current[sensorConfig.id]?.current) {
                        interactiveHeatmapRefs.current[sensorConfig.id].current.setShape();
                      } else {
                        console.warn(`Cannot setShape for sensor ${sensorConfig.id}: interactiveHeatmapRef is not ready.`);
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
                      } else {
                        console.warn(`Cannot saveLayout for sensor ${sensorConfig.id}: interactiveHeatmapRef is not ready.`);
                      }
                    }}
                  >
                    Save Layout
                  </button>
                  <button
                    className={styles.toolbarButton}
                    onClick={() => {
                      if (hiddenFileInputRefs.current[sensorConfig.id]) {
                        handleClick(hiddenFileInputRefs.current[sensorConfig.id]);
                      } else {
                        console.warn(`Cannot load layout for sensor ${sensorConfig.id}: Hidden file input ref is not set.`);
                      }
                    }}
                  >
                    Load Layout
                  </button>
                  <input
                    type="file"
                    ref={hiddenFileInputRefs.current[sensorConfig.id]}
                    onChange={(event) => {
                      handleLayoutFileChange(event, sensorConfig.id);
                    }}
                    style={{ display: "none" }}
                  />
                  <button
                    className={styles.toolbarButton}
                    onClick={() => {
                      if (hiddenFileInput2Refs.current[sensorConfig.id]) {
                        handleClick(hiddenFileInput2Refs.current[sensorConfig.id]);
                      } else {
                        console.warn(`Cannot upload image for sensor ${sensorConfig.id}: Hidden file input ref (for image) is not set.`);
                      }
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
                      } else {
                        console.warn(`Cannot uploadBackgroundImage for sensor ${sensorConfig.id}: interactiveHeatmapRef is not ready.`);
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
                  {sensors[sensorConfig.id] && sensorDims[sensorConfig.id] ? (
                    is3DMode ? (
                      <InteractiveHeatmap3D
                        ref={interactiveHeatmapRefs.current[sensorConfig.id]}
                        data={[sensors[sensorConfig.id]]} // 3D takes data as an array of layers
                        dim={sensorDims[sensorConfig.id]}
                        sensorDivRef={sensorDivRefs.current[sensorConfig.id]}
                        pitch={WiSensConfig.vizOptions?.pitch}
                        selectMode={selectMode}
                        eraseMode={eraseMode}
                        setSelectMode={setSelectMode}
                        showADC={adcMode}
                        customLayout={loadedLayouts[sensorConfig.id]} // Pass 3D specific layout
                      />
                    ) : (
                      <InteractiveHeatmap2D
                        ref={interactiveHeatmapRefs.current[sensorConfig.id]}
                        data={sensors[sensorConfig.id]} // 2D takes data directly
                        dim={sensorDims[sensorConfig.id]}
                        sensorDivRef={sensorDivRefs.current[sensorConfig.id]}
                        pitch={WiSensConfig.vizOptions?.pitch} // Check if pitch is used in 2D
                        selectMode={selectMode}
                        eraseMode={eraseMode}
                        setSelectMode={setSelectMode}
                        showADC={adcMode}
                      />
                    )
                  ) : (
                    <div>Loading sensor data...</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              No sensors configured. Add a new device to get started!
            </div>
          )}
        </div>
      </div>
      <AppSidebar
        Config={WiSensConfig}
        handleDeleteDevice={handleDeleteDevice}
        updateSensorObjects={updateSensorObjects}
        socket={socket}
        connected={Array.isArray(acks) && acks.every((ack) => ack === true)}
        handleAddDevice={handleAddDevice}
      />
    </SidebarProvider>
  );
};

export default Home;
