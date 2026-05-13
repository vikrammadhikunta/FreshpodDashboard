// Model/userSchema.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ["admin", "dealership", "customer", "operator"],
    required: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    match: [/^[0-9]{10}$/, "Enter valid 10-digit phone number"]
  },
  location: String,
  state: {
    type: String,
    required: true
  },
  country: {
    type: String,
    default: "India"
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  assignedMachines: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Machine"
  }],
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  refreshToken: {
    type: String,
    default: null
  }
}, { timestamps: true });

// Set password from phoneNumber only for new documents
userSchema.pre('validate', async function() {
  if (this.isNew && !this.password && this.phoneNumber) {
    this.password = this.phoneNumber;
  }
});

// Hash password only if modified
userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }
  // Check if password is already hashed
  if (this.password && this.password.startsWith('$2b$')) {
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};

userSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};

module.exports = mongoose.model("User", userSchema);