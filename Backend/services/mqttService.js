// services/mqttService.js
const mqtt = require('mqtt');
const Machine = require('../Model/machineSchema');
const Log = require('../Model/logSchema');

class MQTTHandler {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.machineSessions = new Map(); // Track active sessions
  }

  connect() {
    // Use a public MQTT broker or your own
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com';
    
    this.client = mqtt.connect(brokerUrl, {
      clientId: `backend_${Date.now()}`,
      keepalive: 60,
      reconnectPeriod: 5000
    });

    this.client.on('connect', () => {
      console.log('✅ MQTT Connected to broker');
      this.isConnected = true;
      
      // Subscribe to machine responses
      this.client.subscribe('freshpod_vending_2025/+/response', (err) => {
        if (!err) console.log('Subscribed to machine responses');
      });
    });

    this.client.on('error', (err) => {
      console.error('MQTT Error:', err);
      this.isConnected = false;
    });

    this.client.on('message', (topic, message) => {
      this.handleMachineResponse(topic, message);
    });
  }

  async handleMachineResponse(topic, message) {
    try {
      const data = JSON.parse(message.toString());
      const machineId = topic.split('/')[1];
      
      console.log(`📨 Machine response from ${machineId}:`, data);
      
      // Find the machine
      const machine = await Machine.findOne({ machineId });
      if (!machine) return;
      
      // Handle different response statuses
      if (data.status === 'started') {
        console.log(`Machine ${machineId} started successfully`);
        
        // Update machine status
        await Machine.updateOne(
          { machineId },
          { 
            $set: { 
              status: 'running',
              lastStartedAt: new Date()
            }
          }
        );
        
      } else if (data.status === 'completed') {
        console.log(`Machine ${machineId} completed dispensing`);
        
        // Update machine status back to idle
        await Machine.updateOne(
          { machineId },
          { 
            $set: { status: 'idle' },
            $inc: { totalTaps: 1 }
          }
        );
        
        // Save to logs
        const today = new Date().toISOString().split('T')[0];
        await Log.findOneAndUpdate(
          { machineId, date: today },
          { 
            $inc: { tapCount: 1 },
            $set: { updatedAt: new Date() }
          },
          { upsert: true }
        );
        
      } else if (data.status === 'error') {
        console.error(`Machine ${machineId} error:`, data.message);
        
        await Machine.updateOne(
          { machineId },
          { $set: { status: 'error', lastError: data.message } }
        );
      }
      
    } catch (error) {
      console.error('Error handling MQTT response:', error);
    }
  }

  async startMachine(machineId, amount, customerId) {
    if (!this.isConnected || !this.client) {
      console.error('MQTT not connected');
      return { success: false, error: 'MQTT service unavailable' };
    }
    
    const topic = `freshpod_vending_2025/${machineId}`;
    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const payload = JSON.stringify({
      command: 'start',
      amount: amount,
      transaction_id: transactionId,
      customer_id: customerId,
      timestamp: new Date().toISOString()
    });
    
    return new Promise((resolve) => {
      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error('Publish error:', err);
          resolve({ success: false, error: err.message });
        } else {
          console.log(`✅ Start signal sent to ${machineId}`);
          
          // Track session
          this.machineSessions.set(machineId, {
            startTime: new Date(),
            amount,
            transactionId,
            customerId
          });
          
          resolve({ success: true, transactionId });
        }
      });
    });
  }

  async stopMachine(machineId) {
    if (!this.isConnected || !this.client) {
      return { success: false, error: 'MQTT service unavailable' };
    }
    
    const topic = `freshpod_vending_2025/${machineId}`;
    const payload = JSON.stringify({
      command: 'stop',
      timestamp: new Date().toISOString()
    });
    
    return new Promise((resolve) => {
      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          console.log(`✅ Stop signal sent to ${machineId}`);
          this.machineSessions.delete(machineId);
          resolve({ success: true });
        }
      });
    });
  }
}

module.exports = new MQTTHandler();