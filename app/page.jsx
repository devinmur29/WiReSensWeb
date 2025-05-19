"use client";
import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import InteractiveHeatmap from "./interactiveheatmap";
import Toolbar from "./toolbar";
import styles from "./page.module.css";
import defaultWiReSensConfig from "./constants";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AlignVerticalJustifyEnd } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
// Function to generate a 10x10 array with random values
const generateRandomArray = (rows, cols) => {
  const array = [];
  for (let i = 0; i < cols; i++) {
    const row = [];
    for (let j = 0; j < rows; j++) {
      row.push(0);
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
  defaultWiReSensConfig.sensors.forEach((sensorConfig) => {
    const numReadWires =
      sensorConfig.endCoord[0] - sensorConfig.startCoord[0] + 1;
    const numGroundWires =
      sensorConfig.endCoord[1] - sensorConfig.startCoord[1] + 1;
    defaultSensors[sensorConfig.id] = generateRandomArray(
      numReadWires,
      numGroundWires
    );
    defaultDims[sensorConfig.id] = [numReadWires, numGroundWires];
    interactiveHeatmapRefs.current[sensorConfig.id] =
      interactiveHeatmapRefs.current[sensorConfig.id] || React.createRef();
    hiddenFileInputRefs.current[sensorConfig.id] =
      hiddenFileInputRefs.current[sensorConfig.id] || React.createRef();
    hiddenFileInput2Refs.current[sensorConfig.id] =
      hiddenFileInput2Refs.current[sensorConfig.id] || React.createRef();
    sensorDivRefs.current[sensorConfig.id] =
      sensorDivRefs.current[sensorConfig.id] || React.createRef();
  });
  const [sensors, setSensors] = useState(defaultSensors);
  const [sensorDims, setSensorDims] = useState(defaultDims);
  const [acks, setAcks] = useState(Array(defaultSensors.length).fill(false));

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
    // Initialize default sensors based on the loaded config
    // Use the current sensors and dims as the base
    const updatedSensors = { ...sensors };
    const updatedDims = { ...sensorDims };
    config.sensors.forEach((sensorConfig) => {
      const numReadWires =
        sensorConfig.endCoord[0] - sensorConfig.startCoord[0] + 1;
      const numGroundWires =
        sensorConfig.endCoord[1] - sensorConfig.startCoord[1] + 1;
      // Only initialize if it's a new device or dimensions are changing
      console.log(updatedSensors[sensorConfig.id]);
      console.log(updatedDims[sensorConfig.id]);
      console.log(numReadWires, numGroundWires);
      if (
        !updatedSensors[sensorConfig.id] ||
        updatedDims[sensorConfig.id][0] != numReadWires ||
        updatedDims[sensorConfig.id][1] != numGroundWires
      ) {
        console.log("Updating sensor ", sensorConfig.id);
        updatedSensors[sensorConfig.id] = generateRandomArray(
          numReadWires,
          numGroundWires
        );
        updatedDims[sensorConfig.id] = [numReadWires, numGroundWires];
      }
      interactiveHeatmapRefs.current[sensorConfig.id] =
        interactiveHeatmapRefs.current[sensorConfig.id] || React.createRef();
      hiddenFileInputRefs.current[sensorConfig.id] =
        hiddenFileInputRefs.current[sensorConfig.id] || React.createRef();
      hiddenFileInput2Refs.current[sensorConfig.id] =
        hiddenFileInput2Refs.current[sensorConfig.id] || React.createRef();
      sensorDivRefs.current[sensorConfig.id] =
        sensorDivRefs.current[sensorConfig.id] || React.createRef();
    });
    setSensorDims(updatedDims);
    setSensors(updatedSensors);
    setWiSensConfig(config);
    setAcks(Array(defaultSensors.length).fill(false));
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
    const localIp = WiSensConfig.vizOptions.localIp
      ? config.vizOptions.localIp
      : "127.0.0.1";

    const newSocket = io(`http://${localIp}:5328`);

    newSocket.on("connect", () => {
      console.log("Connected to server");
    });

    newSocket.on("disconnect", () => {
      console.log("Disconnected from server");
    });

    newSocket.on("sensor_data", (data) => {
      const dataObj = JSON.parse(data);
      setSensors(dataObj);
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
        const updatedAcks = acks;
        updatedAcks[index] = true;
        setAcks(updatedAcks);
      }
    });

    newSocket.on("calibration_done", (data) => {
      console.log("Calibration Done");
      let sensor_id = data.id;
      let resistance = data.value;
      // Update WiSensConfig when calibration is done
      setWiSensConfig((prevConfig) => {
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

        return prevConfig; // If sensor not found, return previous config
      });

      setCalibrating(false);
    });

    setSocket(newSocket);

    // Cleanup function to close the socket when unmounting
    return () => {
      newSocket.disconnect();
    };
  }, []); // Empty dependency array ensures this runs only once when mounted

  useEffect(() => {
    if (acks.every((ack) => ack === true)) {
      setConnecting(false);
    }
  }, [acks]);

  const handleClick = (hiddenFile) => {
    hiddenFile.current.click();
  };

  const onConnectDevices = () => {
    if (acks.every((ack) => ack === true)) {
      socket.emit("stopViz");
      setAcks(Array(defaultSensors.length).fill(false));
    } else if (!connecting) {
      socket.emit("startViz", WiSensConfig);
      setConnecting(true);
    }
  };

  const onCalibrate = (sensorId) => {
    setCalibrating(true);
    socket.emit("calibrate", sensorId);
  };

  const onPlay = (settings) => {
    console.log("start replay");
    socket.emit("replay", settings);
  };

  const onPause = () => {
    console.log("stop replay");
    socket.emit("stopViz");
  };

  const toggleDrawer = () => setOpen(!open);

  const handleDeleteDevice = (id) => {
    setWiSensConfig({
      ...WiSensConfig,
      sensors: WiSensConfig.sensors.filter((device) => device.id !== id),
    });
  };

  const handleAddDevice = () => {
    const newDevice = {
      id: WiSensConfig.sensors.length + 1,
      protocol: "ble",
      serialPort: "",
      deviceName: "New Device",
      startCoord: [0, 0],
      endCoord: [7, 7],
      resistance: 1000,
      intermittent: { enabled: false, p: 0, d: 0 },
      outlineImage: "",
    };
    setWiSensConfig({
      ...WiSensConfig,
      sensors: [...WiSensConfig.sensors, newDevice],
    });
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
          {WiSensConfig.sensors.map((sensorId) => (
            <div key={sensorId.id} className={styles.heatmapContainer}>
              <div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <button
                          disabled={calibrating}
                          className={styles.toolbarButton}
                          onClick={() => {
                            onCalibrate(sensorId.id);
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
                    interactiveHeatmapRefs.current[
                      sensorId.id
                    ].current.setShape();
                  }}
                >
                  Toggle Shape
                </button>
                <button
                  className={styles.toolbarButton}
                  onClick={() => {
                    interactiveHeatmapRefs.current[
                      sensorId.id
                    ].current.saveLayout();
                  }}
                >
                  Save Layout
                </button>
                <button
                  className={styles.toolbarButton}
                  onClick={() => {
                    handleClick(hiddenFileInputRefs.current[sensorId.id]);
                  }}
                >
                  Load Layout
                </button>
                <input
                  type="file"
                  ref={hiddenFileInputRefs.current[sensorId.id]} // ADDED
                  onChange={(event) => {
                    interactiveHeatmapRefs.current[
                      sensorId.id
                    ].current.loadLayout(event);
                  }}
                  style={{ display: "none" }}
                />
                <button
                  className={styles.toolbarButton}
                  onClick={() => {
                    handleClick(hiddenFileInput2Refs.current[sensorId.id]);
                  }}
                >
                  Upload Image
                </button>
                <input
                  type="file"
                  ref={hiddenFileInput2Refs.current[sensorId.id]}
                  onChange={(event) => {
                    interactiveHeatmapRefs.current[
                      sensorId.id
                    ].current.uploadBackgroundImage(event);
                  }}
                  style={{ display: "none" }}
                />
                <div
                  className={styles.sensorTitle}
                >{`${sensorId.deviceName}`}</div>
              </div>
              <div
                ref={sensorDivRefs.current[sensorId.id]}
                className={`${styles.interactiveHeatmapDiv} ${styles.noselect}`}
              >
                <InteractiveHeatmap
                  ref={interactiveHeatmapRefs.current[sensorId.id]}
                  data={sensors[sensorId.id]}
                  dim={sensorDims[sensorId.id]}
                  sensorDivRef={sensorDivRefs.current[sensorId.id]}
                  pitch={WiSensConfig.vizOptions.pitch}
                  selectMode={selectMode}
                  eraseMode={eraseMode}
                  setSelectMode={setSelectMode}
                  showADC={adcMode}
                ></InteractiveHeatmap>
              </div>
            </div>
          ))}
        </div>
      </div>
      <AppSidebar
        Config={WiSensConfig}
        handleDeleteDevice={handleDeleteDevice}
        updateSensorObjects={updateSensorObjects}
        socket={socket}
        connected={acks.every((ack) => ack === true)}
      />
    </SidebarProvider>
  );
};

export default Home;
