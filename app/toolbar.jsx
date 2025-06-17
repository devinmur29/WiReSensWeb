// toolbar.jsx
import React, { useRef } from "react";
import styles from "./Toolbar.module.css";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WiFiSettings } from "./wifiSettings";
import { ReplayPanel } from "./replayPanel";
import { Wifi, Repeat } from "lucide-react";

const Toolbar = ({
  onPlay,
  onPause,
  config,
  onSave,
  onLoadConfig,
  onConnectDevices,
  onSelectNodes,
  onRemoveNodes,
  connected,
  connecting,
  onAdcMode,
  toggleDrawer,
  selectMode,
  eraseMode,
  adcMode,
  // NEW: Add onToggle2D3D and is3DMode to the props
  onToggle2D3D, // This function will be passed from page.jsx
  is3DMode,     // This boolean will tell us the current display mode
}) => {
  const hiddenFileInputConfig = useRef(null);

  const handleConfigClick = (event) => {
    hiddenFileInputConfig.current.click();
  };

  return (
    <div
      className={`${styles.toolbar} no-select`}
      style={{ display: "flex", alignItems: "center", position: "relative" }}
    >
      <Button onClick={handleConfigClick}>Load Config</Button>
      <input
        type="file"
        ref={hiddenFileInputConfig}
        accept=".json"
        onChange={onLoadConfig}
        style={{ display: "none" }}
      />
      <Button
        onClick={onConnectDevices}
        style={{ backgroundColor: connected ? "#838181" : "#000000" }}
      >
        {connected ? "Stop Recording" : "Record"}
      </Button>
      <div style={{ display: connecting ? "block" : "none" }}>
        Connecting...
      </div>
      <Popover>
        <PopoverTrigger>
          <Button size="icon">
            <Repeat className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent style={{ width: "400px" }}>
          <ReplayPanel
            config={config}
            onPlay={onPlay}
            onPause={onPause}
          ></ReplayPanel>
        </PopoverContent>
      </Popover>
      <Button
        onClick={onSelectNodes}
        style={{ backgroundColor: selectMode ? "#838181" : "#000000" }}
      >
        Select Nodes
      </Button>
      <Button
        onClick={onRemoveNodes}
        style={{ backgroundColor: eraseMode ? "#838181" : "#000000" }}
      >
        Remove Nodes
      </Button>

      <Button
        onClick={onAdcMode}
        style={{ backgroundColor: adcMode ? "#838181" : "#000000" }}
      >
        Show Values
      </Button>

      <Popover>
        <PopoverTrigger>
          <Button size="icon">
            <Wifi className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent style={{ width: "400px" }}>
          <WiFiSettings config={config} onSave={onSave} />
        </PopoverContent>
      </Popover>

      {/* MODIFIED: Toggle 2D/3D Button */}
      <Button
        onClick={onToggle2D3D} // Call the function passed from page.jsx
      >
        Toggle {is3DMode ? '2D' : '3D'} {/* Dynamically change button text */}
      </Button>

      <Button
        onClick={toggleDrawer}
        style={{
          position: "absolute",
          right: "2%", // Keeps it 2% from the right
        }}
      >
        Device Panel
      </Button>
    </div>
  );
};

export default Toolbar;
