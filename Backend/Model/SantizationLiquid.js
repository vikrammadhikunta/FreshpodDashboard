// Model/SantizationLiquid.js
const mongoose = require("mongoose");

const SanitizationRefillSchema = new mongoose.Schema({
  machineId: {
    type: String,
    required: true,
    index: true
  },
  start: {
    type: Date,
    required: true,
    default: Date.now
  },
  tapCountAtRefill: {
    type: Number,
    required: true,
    default: 0
  },
  containerSize: {
    type: Number,
    default: 5
  },
  usagePerTap: {
    type: Number,
    default: 0.015
  },
  refilledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  notes: {
    type: String,
    default: ""
  }
}, {
  timestamps: true
});

// ✅ Make sure this is exported correctly
module.exports = mongoose.model('SanitizationRefill', SanitizationRefillSchema);