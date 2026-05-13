// app.js
const express = require("express");
const dotenv = require("dotenv");
const dns = require("dns");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const mqtt = require('mqtt');

dotenv.config();

const startSync = require("./init/sync.js");
const userRoute = require("./routes/userRoute.js");
const adminRoute = require("./routes/adminRoutes.js");
const dealershipRoute = require("./routes/dealershipRoute.js");
const customerRoute = require("./routes/customerRoutes.js");
const connectDB = require("./db/connect.js");
const Machine = require("./Model/machineSchema.js");
const Log = require("./Model/logSchema.js");
const operatorRoutes = require('./routes/operatorRoutes.js')

const app = express();

dns.setServers(["1.1.1.1", "8.8.8.8"]);

connectDB();
startSync();

app.use(express.json());

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

// MQTT Client Setup
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com', {
  reconnectPeriod: 5000,  // Auto reconnect every 5 seconds
  connectTimeout: 30000,
  keepalive: 60
});

let mqttConnected = false;

mqttClient.on('connect', () => {
  console.log("✅ MQTT Connected to HiveMQ");
  mqttConnected = true;
  
  // Subscribe to logs topic
  mqttClient.subscribe('freshpod_vending_2025/logs', { qos: 1 }, (err) => {
    if (!err) {
      console.log("✅ Subscribed to freshpod_vending_2025/logs");
    } else {
      console.error("❌ Failed to subscribe:", err);
    }
  });
});

mqttClient.on('error', (err) => {
  console.log("❌ MQTT Error:", err);
  mqttConnected = false;
});

mqttClient.on('reconnect', () => {
  console.log("🔄 MQTT Reconnecting...");
});

mqttClient.on('offline', () => {
  console.log("📡 MQTT Offline");
  mqttConnected = false;
});

// Store machine status in memory (acts as cache)
const machineStatusCache = new Map();

// MQTT Message Handler
mqttClient.on('message', async (topic, message) => {
  try {
    const messageStr = message.toString();
    
    if (topic === 'freshpod_vending_2025/logs') {
      const data = JSON.parse(messageStr);
      
      console.log(`📥 MQTT: ${data.machineId} - ${data.status}`);
      
      // Update cache immediately
      machineStatusCache.set(data.machineId, {
        status: data.status,
        message: data.message || '',
        timestamp: Date.now(),
        lastUpdate: new Date()
      });
      
      // Handle different statuses
      if (data.status === 'cleaning_completed' && data.machineId) {
        // Update database
        const machine = await Machine.findOneAndUpdate(
          { machineId: data.machineId },
          { 
            $inc: { totalTaps: 1 },
            $set: { 
              lastActive: new Date(),
              status: 'active'
            }
          },
          { new: true }
        );
        
        if (machine) {
          // Create log
          await Log.create({
            machineId: data.machineId,
            action: 'CLEANING_COMPLETED',
            tapCount: 1,
            status: 'success',
            initiatedBy: machine.assignedTo,
            timestamp: new Date(),
            metadata: data
          });
          
          console.log(`✅ Updated ${data.machineId}: Total taps = ${machine.totalTaps}`);
        }
      }
      
      else if (data.status === 'cleaning_started' && data.machineId) {
        await Log.create({
          machineId: data.machineId,
          action: 'CLEANING_STARTED',
          tapCount: 0,
          status: 'processing',
          timestamp: new Date(),
          metadata: data
        });
      }
      
      else if (data.status === 'online') {
        await Machine.findOneAndUpdate(
          { machineId: data.machineId },
          { $set: { status: 'online', lastSeen: new Date() } }
        );
      }
    }
    
  } catch (error) {
    console.error('❌ MQTT Handler Error:', error);
  }
});

// Make mqttClient available to routes
app.set('mqttClient', mqttClient);
app.set('machineStatusCache', machineStatusCache);

app.use(morgan("dev"));
app.use(cookieParser());

app.use("/user", userRoute);
app.use("/admin", adminRoute);
app.use("/dealership", dealershipRoute);
app.use("/customer", customerRoute);
app.use("/operator", operatorRoutes);



app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});