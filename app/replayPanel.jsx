import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Play, CircleStop } from "lucide-react";

export function ReplayPanel({ config, onPlay, onPause }) {
  const [settings, setSettings] = useState({
    startTimestamp: "",
    endTimestamp: "",
    playbackRate: "1.0",
    sensorFiles: {},
  });

  const handleFileChange = (sensorId, filename) => {
    setSettings((prev) => ({
      ...prev,
      sensorFiles: { ...prev.sensorFiles, [sensorId]: filename },
    }));
  };

  const handleSettingChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="p-4 border rounded-lg space-y-4">
      <h2 className="text-lg font-semibold">Replay Settings</h2>

      <div className="grid grid-cols-1 gap-4">
        {config.sensors?.map((sensor) => (
          <div key={sensor.id} className="space-y-2">
            <Label>{`Sensor ${sensor.id}`}</Label>
            <Input
              type="text"
              placeholder="Filename"
              value={settings.sensorFiles[sensor.id] || ""}
              onChange={(e) => handleFileChange(sensor.id, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Start Time</Label>
          <Input
            type="number"
            step="0.01"
            value={settings.startTimestamp}
            onChange={(e) =>
              handleSettingChange("startTimestamp", e.target.value)
            }
          />
        </div>
        <div>
          <Label>End Time</Label>
          <Input
            type="number"
            step="0.01"
            value={settings.endTimestamp}
            onChange={(e) =>
              handleSettingChange("endTimestamp", e.target.value)
            }
          />
        </div>
        <div>
          <Label>Playback Rate</Label>
          <Input
            type="number"
            step="0.1"
            value={settings.playbackRate}
            onChange={(e) =>
              handleSettingChange("playbackRate", e.target.value)
            }
          />
        </div>
      </div>

      <Button
        onClick={() => {
          onPlay(settings);
        }}
        size="icon"
        variant="outline"
      >
        <Play></Play>
      </Button>
      <Button onClick={onPause} size="icon" variant="outline">
        <CircleStop />
      </Button>
    </div>
  );
}
