const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    lowercase: true 
  },
  otp: { 
    type: String, 
    required: true 
  },
  userType: { 
    type: String, 
    enum: ['user', 'agency', 'doctor'], 
    required: true 
  },
  userData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  createdAt: { 
    type: Date, 
    default: Date.now, 
    expires: 600 // 10 minutes expiration
  }
});

// Index for better query performance
otpSchema.index({ email: 1, userType: 1 });
otpSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });

const OTP = mongoose.model('OTP', otpSchema);
module.exports = OTP;
