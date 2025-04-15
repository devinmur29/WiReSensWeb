import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Button } from "@/components/ui/button";

import { DeviceConfig } from "@/components/device-config";

import { Card, CardContent } from "@/components/ui/card";
import { Trash, Pencil, CirclePlus } from "lucide-react";
import { useState } from "react";

export function AppSidebar({
  Config,
  handleDeleteDevice,
  updateSensorObjects,
  socket,
  connected,
}) {
  const [popoverOpen, setPopoverOpen] = useState(true);
  const onPencil = () => {
    console.log("Set popoveropen");
    setPopoverOpen(!popoverOpen);
  };
  const onCirclePlus = () => {
    if (Config.sensors.length === 0) return;

    const lastDevice = Config.sensors[Config.sensors.length - 1];
    const newDeviceId = Config.sensors.length + 1;

    const newDevice = {
      ...lastDevice,
      id: newDeviceId,
      deviceName: `Device${newDeviceId}`,
    };

    const newConfig = {
      ...Config,
      sensors: [...Config.sensors, newDevice],
    };

    updateSensorObjects(newConfig);
  };
  return (
    <Sidebar side={"right"} variant={"floating"}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Devices</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {Config.sensors.map((device) => (
                <Card
                  key={device.id}
                  className="p-2 flex justify-between items-center"
                >
                  <CardContent>
                    <p className="font-medium">{device.deviceName}</p>
                    <p className="text-sm text-gray-500">
                      {device.serialPort || "No Port Assigned"}
                    </p>
                  </CardContent>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger>
                        <Button size="icon" variant="outline">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent style={{ width: "400px" }} side={"left"}>
                        <DeviceConfig
                          Config={Config}
                          updateSensorObjects={updateSensorObjects}
                          deviceId={device.id}
                          socket={socket}
                          connected={connected}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() => handleDeleteDevice(device.id)}
                    >
                      <Trash className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              ))}
              <Button onClick={onCirclePlus}>
                <CirclePlus />
              </Button>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
