// Model/logSchema.js - UPDATE WITH ALL ACTION TYPES
const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  machineId: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: String,
    required: true,
    default: () => new Date().toISOString().split('T')[0]
  },
  tapCount: {
    type: Number,
    default: 0
  },
  action: {
    type: String,
    enum: [
      'START', 
      'TAP_DISPENSED', 
      'CLEANING_STARTED', 
      'CLEANING_COMPLETED', 
      'STOP',
      'DISINFECTION_STARTED',      // ADD THIS
      'DISINFECTION_STOPPED',      // ADD THIS
      'DISINFECTION_COMPLETED',    // ADD THIS
      'CYCLE_COMPLETED'            // ADD THIS
    ],
    default: 'TAP_DISPENSED'
  },
  status: {
    type: String,
    enum: ['sent', 'processing', 'completed', 'failed'],
    default: 'completed'
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  amount: {
    type: Number,
    default: 0
  },
  sessionId: {
    type: String,
    default: null
  },
  sessionDuration: {
    type: Number,
    default: 0
  },
  sessionTaps: {
    type: Number,
    default: 0
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true 
});

// Indexes for performance
logSchema.index({ machineId: 1, date: -1 });
logSchema.index({ machineId: 1, timestamp: -1 });
logSchema.index({ action: 1, status: 1 });

module.exports = mongoose.model("Log", logSchema);