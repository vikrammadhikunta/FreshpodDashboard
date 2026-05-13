// Model/customerMachineSettingsSchema.js
const mongoose = require("mongoose");

const customerMachineSettingsSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  machineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Machine",
    required: true,
    index: true
  },
  machineCode: {
    type: String,
    required: true
  },
  
  // Financial Settings (Customer can edit these)
  costPerTap: {
    type: Number,
    default: 0.50,
    min: 0
  },
  rentPerMonth: {
    type: Number,
    default: 0,
    min: 0
  },
  maintenanceCostPerMonth: {
    type: Number,
    default: 0,
    min: 0
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
customerMachineSettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compound unique index to ensure one settings per customer per machine
customerMachineSettingsSchema.index({ customerId: 1, machineId: 1 }, { unique: true });

module.exports = mongoose.model("CustomerMachineSettings", customerMachineSettingsSchema);