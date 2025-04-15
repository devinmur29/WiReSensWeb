import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function WiFiSettings({ config, onSave }) {
  const [wifiConfig, setWiFiConfig] = useState(config.wifiOptions);
  const [serialConfig, setSerialConfig] = useState(config.serialOptions);
  const [bleConfig, setBleConfig] = useState(config.bleOptions);
  const [espConfig, setEspConfig] = useState(config.espOptions);
  const [protocol, setProtocol] = useState(config.sensors[0].protocol);

  // Handle changes to Wi-Fi options
  const handleWiFiChange = (key, value) => {
    setWiFiConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle changes to Serial options
  const handleSerialChange = (key, value) => {
    setSerialConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle changes to BLE options
  const handleBleChange = (key, value) => {
    setBleConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle changes to ESP options
  const handleEspChange = (key, value) => {
    setEspConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle Protocol change
  const handleProtocolChange = (newProtocol) => {
    setProtocol(newProtocol);
  };

  return (
    <div className="space-y-4">
      {/* Protocol Selection */}

      <div className="flex flex-col">
        <Label htmlFor="radiobuttons" style={{ paddingBottom: "10px" }}>
          Choose Protocol
        </Label>
        <RadioGroup
          value={protocol}
          onValueChange={handleProtocolChange}
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

      {/* Wi-Fi Configuration */}
      {protocol === "wifi" && (
        <div className="space-y-2">
          <Label>TCP/IP</Label>
          <Input
            value={wifiConfig.tcp_ip}
            onChange={(e) => handleWiFiChange("tcp_ip", e.target.value)}
            placeholder="Enter TCP/IP"
          />

          <Label>Port</Label>
          <Input
            type="number"
            value={wifiConfig.port}
            onChange={(e) => handleWiFiChange("port", e.target.value)}
            placeholder="Port"
          />

          <Label>SSID</Label>
          <Input
            value={wifiConfig.ssid}
            onChange={(e) => handleWiFiChange("ssid", e.target.value)}
            placeholder="Enter SSID"
          />

          <Label>Password</Label>
          <Input
            value={wifiConfig.password}
            onChange={(e) => handleWiFiChange("password", e.target.value)}
            placeholder="Enter Password"
          />
        </div>
      )}

      {/* BLE Configuration */}
      {protocol === "ble" && (
        <div className="space-y-2">
          <Label>Packet Size (Samples)</Label>
          <Input
            type="number"
            value={bleConfig.numNodes}
            onChange={(e) => handleBleChange("numNodes", e.target.value)}
            placeholder="Number of BLE Nodes"
          />
        </div>
      )}

      {/* ESP-NOW Configuration */}
      {protocol === "espnow" && (
        <div className="space-y-2">
          <Label>MAC Address</Label>
          <Input
            value={espConfig.macAddress.join(":")}
            onChange={(e) =>
              handleEspChange(
                "macAddress",
                e.target.value.split(":").map((x) => parseInt(x, 16))
              )
            }
            placeholder="Enter MAC Address"
          />
        </div>
      )}

      {/* Serial Configuration */}
      {protocol === "serial" && (
        <div className="space-y-2">
          <Label>Baud Rate</Label>
          <Input
            type="number"
            value={serialConfig.baudrate}
            onChange={(e) => handleSerialChange("baudrate", e.target.value)}
            placeholder="Baud Rate"
          />

          <Label>Packet Size (Samples)</Label>
          <Input
            type="number"
            value={serialConfig.numNodes}
            onChange={(e) => handleSerialChange("numNodes", e.target.value)}
            placeholder="Number of Nodes"
          />
        </div>
      )}

      {/* Save Button */}
      <Button
        onClick={() =>
          onSave({
            ...config,
            wifiOptions: wifiConfig,
            serialOptions: serialConfig,
            bleOptions: bleConfig,
            espOptions: espConfig,
          })
        }
      >
        Save Settings
      </Button>
    </div>
  );
}
