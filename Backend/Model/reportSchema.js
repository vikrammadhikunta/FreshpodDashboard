// Model/reportSchema.js
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reportId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  customer: {
    id: { 
      type: String, 
      required: true,
      index: true
    },
    email: { 
      type: String, 
      required: true 
    },
    name: { 
      type: String, 
      required: true 
    },
    phone: {
      type: String,
      default: 'N/A'
    }
  },
  subject: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 200
  },
  description: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['pending', 'solved'],
    default: 'pending',
    index: true
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolutionNotes: {
    type: String,
    default: null
  }
}, {
  timestamps: true // Automatically adds createdAt and updatedAt
});

// Indexes for faster queries
reportSchema.index({ 'customer.id': 1, status: 1 });
reportSchema.index({ createdAt: -1 });

// Method to mark as solved
reportSchema.methods.markAsSolved = function(notes) {
  this.status = 'solved';
  this.resolvedAt = new Date();
  this.resolutionNotes = notes || 'Issue resolved';
  return this.save();
};

// Method to get status display
reportSchema.methods.getStatusDisplay = function() {
  return this.status === 'solved' ? '✅ Solved' : '⏳ Pending';
};

module.exports = mongoose.model('Report', reportSchema);