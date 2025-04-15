const defaultWiReSensConfig = {
  wifiOptions: {
    tcp_ip: "",
    port: 7001,
    numNodes: 120,
    ssid: "StataCenter",
    password: "",
  },

  readoutOptions: {
    groundPins: [26, 25, 4, 21, 12],
    readPins: [27, 33, 15, 32, 14],
    adcPin: 34,
  },

  sensors: [
    {
      id: 1,
      protocol: "ble",
      serialPort: "COM5",
      deviceName: "Esp1",
      startCoord: [0, 0],
      endCoord: [7, 7],
      resistance: 25,
      intermittent: {
        enabled: false,
        p: 21,
        d: 46,
      },
      outlineImage: "",
      saturatedPercentage: 1,
      duration: 30000,
    },
  ],

  serialOptions: {
    baudrate: 250000,
    numNodes: 120,
  },

  bleOptions: {
    numNodes: 120,
  },

  espOptions: {
    macAddress: [160, 163, 179, 144, 124, 188],
  },

  vizOptions: {
    pitch: 13,
    localIp: "",
  },
};

export default defaultWiReSensConfig;
