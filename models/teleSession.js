const mongoose = require('mongoose');

const teleSessionSchema = new mongoose.Schema({
  session_id: { 
    type: String, 
    unique: true, 
    default: () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
  },
  
  booking_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Booking', 
    required: true 
  },
  
  participants: {
    patient: {
      user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      joined_at: { type: Date },
      left_at: { type: Date },
      connection_quality: { 
        type: String, 
        enum: ['excellent', 'good', 'fair', 'poor'] 
      }
    },
    nurse: {
      nurse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse' },
      joined_at: { type: Date },
      left_at: { type: Date },
      initiated_call: { type: Boolean, default: true }
    },
    doctor: {
      doctor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
      joined_at: { type: Date },
      left_at: { type: Date },
      consultation_type: { 
        type: String, 
        enum: ['emergency', 'routine', 'follow-up'] 
      }
    }
  },
  
  session_details: {
    start_time: { type: Date, required: true },
    end_time: { type: Date },
    duration_minutes: { type: Number },
    session_type: { 
      type: String, 
      enum: ['video', 'audio-only', 'chat'], 
      default: 'video' 
    },
    initiated_by: { 
      type: String, 
      enum: ['nurse', 'doctor', 'patient'], 
      default: 'nurse' 
    },
    reason_for_consultation: { type: String },
    session_notes: { type: String }
  },
  
  technical_details: {
    video_service_provider: { type: String, default: 'webrtc' },
    session_token: { type: String },
    recording_enabled: { type: Boolean, default: false },
    recording_url: { type: String },
    connection_logs: [{
      timestamp: { type: Date },
      event: { type: String },
      participant: { type: String },
      details: { type: mongoose.Schema.Types.Mixed }
    }],
    bandwidth_usage: {
      upload_mb: { type: Number },
      download_mb: { type: Number },
      peak_bandwidth: { type: Number }
    }
  },
  
  medical_outcome: {
    diagnosis_provided: { type: Boolean, default: false },
    prescription_issued: { type: Boolean, default: false },
    prescription_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription' },
    follow_up_required: { type: Boolean, default: false },
    follow_up_date: { type: Date },
    emergency_escalation: { type: Boolean, default: false },
    patient_satisfaction: { type: Number, min: 1, max: 5 },
    doctor_notes: { type: String }
  },
  
  billing_info: {
    consultation_fee: { type: Number },
    doctor_share: { type: Number },
    platform_fee: { type: Number },
    included_in_service: { type: Boolean, default: true },
    separate_billing: { type: Boolean, default: false }
  },
  
  status: { 
    type: String, 
    enum: ['scheduled', 'active', 'completed', 'cancelled', 'failed'], 
    default: 'scheduled' 
  },
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
teleSessionSchema.index({ "booking_id": 1 });
teleSessionSchema.index({ "participants.doctor.doctor_id": 1 });
teleSessionSchema.index({ "session_details.start_time": -1 });
teleSessionSchema.index({ "status": 1 });
teleSessionSchema.index({ "session_id": 1 }, { unique: true });

// Pre-save middleware to calculate duration
teleSessionSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Calculate duration if both start and end times are present
  if (this.session_details.start_time && this.session_details.end_time) {
    const durationMs = this.session_details.end_time - this.session_details.start_time;
    this.session_details.duration_minutes = Math.round(durationMs / (1000 * 60));
  }
  
  next();
});

// Method to check if session is active
teleSessionSchema.methods.isActive = function() {
  return this.status === 'active';
};

// Method to get session duration string
teleSessionSchema.methods.getDurationString = function() {
  if (!this.session_details.duration_minutes) return 'N/A';
  
  const hours = Math.floor(this.session_details.duration_minutes / 60);
  const minutes = this.session_details.duration_minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

// Static method to find active sessions for a doctor
teleSessionSchema.statics.findActiveSessionsForDoctor = function(doctorId) {
  return this.find({
    'participants.doctor.doctor_id': doctorId,
    status: 'active'
  }).populate('booking_id participants.patient.user_id participants.nurse.nurse_id');
};

// Static method to get session analytics
teleSessionSchema.statics.getSessionAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        'session_details.start_time': {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgDuration: { $avg: '$session_details.duration_minutes' },
        totalDuration: { $sum: '$session_details.duration_minutes' }
      }
    }
  ]);
};

const TeleSession = mongoose.model('TeleSession', teleSessionSchema);
module.exports = TeleSession;
