// toolbar.jsx
import React, { useMemo, useRef } from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  onToggle2D3D,
  vizMode,
}) => {
  const hiddenFileInputConfig = useRef(null);

  const handleConfigClick = (event) => {
    hiddenFileInputConfig.current.value = null;
    hiddenFileInputConfig.current.click();
  };

  const vizButtonText = useMemo(() => {
    if (vizMode === 'GRID') return '2D Grid';
    if (vizMode === 'HAND_2D') return '2D Hand';
    if (vizMode === 'HAND_3D') return '3D Hand';
    return 'Toggle Viz';
  }, [vizMode]);

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
      {/* <div style={{ display: connecting ? "block" : "none" }}>
        Connecting...
      </div> */}
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

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onToggle2D3D}>
              {vizButtonText}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle visualization between 2D Grid, 2D Hand, and 3D Hand</TooltipContent>
        </Tooltip>
      </TooltipProvider>

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
