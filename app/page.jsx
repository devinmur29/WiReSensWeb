"use client";
import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import InteractiveHeatmap from "./interactiveheatmap";
import Toolbar from "./toolbar";
import styles from "./page.module.css";

// Function to generate a 10x10 array with random values
const generateRandomArray = (rows, cols) => {
  const array = [];
  for (let i = 0; i < cols; i++) {
    const row = [];
    for (let j = 0; j < rows; j++) {
      row.push(Math.random());
    }
    array.push(row);
  }
  return array;
};

const Home = () => {
  const [WiSensConfig, setWiSensConfig] = useState(null);
  const [sensors, setSensors] = useState({});
  const [selectMode, setSelectMode] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const sensorDivRef = useRef(null);
  const [socket, setSocket] = useState(null);

  const onSelectNodesClick = () => {
    setSelectMode(!selectMode);
  };

  const onEraseModeClick = () => {
    setEraseMode(!eraseMode);
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const config = JSON.parse(e.target.result);
        setWiSensConfig(config);

        // Initialize default sensors based on the loaded config
        const defaultSensors = {};
        config.sensors.forEach((sensorConfig) => {
          const numReadWires =
            sensorConfig.endCoord[0] - sensorConfig.startCoord[0] + 1;
          const numGroundWires =
            sensorConfig.endCoord[1] - sensorConfig.startCoord[1] + 1;
          defaultSensors[sensorConfig.id] = generateRandomArray(
            numReadWires,
            numGroundWires
          );
        });
        setSensors(defaultSensors);

        // Initialize socket connection
        const localIp = config.vizOptions.localIp
          ? config.vizOptions.localIp
          : "127.0.0.1";
        const newSocket = io(`http://${localIp}:5328`);
        setSocket(newSocket);

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

        return () => {
          newSocket.off("sensor_data");
        };
      };
      reader.readAsText(file);
    }
  };

  if (!WiSensConfig) {
    return (
      <div className={styles.centerContainer}>
        <div className={styles.fileInputBox}>
          <input
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className={styles.fileInput}
          />
          <p>Please select a JSON configuration file to proceed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageDiv}>
      <Toolbar
        onSelectNodes={onSelectNodesClick}
        onRemoveNodes={onEraseModeClick}
        eraseMode={eraseMode}
        selectMode={selectMode}
      ></Toolbar>
      <div
        style={{
          paddingLeft: "10%",
          paddingTop: "20px",
          fontSize: "large",
        }}
      >
        <b>{`Step Count: ${stepCount}`}</b>
      </div>
      <div className={styles.sensorDiv}>
        {WiSensConfig.sensors.map((sensorId) => (
          <div key={sensorId.id} className={styles.heatmapContainer}>
            <div className={styles.sensorTitle}>{`Sensor ${sensorId.id}`}</div>
            <div
              className={`${styles.interactiveHeatmapDiv} ${styles.noselect}`}
              ref={sensorDivRef}
            >
              <InteractiveHeatmap
                data={sensors[sensorId.id]}
                sensorDivRef={sensorDivRef}
                pitch={WiSensConfig.vizOptions.pitch}
                outlineImage={
                  sensorId.outlineImage ? sensorId.outlineImage : null
                }
                selectMode={selectMode}
                eraseMode={eraseMode}
                setSelectMode={setSelectMode}
              ></InteractiveHeatmap>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
