import styles from "./device-config.module.css";

import React, { useState, useRef, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function DeviceConfig({
  Config,
  updateSensorObjects,
  deviceId,
  socket,
  connected,
}) {
  let foundDevice = Config.sensors.find((sensor) => sensor.id === deviceId);
  const [yBounds, setYBounds] = useState([
    foundDevice.startCoord[1],
    foundDevice.endCoord[1],
  ]);
  const [xBounds, setXBounds] = useState([
    foundDevice.startCoord[0],
    foundDevice.endCoord[0],
  ]);
  const [selected, setSelected] = useState(foundDevice.protocol); // Default value
  const rowsRef = useRef(null);
  const colsRef = useRef(null);
  const serialRef = useRef(null);
  const baudRef = useRef(null);
  const deviceNameRef = useRef(null);
  const resRef = useRef(null);
  const pRef = useRef(null);
  const dRef = useRef(null);
  const [programmedText, setProgrammedText] = useState(false);
  const [intermittent, setIntermittent] = useState(
    foundDevice.intermittent.enabled
  );

  const toggleIntermittent = () => setIntermittent((prev) => !prev);

  const sliderValueChangeY = (value) => {
    setYBounds(value);
  };
  const sliderValueChangeX = (value) => {
    setXBounds(value);
  };

  const onProgramDevice = () => {
    const foundDevice = Config.sensors.find((sensor) => sensor.id === deviceId);
    let newDevice = {
      ...foundDevice,
      startCoord: [xBounds[0], yBounds[0]],
      endCoord: [xBounds[1], yBounds[1]],
      serialPort: serialRef.current.value,
      resistance: resRef.current.value,
      deviceName: deviceNameRef.current.value,
      protocol: selected,
      intermittent: {
        enabled: intermittent,
        p: pRef.current
          ? parseFloat(pRef.current.value)
          : foundDevice.intermittent.p,
        d: dRef.current
          ? parseFloat(dRef.current.value)
          : foundDevice.intermittent.d,
      },
    };
    const updatedSensors = Config.sensors
      .map((sensor) => (sensor.id === deviceId ? newDevice : sensor))
      .sort((a, b) => a.id - b.id);
    let newConfig = { ...Config, sensors: updatedSensors };
    socket.emit("program", newConfig, deviceId, () => {
      setProgrammedText(true);
    });
    updateSensorObjects(newConfig);
  };

  const calcResistanceDisplay = (potStep) => {
    return (Math.min(potStep, 127) / 128.0) * 50000;
  };

  useEffect(() => {
    const rows = rowsRef.current.querySelectorAll("g");
    const [min, max] = yBounds;
    console.log("Setting color", rows.length);

    rows.forEach((row) => {
      const id = parseInt(row.getAttribute("data-name"), 10);

      // Check if this row's ID is within the min/max range
      const isActive = id >= min && id <= max;

      // Find the circle and polyline elements within the current <g>
      const circle = row.querySelector("circle");
      let polyline = row.querySelector("polyline");
      if (!polyline) {
        polyline = row.querySelector("line");
      }

      // Update the color of the circle and polyline based on the active range
      if (circle && polyline) {
        if (isActive) {
          circle.style.fill = "#39FF14";
          circle.style.stroke = "#39FF14";
          polyline.style.stroke = "#39FF14";
        } else {
          circle.style.fill = "";
          circle.style.stroke = "";
          polyline.style.stroke = "";
        }
      }
    });
  }, [yBounds]);

  useEffect(() => {
    const rows = colsRef.current.querySelectorAll("g");
    const [min, max] = xBounds;

    rows.forEach((row) => {
      const id = parseInt(row.getAttribute("id").replace("_", ""), 10);

      // Check if this row's ID is within the min/max range
      const isActive = id >= min && id <= max;

      // Find the circle and polyline elements within the current <g>
      const circle = row.querySelector("circle");

      let polyline = row.querySelector("polyline");
      if (!polyline) {
        polyline = row.querySelector("line");
      }

      // Update the color of the circle and polyline based on the active range
      if (circle && polyline) {
        if (isActive) {
          circle.style.fill = "#39FF14";
          circle.style.stroke = "#39FF14";
          polyline.style.stroke = "#39FF14";
        } else {
          circle.style.fill = "";
          circle.style.stroke = "";
          polyline.style.stroke = "";
        }
      }
    });
  }, [xBounds]);

  return (
    <div>
      <div className="flex w-full max-w-sm items-center gap-4">
        <div className="flex flex-col">
          <Label htmlFor="devicename">Device Name</Label>
          <Input
            id="devicename"
            placeholder="Device Name"
            defaultValue={foundDevice.deviceName} // Set default value
            ref={deviceNameRef} // Attach ref
          />
          <Label htmlFor="serial" className="mt-1">
            Serial Port
          </Label>
          <Input
            id="serial"
            placeholder="Serial Port"
            defaultValue={foundDevice.serialPort} // Set default value
            ref={serialRef} // Attach ref
          />
        </div>
        <div className="flex flex-col">
          <Label htmlFor="radiobuttons">Protocol</Label>
          <RadioGroup
            value={selected}
            onValueChange={setSelected}
            id="radiobuttons"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="serial" id="r1" />
              <Label htmlFor="r1">Serial</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="ble" id="r2" />
              <Label htmlFor="r2">Bluetooth</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="wifi" id="r3" />
              <Label htmlFor="r3">WiFi</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="espnow" id="r4" />
              <Label htmlFor="r4">ESP-NOW</Label>
            </div>
          </RadioGroup>
        </div>
      </div>
      <div className="flex w-full max-w-sm items-center gap-4 mt-1">
        <div className="flex flex-col">
          <Label htmlFor="resistance">
            Potentiometer:
            {calcResistanceDisplay(foundDevice.resistance)}
          </Label>
          <Input
            id="resistance"
            placeholder="Resistance"
            defaultValue={foundDevice.resistance} // Set default value
            ref={resRef} // Attach ref
          />
        </div>
        <div className="flex flex-col">
          <Label htmlFor="baud">Baud Rate</Label>
          <Input
            id="baud"
            placeholder="Baud Rate"
            defaultValue={Config.serialOptions.baudrate} // Set default value
            ref={baudRef} // Attach ref
          />
        </div>
      </div>
      <div className="flex flex-row space-x3-4 mt-1">
        <div className="flex items-center space-x-2">
          <Switch
            id="lowPowerMode"
            checked={intermittent}
            onCheckedChange={toggleIntermittent}
          />
          <Label htmlFor="lowPowerMode">Low Power Mode?</Label>
        </div>

        {intermittent && (
          <div className="flex flex-row space-x-2 items-center">
            <Label htmlFor="pValue">P</Label>
            <Input
              id="pValue"
              type="number"
              step="1"
              defaultValue={foundDevice.intermittent.p}
              ref={pRef}
            />

            <Label htmlFor="dValue">D</Label>
            <Input
              id="dValue"
              type="number"
              step="1"
              defaultValue={foundDevice.intermittent.p}
              ref={dRef}
            />
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "30%",
          }}
        >
          Y Range
          <Slider
            defaultValue={[yBounds[0], yBounds[1]]}
            max={31}
            min={0}
            step={1}
            minStepsBetweenThumbs={1}
            onValueChange={sliderValueChangeY}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: "30%",
          }}
        >
          X Range
          <Slider
            defaultValue={[xBounds[0], xBounds[1]]}
            max={31}
            min={0}
            step={1}
            minStepsBetweenThumbs={1}
            onValueChange={sliderValueChangeX}
          />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "center",
        }}
      >
        <div>
          Min: {yBounds[0]} Max: {yBounds[1]}
        </div>
        <div>
          Min: {xBounds[0]} Max: {xBounds[1]}
        </div>
      </div>
      <svg
        id="Layer_1"
        data-name="Layer 1"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 424.23 358.19"
      >
        <defs>
          <style>
            {`
          .cls-1 {
            fill: #fff;
          }
          .cls-1, .cls-2 {
            stroke: #231f20;
            stroke-miterlimit: 10;
          }
          .cls-2 {
            fill: none;
          }
          .cls-3 {
            fill: #010101;
          }
        `}
          </style>
        </defs>
        <rect
          className="cls-1"
          x="157.9"
          y="5.23"
          width="264.94"
          height="160.38"
        />
        <g id="rows" ref={rowsRef}>
          <g id="_0" data-name="0">
            <circle className="cls-1" cx="174.76" cy="158.19" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 161.46 174.76 163.68 144.78 163.68 144.78 195.54 365.92 195.54"
            />
          </g>
          <g id="_1" data-name="1">
            <circle className="cls-1" cx="166.23" cy="158.19" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 158.19 140.22 158.75 140.22 200.54 365.92 200.54"
            />
          </g>
          <g id="_2" data-name="2">
            <circle className="cls-1" cx="174.76" cy="148.37" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 151.64 174.76 153.93 135.65 153.83 135.65 205.54 365.92 205.54"
            />
          </g>
          <g id="_3" data-name="3">
            <circle className="cls-1" cx="166.23" cy="148.37" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 148.37 131.09 148.9 131.09 210.54 365.92 210.54"
            />
          </g>
          <g id="_4" data-name="4">
            <circle className="cls-1" cx="174.76" cy="138.55" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 141.82 174.76 143.22 126.53 143.97 126.53 215.55 365.92 215.55"
            />
          </g>
          <g id="_5" data-name="5">
            <circle className="cls-1" cx="166.23" cy="138.55" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 138.55 121.97 139.04 121.97 220.55 365.92 220.55"
            />
          </g>
          <g id="_6" data-name="6">
            <circle className="cls-1" cx="174.76" cy="128.73" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 132 174.76 133.21 117.41 134.11 117.41 225.55 365.92 225.55"
            />
          </g>
          <g id="_7" data-name="7">
            <circle className="cls-1" cx="166.23" cy="128.73" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 128.73 112.85 129.18 112.85 230.55 365.92 230.55"
            />
          </g>
          <g id="_8" data-name="8">
            <circle className="cls-1" cx="174.76" cy="118.91" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 122.18 174.76 123.54 108.28 124.25 108.28 235.55 365.92 235.55"
            />
          </g>
          <g id="_9" data-name="9">
            <circle className="cls-1" cx="166.23" cy="118.91" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 118.91 103.72 119.32 103.72 240.55 365.92 240.55"
            />
          </g>
          <g id="_10" data-name="10">
            <circle className="cls-1" cx="174.76" cy="109.09" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 112.36 174.76 113.87 99.16 114.4 99.16 245.56 365.92 245.56"
            />
          </g>
          <g id="_11" data-name="11">
            <circle className="cls-1" cx="166.23" cy="109.09" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 109.09 94.6 109.47 94.6 250.56 365.92 250.56"
            />
          </g>
          <g id="_12" data-name="12">
            <circle className="cls-1" cx="174.76" cy="99.27" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 102.54 174.76 103.86 90.04 104.54 90.04 255.56 365.92 255.56"
            />
          </g>
          <g id="_13" data-name="13">
            <circle className="cls-1" cx="166.23" cy="99.27" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 99.27 85.48 99.61 85.48 260.56 365.92 260.56"
            />
          </g>
          <g id="_14" data-name="14">
            <circle className="cls-1" cx="174.76" cy="89.45" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 92.72 174.76 94.19 80.91 94.68 80.91 265.56 365.92 265.56"
            />
          </g>
          <g id="_15" data-name="15">
            <circle className="cls-1" cx="166.23" cy="89.45" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 89.45 76.35 89.75 76.35 270.56 365.92 270.56"
            />
          </g>
          <g id="_16" data-name="16">
            <circle className="cls-1" cx="174.76" cy="79.63" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 82.9 174.76 84.69 71.79 84.82 71.79 275.57 365.92 275.57"
            />
          </g>
          <g id="_17" data-name="17">
            <circle className="cls-1" cx="166.23" cy="79.63" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 79.63 67.23 79.89 67.23 280.57 365.92 280.57"
            />
          </g>
          <g id="_18" data-name="18">
            <circle className="cls-1" cx="174.76" cy="69.81" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 73.08 174.76 74.5 62.67 74.96 62.67 285.57 365.92 285.57"
            />
          </g>
          <g id="_19" data-name="19">
            <circle className="cls-1" cx="166.23" cy="69.81" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 69.81 58.11 70.04 58.11 290.57 365.92 290.57"
            />
          </g>
          <g id="_20" data-name="20">
            <circle className="cls-1" cx="174.76" cy="59.99" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 63.26 174.76 64.66 53.54 65.11 53.54 295.57 365.92 295.57"
            />
          </g>
          <g id="_21" data-name="21">
            <circle className="cls-1" cx="166.23" cy="59.99" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 59.99 48.98 60.18 48.98 300.57 365.92 300.57"
            />
          </g>
          <g id="_22" data-name="22">
            <circle className="cls-1" cx="174.76" cy="50.17" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 53.44 174.76 54.65 44.42 55.25 44.42 305.58 365.92 305.58"
            />
          </g>
          <g id="_23" data-name="23">
            <circle className="cls-1" cx="166.23" cy="50.17" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 50.17 39.86 50.32 39.86 310.58 365.92 310.58"
            />
          </g>
          <g id="_24" data-name="24">
            <circle className="cls-1" cx="174.76" cy="40.35" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 43.62 174.76 45.15 35.3 45.39 35.3 315.58 365.92 315.58"
            />
          </g>
          <g id="_25" data-name="25">
            <circle className="cls-1" cx="166.23" cy="40.35" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 40.35 30.74 40.46 30.74 320.58 365.92 320.58"
            />
          </g>
          <g id="_26" data-name="26">
            <circle className="cls-1" cx="174.76" cy="30.53" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 33.8 174.76 34.79 26.17 35.53 26.17 325.58 365.92 325.58"
            />
          </g>
          <g id="_27" data-name="27">
            <circle className="cls-1" cx="166.23" cy="30.53" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 30.53 21.61 30.6 21.61 330.58 365.92 330.58"
            />
          </g>
          <g id="_28" data-name="28">
            <circle className="cls-1" cx="174.76" cy="20.71" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 23.98 174.76 25.81 17.05 25.68 17.05 335.59 365.92 335.59"
            />
          </g>
          <g id="_29" data-name="29">
            <circle className="cls-1" cx="166.23" cy="20.71" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 20.71 12.49 20.75 12.49 340.59 365.92 340.59"
            />
          </g>
          <g id="_30" data-name="30">
            <circle className="cls-1" cx="174.76" cy="10.89" r="3.27" />
            <polyline
              className="cls-2"
              points="174.76 14.16 174.76 15.45 7.93 15.82 7.93 345.59 365.92 345.59"
            />
          </g>
          <g id="_31" data-name="31">
            <circle className="cls-1" cx="166.23" cy="10.89" r="3.27" />
            <polyline
              className="cls-2"
              points="162.96 10.89 3.37 10.89 3.37 350.59 365.92 350.59"
            />
          </g>
        </g>
        <g id="columns" ref={colsRef}>
          <g id="_0-2" data-name="0">
            <circle className="cls-1" cx="201.76" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="201.76"
              y1="162.45"
              x2="201.76"
              y2="354.73"
            />
          </g>
          <g id="_1-2" data-name="1">
            <circle className="cls-1" cx="201.76" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="205.04 150.65 206.42 150.65 206.42 354.73"
            />
          </g>
          <g id="_2-2" data-name="2">
            <circle className="cls-1" cx="211.58" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="211.58"
              y1="162.45"
              x2="211.58"
              y2="354.73"
            />
          </g>
          <g id="_3-2" data-name="3">
            <circle className="cls-1" cx="211.58" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="214.86 150.65 216.58 150.65 216.58 354.73"
            />
          </g>
          <g id="_4-2" data-name="4">
            <circle className="cls-1" cx="221.4" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="221.4"
              y1="162.45"
              x2="221.4"
              y2="354.73"
            />
          </g>
          <g id="_5-2" data-name="5">
            <circle className="cls-1" cx="221.4" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="224.68 150.65 225.7 150.65 225.7 354.73"
            />
          </g>
          <g id="_6-2" data-name="6">
            <circle className="cls-1" cx="231.22" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="231.22"
              y1="162.45"
              x2="231.22"
              y2="354.73"
            />
          </g>
          <g id="_7-2" data-name="7">
            <circle className="cls-1" cx="231.22" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="234.5 150.65 235.94 150.65 235.94 354.73"
            />
          </g>
          <g id="_8-2" data-name="8">
            <circle className="cls-1" cx="241.04" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="241.04"
              y1="162.45"
              x2="241.04"
              y2="354.73"
            />
          </g>
          <g id="_9-2" data-name="9">
            <circle className="cls-1" cx="241.04" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="244.32 150.65 246.23 150.65 246.23 354.73"
            />
          </g>
          <g id="_10-2" data-name="10">
            <circle className="cls-1" cx="250.86" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="250.86"
              y1="162.45"
              x2="250.86"
              y2="354.73"
            />
          </g>
          <g id="_11-2" data-name="11">
            <circle className="cls-1" cx="250.86" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="254.14 150.65 255.35 150.65 255.35 354.73"
            />
          </g>
          <g id="_12-2" data-name="12">
            <circle className="cls-1" cx="260.68" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="260.68"
              y1="162.45"
              x2="260.68"
              y2="354.73"
            />
          </g>
          <g id="_13-2" data-name="13">
            <circle className="cls-1" cx="260.68" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="263.96 150.65 265.64 150.65 265.64 354.73"
            />
          </g>
          <g id="_14-2" data-name="14">
            <circle className="cls-1" cx="270.5" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="270.5"
              y1="162.45"
              x2="270.5"
              y2="354.73"
            />
          </g>
          <g id="_15-2" data-name="15">
            <circle className="cls-1" cx="270.5" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="273.78 150.65 275.31 150.65 275.31 354.73"
            />
          </g>
          <g id="_16-2" data-name="16">
            <circle className="cls-1" cx="280.32" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="280.32"
              y1="162.45"
              x2="280.32"
              y2="354.73"
            />
          </g>
          <g id="_17-2" data-name="17">
            <circle className="cls-1" cx="280.32" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="283.6 150.65 285.32 150.65 285.32 354.73"
            />
          </g>
          <g id="_18-2" data-name="18">
            <circle className="cls-1" cx="290.14" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="290.14"
              y1="162.45"
              x2="290.14"
              y2="354.73"
            />
          </g>
          <g id="_19-2" data-name="19">
            <circle className="cls-1" cx="290.14" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="293.42 150.65 295.34 150.65 295.34 354.73"
            />
          </g>
          <g id="_20-2" data-name="20">
            <circle className="cls-1" cx="299.96" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="299.96"
              y1="162.45"
              x2="299.96"
              y2="354.73"
            />
          </g>
          <g id="_21-2" data-name="21">
            <circle className="cls-1" cx="299.96" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="303.24 150.65 305.01 150.65 305.01 354.73"
            />
          </g>
          <g id="_22-2" data-name="22">
            <circle className="cls-1" cx="309.78" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="309.78"
              y1="162.45"
              x2="309.78"
              y2="354.73"
            />
          </g>
          <g id="_23-2" data-name="23">
            <circle className="cls-1" cx="309.78" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="313.06 150.65 314.68 150.65 314.68 354.73"
            />
          </g>
          <g id="_24-2" data-name="24">
            <circle className="cls-1" cx="319.6" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="319.6"
              y1="162.45"
              x2="319.6"
              y2="354.73"
            />
          </g>
          <g id="_25-2" data-name="25">
            <circle className="cls-1" cx="319.6" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="322.88 150.65 324.35 150.65 324.35 354.73"
            />
          </g>
          <g id="_26-2" data-name="26">
            <circle className="cls-1" cx="329.42" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="329.42"
              y1="162.45"
              x2="329.42"
              y2="354.73"
            />
          </g>
          <g id="_27-2" data-name="27">
            <circle className="cls-1" cx="329.42" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="332.7 150.65 334.01 150.65 334.01 354.73"
            />
          </g>
          <g id="_28-2" data-name="28">
            <circle className="cls-1" cx="339.24" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="339.24"
              y1="162.45"
              x2="339.24"
              y2="354.73"
            />
          </g>
          <g id="_29-2" data-name="29">
            <circle className="cls-1" cx="339.24" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="342.52 150.65 344.2 150.65 344.2 354.73"
            />
          </g>
          <g id="_30-2" data-name="30">
            <circle className="cls-1" cx="349.06" cy="159.18" r="3.27" />
            <line
              className="cls-2"
              x1="349.06"
              y1="162.45"
              x2="349.06"
              y2="354.73"
            />
          </g>
          <g id="_31-2" data-name="31">
            <circle className="cls-1" cx="349.06" cy="150.65" r="3.27" />
            <polyline
              className="cls-2"
              points="352.34 150.65 354.04 150.65 354.04 354.73"
            />
          </g>
        </g>
        <rect
          className="cls-2"
          x="353.19"
          y="17.44"
          width="54.72"
          height="114.56"
          rx="14.89"
          ry="14.89"
        />
        <path
          className="cls-3"
          d="M242.07,110.55h13.91v-3.39h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-3.4h-13.91v3.39h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.67h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.67h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v3.39ZM250.89,64.11v2.9c0,1.01-.82,1.83-1.84,1.84h-.06c-1.01,0-1.83-.82-1.84-1.84v-2.9h3.73ZM243.39,63.85h2.46v3.17c0,.84.33,1.64.92,2.23.59.59,1.39.92,2.23.92h.06c.84,0,1.64-.33,2.23-.92.59-.59.92-1.39.92-2.23v-3.17h2.46v45.39h-11.28v-45.39ZM228.48,95.91h-1.32v1.28h-2.68v-1.28h-1.32v1.28h-2.68v-1.28h-1.32v1.28h-3.19v7.77h3.19v1.28h1.32v-1.28h2.67v1.28h1.32v-1.28h2.68v1.28h1.32v-1.28h3.19v-7.77h-3.19v-1.28ZM230.35,103.64h-13.04v-5.14h13.04v5.14ZM220.5,85.22v-1.28h-1.32v1.28h-3.19v7.77h3.19v1.28h1.32v-1.28h2.67v1.28h1.32v-1.28h2.68v1.28h1.32v-1.28h3.19v-7.77h-3.19v-1.28h-1.32v1.28h-2.68v-1.28h-1.32v1.28h-2.68ZM230.35,91.67h-13.04v-5.14h13.04v5.14ZM236.79,74.63h-8.91v5.91h8.91v-5.91ZM235.47,79.23h-6.27v-3.28h6.27v3.28ZM236.79,65.32h-8.91v5.91h8.91v-5.91ZM235.47,69.92h-6.27v-3.28h6.27v3.28ZM227.82,108.3c-.75,0-1.47.3-2,.83-.53.53-.83,1.25-.83,2s.3,1.47.83,2c.53.53,1.25.83,2,.83.75,0,1.47-.3,2-.83.53-.53.83-1.25.83-2,0-.75-.3-1.47-.83-2-.53-.53-1.25-.83-2-.83h0ZM227.82,112.64c-.61,0-1.16-.37-1.4-.93-.23-.57-.11-1.22.33-1.65.43-.43,1.08-.56,1.65-.33.57.23.93.79.93,1.4,0,.84-.68,1.51-1.51,1.51h0ZM219.84,108.3h0c-.75,0-1.47.3-2,.83-.53.53-.83,1.25-.83,2s.3,1.47.83,2c.53.53,1.25.83,2,.83s1.47-.3,2-.83c.53-.53.83-1.25.83-2,0-.75-.3-1.47-.83-2-.53-.53-1.25-.83-2-.83h0ZM219.84,112.64h0c-.61,0-1.16-.37-1.4-.93-.23-.57-.11-1.22.33-1.65.43-.43,1.08-.56,1.65-.33.57.23.93.79.94,1.4,0,.84-.68,1.51-1.51,1.51h0ZM233.43,93.3h1.32v4.06h-1.32v-4.06ZM236.09,93.3h1.32v4.06h-1.32v-4.06ZM262.4,113.68h-1.53v-1.32h1.53v1.32ZM259.55,113.68h-1.53v-1.32h1.53v1.32ZM262.4,110.9h-1.53s0-1.32,0-1.32h1.53v1.32Z"
        />
        <path
          className="cls-3"
          d="M297.57,110.72h13.91v-3.39h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-2.68h1.38v-1.32h-1.38v-3.4h-13.91v3.39h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.67h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.67h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v2.68h-1.28v1.32h1.28v3.39ZM306.39,64.29v2.9c0,1.01-.82,1.83-1.84,1.84h-.06c-1.01,0-1.83-.82-1.84-1.84v-2.9h3.73ZM298.88,64.02h2.46v3.17c0,.84.33,1.64.92,2.23.59.59,1.39.92,2.23.92h.06c.84,0,1.64-.33,2.23-.92.59-.59.92-1.39.92-2.23v-3.17h2.46v45.39h-11.28v-45.39ZM283.98,96.09h-1.32v1.28h-2.68v-1.28h-1.32v1.28h-2.68v-1.28h-1.32v1.28h-3.19v7.77h3.19v1.28h1.32v-1.28h2.67v1.28h1.32v-1.28h2.68v1.28h1.32v-1.28h3.19v-7.77h-3.19v-1.28ZM285.85,103.82h-13.04v-5.14h13.04v5.14ZM275.99,85.39v-1.28h-1.32v1.28h-3.19v7.77h3.19v1.28h1.32v-1.28h2.67v1.28h1.32v-1.28h2.68v1.28h1.32v-1.28h3.19v-7.77h-3.19v-1.28h-1.32v1.28h-2.68v-1.28h-1.32v1.28h-2.68ZM285.85,91.84h-13.04v-5.14h13.04v5.14ZM292.28,74.81h-8.91v5.91h8.91v-5.91ZM290.97,79.4h-6.27v-3.28h6.27v3.28ZM292.28,65.49h-8.91v5.91h8.91v-5.91ZM290.97,70.09h-6.27v-3.28h6.27v3.28ZM283.32,108.47c-.75,0-1.47.3-2,.83-.53.53-.83,1.25-.83,2s.3,1.47.83,2c.53.53,1.25.83,2,.83.75,0,1.47-.3,2-.83.53-.53.83-1.25.83-2,0-.75-.3-1.47-.83-2-.53-.53-1.25-.83-2-.83h0ZM283.32,112.81c-.61,0-1.16-.37-1.4-.93-.23-.57-.11-1.22.33-1.65.43-.43,1.08-.56,1.65-.33.57.23.93.79.93,1.4,0,.84-.68,1.51-1.51,1.51h0ZM275.34,108.47h0c-.75,0-1.47.3-2,.83-.53.53-.83,1.25-.83,2s.3,1.47.83,2c.53.53,1.25.83,2,.83s1.47-.3,2-.83c.53-.53.83-1.25.83-2,0-.75-.3-1.47-.83-2-.53-.53-1.25-.83-2-.83h0ZM275.34,112.81h0c-.61,0-1.16-.37-1.4-.93-.23-.57-.11-1.22.33-1.65.43-.43,1.08-.56,1.65-.33.57.23.93.79.94,1.4,0,.84-.68,1.51-1.51,1.51h0ZM288.93,93.47h1.32v4.06h-1.32v-4.06ZM291.59,93.47h1.32v4.06h-1.32v-4.06ZM317.89,113.86h-1.53v-1.32h1.53v1.32ZM315.05,113.86h-1.53v-1.32h1.53v1.32ZM317.89,111.07h-1.53s0-1.32,0-1.32h1.53v1.32Z"
        />
      </svg>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                disabled={connected}
                className="mt-4"
                onClick={onProgramDevice}
              >
                Program Device
              </Button>
              {programmedText && "   Programmed!"}
            </span>
          </TooltipTrigger>
          {connected && (
            <TooltipContent>
              Recording must be stopped before programming devices
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
