const express = require("express");
const dotenv = require("dotenv");
const dns = require("dns");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const mqtt = require('mqtt');
const crypto = require('crypto');

dotenv.config();

const { auth, allowRoles } = require('./middleware/auth.js');
const startSync = require("./init/sync.js");
const userRoute = require("./routes/userRoute.js");
const adminRoute = require("./routes/adminRoutes.js");
const dealershipRoute = require("./routes/dealershipRoute.js");
const customerRoute = require("./routes/customerRoutes.js");
const connectDB = require("./db/connect.js");
const Machine = require("./Model/machineSchema.js");
const Log = require("./Model/logSchema.js");
const operatorRoutes = require('./routes/operatorRoutes.js');
const SanitizationRefill = require("./Model/SantizationLiquid.js");

const app = express();

dns.setServers(["1.1.1.1", "8.8.8.8"]);

connectDB();
startSync();

app.use(express.json());

app.use(cors({
    origin: process.env.FRONTEND_URL, 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));



// MQTT Client Setup
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com', {
  reconnectPeriod: 5000,
  connectTimeout: 30000,
  keepalive: 60
});

let mqttConnected = false;

mqttClient.on('connect', () => {
  console.log("✅ MQTT Connected to HiveMQ");
  mqttConnected = true;
  
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

// Store machine status in memory
const machineStatusCache = new Map();

// MQTT Message Handler
mqttClient.on('message', async (topic, message) => {
  try {
    const messageStr = message.toString();
    
    if (topic === 'freshpod_vending_2025/logs') {
      const data = JSON.parse(messageStr);
      
      console.log(`📥 MQTT: ${data.machineId} - ${data.status}`);
      
      machineStatusCache.set(data.machineId, {
        status: data.status,
        message: data.message || '',
        timestamp: Date.now(),
        lastUpdate: new Date()
      });
      
      if (data.status === 'cleaning_completed' && data.machineId) {
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

app.set('mqttClient', mqttClient);
app.set('machineStatusCache', machineStatusCache);

app.use(morgan("dev"));
app.use(cookieParser());



// ============================================
// ✅ REFILL ROUTES - WITH /api/ PREFIX
// ============================================

app.get('/api/refill/:machineId/start-tapcount', async (req, res) => {
  try {
    const { machineId } = req.params;
    console.log('📥 GET start-tapcount for:', machineId);

    if (!machineId) {
      return res.status(400).json({
        success: false,
        message: 'Machine ID is required'
      });
    }

    const machine = await Machine.findOne({ machineId: machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: `Machine with ID "${machineId}" not found`
      });
    }

    const refill = await SanitizationRefill.findOne({ machineId: machineId });

    if (!refill) {
      return res.status(200).json({
        success: false,
        message: `No refill record found`,
        data: {
          machineId: machineId,
          startTapCount: 0,
          hasRefill: false,
          containerSize: 5,
          usagePerTap: 0.012,
          totalTaps: machine.totalTaps || 0
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        machineId: refill.machineId,
        startTapCount: refill.tapCountAtRefill || 0,
        refillStartTime: refill.start,
        refillId: refill._id,
        hasRefill: true,
        containerSize: refill.containerSize || 5,
        usagePerTap: refill.usagePerTap || 0.012,
        totalTaps: machine.totalTaps || 0
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// POST /api/refill/:machineId - Create refill
app.post('/api/refill/:machineId', async (req, res) => {
  try {
    const { machineId } = req.params;
    const { tapCount, containerSize = 5, usagePerTap = 0.012 } = req.body;

    console.log('📝 Refill request:', { machineId, tapCount, containerSize });

    if (!machineId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Machine ID is required' 
      });
    }

    if (tapCount === undefined || tapCount === null) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tap count is required' 
      });
    }

    const machine = await Machine.findOne({ machineId: machineId });
    if (!machine) {
      return res.status(404).json({
        success: false,
        message: `Machine with ID "${machineId}" not found`
      });
    }

    // Find or create refill record
    let refill = await SanitizationRefill.findOne({ machineId: machineId });

    if (refill) {
      // Update existing
      refill.tapCountAtRefill = tapCount;
      refill.containerSize = containerSize;
      refill.usagePerTap = usagePerTap;
      refill.start = new Date();
      await refill.save();
      console.log('✅ Refill updated:', machineId);
    } else {
      // Create new
      refill = new SanitizationRefill({
        machineId: machineId,
        tapCountAtRefill: tapCount,
        containerSize: containerSize,
        usagePerTap: usagePerTap,
        start: new Date()
      });
      await refill.save();
      console.log('✅ Refill created:', machineId);
    }

    // ✅ Return success response
    return res.status(200).json({
      success: true,
      message: 'Refill completed successfully',
      data: {
        machineId: refill.machineId,
        tapCountAtRefill: refill.tapCountAtRefill,
        containerSize: refill.containerSize,
        usagePerTap: refill.usagePerTap,
        start: refill.start,
        refillId: refill._id
      }
    });

  } catch (error) {
    console.error('❌ Error starting refill:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Regular routes
app.use("/user", userRoute);
app.use("/admin", adminRoute);
app.use("/dealership", dealershipRoute);
app.use("/customer", customerRoute);
app.use("/operator", operatorRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});


app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});