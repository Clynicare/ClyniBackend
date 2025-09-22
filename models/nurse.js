const mongoose = require('mongoose');

const nurseSchema = new mongoose.Schema({
  nurse_id: { 
    type: String, 
    unique: true, 
    default: () => `nurse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
  },
  
  personal_info: {
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true, match: /^[0-9]{10}$/ },
    date_of_birth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    profile_image: { type: String, default: '' },
    emergency_contact: {
      name: { type: String },
      phone: { type: String },
      relationship: { type: String }
    }
  },
  
  professional_info: {
    license_number: { type: String, required: true, unique: true },
    nursing_degree: { type: String, required: true },
    specializations: [{ type: String }],
    certifications: [{
      name: { type: String },
      issuing_body: { type: String },
      issue_date: { type: Date },
      expiry_date: { type: Date },
      certificate_url: { type: String }
    }],
    experience_years: { type: Number, min: 0 },
    languages_spoken: [{ type: String }]
  },
  
  agency_info: {
    agency_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    employment_type: { type: String, enum: ['full-time', 'part-time', 'contract'], default: 'full-time' },
    hourly_rate: { type: Number, required: true },
    hire_date: { type: Date, default: Date.now },
    employment_status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' }
  },
  
  location_info: {
    current_location: {
      type: { type: String, default: 'Point' },
      coordinates: [{ type: Number }] // [longitude, latitude]
    },
    service_radius: { type: Number, default: 10 }, // in kilometers
    preferred_areas: [{ type: String }],
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zipcode: { type: String },
      country: { type: String, default: 'India' }
    }
  },
  
  availability: {
    schedule: [{
      day: { 
        type: String, 
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] 
      },
      start_time: { type: String },
      end_time: { type: String },
      available: { type: Boolean, default: true }
    }],
    time_off: [{
      start_date: { type: Date },
      end_date: { type: Date },
      reason: { type: String },
      approved: { type: Boolean, default: false }
    }],
    max_daily_assignments: { type: Number, default: 3 },
    currently_available: { type: Boolean, default: true },
    // Legacy compatibility
    days: [{ type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }],
    hours: {
      start: { type: String },
      end: { type: String }
    }
  },
  
  performance_metrics: {
    total_assignments: { type: Number, default: 0 },
    completed_assignments: { type: Number, default: 0 },
    average_rating: { type: Number, default: 0, min: 0, max: 5 },
    total_reviews: { type: Number, default: 0 },
    on_time_percentage: { type: Number, default: 0 },
    patient_satisfaction_score: { type: Number, default: 0 },
    teleconsults_initiated: { type: Number, default: 0 }
  },
  
  device_info: {
    device_token: { type: String }, // for push notifications
    app_version: { type: String },
    last_location_update: { type: Date },
    gps_enabled: { type: Boolean, default: false }
  },
  
  verification_status: {
    background_check: { type: Boolean, default: false },
    license_verified: { type: Boolean, default: false },
    training_completed: { type: Boolean, default: false },
    admin_approved: { type: Boolean, default: false }
  },
  
  financial_info: {
    bank_account: {
      account_number: { type: String }, // Should be encrypted in production
      ifsc_code: { type: String },
      account_holder_name: { type: String },
      bank_name: { type: String }
    },
    pan_number: { type: String }, // Should be encrypted in production
    total_earnings: { type: Number, default: 0 },
    pending_payments: { type: Number, default: 0 }
  },
  
  status: { 
    type: String, 
    enum: ['pending', 'active', 'inactive', 'suspended'], 
    default: 'pending' 
  },
  
  // Legacy fields for backward compatibility
  name: { type: String },
  email: { type: String },
  password: { type: String },
  phone: { type: String },
  specializations: [{ type: String }],
  experience_years: { type: Number },
  hourly_rate: { type: Number },
  experience: { type: String },
  rating: { type: Number, default: 0 },
  total_reviews: { type: Number, default: 0 },
  location: {
    city: { type: String },
    state: { type: String },
    zipcode: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  bio: { type: String, maxlength: 500 },
  certifications: [{ type: String }],
  languages: [{ type: String }],
  agency_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
  is_verified: { type: Boolean, default: false },
  
  last_active: { type: Date },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
nurseSchema.index({ "location_info.current_location": "2dsphere" });
nurseSchema.index({ "agency_info.agency_id": 1 });
nurseSchema.index({ "personal_info.email": 1 }, { unique: true });
nurseSchema.index({ "professional_info.license_number": 1 }, { unique: true });
nurseSchema.index({ "nurse_id": 1 }, { unique: true });
nurseSchema.index({ "status": 1 });
nurseSchema.index({ "availability.currently_available": 1 });

// Pre-save middleware to update timestamps and legacy fields
nurseSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Auto-populate legacy fields for backward compatibility
  if (this.personal_info?.full_name) {
    this.name = this.personal_info.full_name;
    this.email = this.personal_info.email;
    this.phone = this.personal_info.phone;
  }
  if (this.professional_info?.specializations) {
    this.specializations = this.professional_info.specializations;
  }
  if (this.professional_info?.experience_years) {
    this.experience_years = this.professional_info.experience_years;
  }
  if (this.agency_info?.hourly_rate) {
    this.hourly_rate = this.agency_info.hourly_rate;
  }
  if (this.agency_info?.agency_id) {
    this.agency_id = this.agency_info.agency_id;
  }
  if (this.performance_metrics?.average_rating) {
    this.rating = this.performance_metrics.average_rating;
  }
  if (this.performance_metrics?.total_reviews) {
    this.total_reviews = this.performance_metrics.total_reviews;
  }
  if (this.location_info?.address) {
    this.location = {
      city: this.location_info.address.city,
      state: this.location_info.address.state,
      zipcode: this.location_info.address.zipcode,
      coordinates: this.location_info.current_location ? {
        lat: this.location_info.current_location.coordinates[1],
        lng: this.location_info.current_location.coordinates[0]
      } : {}
    };
  }
  if (this.verification_status?.admin_approved) {
    this.is_verified = this.verification_status.admin_approved;
  }
  if (this.availability?.schedule?.length > 0) {
    this.availability.days = this.availability.schedule.map(s => 
      s.day.charAt(0).toUpperCase() + s.day.slice(1)
    );
    const firstSchedule = this.availability.schedule[0];
    if (firstSchedule) {
      this.availability.hours = {
        start: firstSchedule.start_time,
        end: firstSchedule.end_time
      };
    }
  }
  
  next();
});

// Method to calculate completion rate
nurseSchema.methods.getCompletionRate = function() {
  if (this.performance_metrics.total_assignments === 0) return 0;
  return (this.performance_metrics.completed_assignments / this.performance_metrics.total_assignments) * 100;
};

// Method to check if nurse is available for assignment
nurseSchema.methods.isAvailableForAssignment = function() {
  return this.status === 'active' && 
         this.availability.currently_available && 
         this.verification_status.admin_approved;
};

// Static method to find available nurses in area
nurseSchema.statics.findAvailableInArea = function(longitude, latitude, radiusKm = 10) {
  return this.find({
    status: 'active',
    'availability.currently_available': true,
    'verification_status.admin_approved': true,
    'location_info.current_location': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: radiusKm * 1000 // Convert km to meters
      }
    }
  }).populate('agency_info.agency_id', 'name contact_info');
};

const Nurse = mongoose.model('Nurse', nurseSchema);
module.exports = Nurse;