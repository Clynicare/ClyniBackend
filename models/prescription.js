const mongoose = require('mongoose');

const prescriptionSchema = new mongoose.Schema({
  prescription_id: { 
    type: String, 
    unique: true, 
    default: () => `rx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
  },
  
  medical_info: {
    doctor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    patient_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    booking_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    telesession_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TeleSession' },
    consultation_date: { type: Date, required: true },
    diagnosis: { type: String, required: true },
    symptoms: [{ type: String }],
    vital_signs: {
      blood_pressure: { type: String },
      heart_rate: { type: Number },
      temperature: { type: Number },
      oxygen_saturation: { type: Number },
      weight: { type: Number },
      height: { type: Number }
    }
  },
  
  medications: [{
    medicine_name: { type: String, required: true },
    generic_name: { type: String },
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    duration: { type: String, required: true },
    instructions: { type: String },
    quantity: { type: String },
    refills_allowed: { type: Number, default: 0 },
    drug_interactions: [{ type: String }],
    side_effects: [{ type: String }]
  }],
  
  recommendations: {
    lifestyle_changes: [{ type: String }],
    dietary_restrictions: [{ type: String }],
    follow_up_instructions: { type: String },
    next_appointment: { type: Date },
    lab_tests_required: [{ type: String }],
    specialist_referral: {
      required: { type: Boolean, default: false },
      specialization: { type: String },
      urgency: { type: String, enum: ['routine', 'urgent', 'emergency'] }
    }
  },
  
  digital_signature: {
    doctor_signature: { type: String }, // Base64 encoded signature
    digital_certificate: { type: String },
    signature_timestamp: { type: Date },
    verification_hash: { type: String }
  },
  
  file_storage: {
    pdf_url: { type: String }, // Generated PDF prescription
    original_file_url: { type: String },
    file_size: { type: Number },
    file_type: { type: String, default: 'application/pdf' },
    cloud_storage_path: { type: String },
    download_count: { type: Number, default: 0 },
    last_downloaded: { type: Date }
  },
  
  legal_compliance: {
    medical_license_number: { type: String },
    prescription_number: { 
      type: String, 
      unique: true,
      default: () => `PX${Date.now()}${Math.floor(Math.random() * 1000)}`
    },
    regulatory_approval: { type: Boolean, default: true },
    controlled_substance: { type: Boolean, default: false },
    dea_number: { type: String }, // If controlled substance
    patient_consent: { type: Boolean, default: true },
    privacy_compliance: { type: Boolean, default: true }
  },
  
  sharing_permissions: {
    patient_access: { type: Boolean, default: true },
    pharmacy_sharing: { type: Boolean, default: true },
    insurance_sharing: { type: Boolean, default: false },
    family_sharing: { type: Boolean, default: false },
    emergency_access: { type: Boolean, default: true }
  },
  
  audit_trail: [{
    action: { type: String },
    performed_by: { type: mongoose.Schema.Types.ObjectId },
    timestamp: { type: Date },
    ip_address: { type: String },
    user_agent: { type: String },
    details: { type: mongoose.Schema.Types.Mixed }
  }],
  
  validity: {
    issued_date: { type: Date, default: Date.now },
    expiry_date: { type: Date },
    valid: { type: Boolean, default: true },
    cancellation_reason: { type: String },
    cancelled_by: { type: mongoose.Schema.Types.ObjectId },
    cancelled_at: { type: Date }
  },
  
  status: { 
    type: String, 
    enum: ['draft', 'issued', 'dispensed', 'expired', 'cancelled'], 
    default: 'draft' 
  },
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
prescriptionSchema.index({ "medical_info.patient_id": 1 });
prescriptionSchema.index({ "medical_info.doctor_id": 1 });
prescriptionSchema.index({ "prescription_id": 1 }, { unique: true });
prescriptionSchema.index({ "legal_compliance.prescription_number": 1 }, { unique: true });
prescriptionSchema.index({ "medical_info.consultation_date": -1 });
prescriptionSchema.index({ "status": 1 });

// Pre-save middleware
prescriptionSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Set expiry date if not set (default 30 days for most prescriptions)
  if (!this.validity.expiry_date && this.validity.issued_date) {
    this.validity.expiry_date = new Date(this.validity.issued_date.getTime() + (30 * 24 * 60 * 60 * 1000));
  }
  
  // Add audit trail entry for creation/modification
  if (this.isNew) {
    this.audit_trail.push({
      action: 'created',
      performed_by: this.medical_info.doctor_id,
      timestamp: new Date(),
      details: { status: this.status }
    });
  } else if (this.isModified()) {
    this.audit_trail.push({
      action: 'modified',
      performed_by: this.medical_info.doctor_id,
      timestamp: new Date(),
      details: { 
        modified_fields: this.modifiedPaths(),
        status: this.status 
      }
    });
  }
  
  next();
});

// Method to check if prescription is valid
prescriptionSchema.methods.isValid = function() {
  return this.validity.valid && 
         this.status !== 'cancelled' && 
         this.status !== 'expired' &&
         (!this.validity.expiry_date || this.validity.expiry_date > new Date());
};

// Method to generate PDF URL
prescriptionSchema.methods.generatePDFUrl = function() {
  if (!this.file_storage.pdf_url) {
    this.file_storage.pdf_url = `https://storage.clynicare.com/prescriptions/${this.prescription_id}.pdf`;
  }
  return this.file_storage.pdf_url;
};

// Method to track download
prescriptionSchema.methods.trackDownload = function() {
  this.file_storage.download_count = (this.file_storage.download_count || 0) + 1;
  this.file_storage.last_downloaded = new Date();
  
  this.audit_trail.push({
    action: 'downloaded',
    timestamp: new Date(),
    details: { download_count: this.file_storage.download_count }
  });
  
  return this.save();
};

// Static method to find prescriptions for patient
prescriptionSchema.statics.findForPatient = function(patientId, options = {}) {
  const query = { 'medical_info.patient_id': patientId };
  
  if (options.validOnly) {
    query['validity.valid'] = true;
    query['status'] = { $nin: ['cancelled', 'expired'] };
  }
  
  return this.find(query)
    .populate('medical_info.doctor_id', 'name specialization')
    .sort({ 'medical_info.consultation_date': -1 });
};

// Static method to find prescriptions for doctor
prescriptionSchema.statics.findForDoctor = function(doctorId, options = {}) {
  const query = { 'medical_info.doctor_id': doctorId };
  
  if (options.dateRange) {
    query['medical_info.consultation_date'] = {
      $gte: options.dateRange.start,
      $lte: options.dateRange.end
    };
  }
  
  return this.find(query)
    .populate('medical_info.patient_id', 'name email phone')
    .sort({ 'medical_info.consultation_date': -1 });
};

const Prescription = mongoose.model('Prescription', prescriptionSchema);
module.exports = Prescription;
