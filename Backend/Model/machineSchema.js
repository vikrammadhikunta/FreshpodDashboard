const mongoose = require("mongoose");

const machineSchema = new mongoose.Schema({
  machineId: {
    type: String,
    required: true,
    unique: true
  },

  location: {
    type: String,
    required: true
  },

  state: String,

  country: {
    type: String,
    default: "India"
  },

  machineCost: {
    type: Number,
    required: true,
    default: 100
  },

  costPerTap: {
    type: Number,
    required: true
  },

  totalTaps: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    enum: ["active", "inactive", "maintenance"],
    default: "active"
  },

  dealership: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  
  operatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }

}, { timestamps: true });

module.exports = mongoose.model("Machine", machineSchema);