const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema({
  settlement_id: { 
    type: String, 
    unique: true, 
    default: () => `settle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` 
  },
  
  billing_period: {
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    period_type: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' }
  },
  
  transaction_summary: {
    total_bookings: { type: Number, default: 0 },
    total_revenue: { type: Number, default: 0 },
    total_settlements: { type: Number, default: 0 },
    pending_settlements: { type: Number, default: 0 },
    failed_settlements: { type: Number, default: 0 }
  },
  
  agency_settlements: [{
    agency_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    bookings: [{
      booking_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
      service_amount: { type: Number },
      agency_percentage: { type: Number, default: 60 },
      agency_share: { type: Number },
      platform_fee: { type: Number },
      doctor_fee: { type: Number },
      settlement_status: { type: String, enum: ['pending', 'processed', 'failed'] }
    }],
    total_agency_earnings: { type: Number, default: 0 },
    total_platform_fees: { type: Number, default: 0 },
    total_doctor_fees: { type: Number, default: 0 },
    settlement_status: { 
      type: String, 
      enum: ['pending', 'processing', 'completed', 'failed'], 
      default: 'pending' 
    },
    bank_transfer: {
      transfer_id: { type: String },
      bank_account: { type: String },
      transfer_amount: { type: Number },
      transfer_date: { type: Date },
      transfer_status: { 
        type: String, 
        enum: ['initiated', 'processing', 'completed', 'failed'] 
      },
      transaction_reference: { type: String },
      failure_reason: { type: String }
    }
  }],
  
  doctor_settlements: [{
    doctor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    consultations: [{
      telesession_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TeleSession' },
      consultation_fee: { type: Number },
      doctor_percentage: { type: Number, default: 25 },
      doctor_share: { type: Number },
      platform_fee: { type: Number },
      settlement_status: { type: String, enum: ['pending', 'processed', 'failed'] }
    }],
    total_doctor_earnings: { type: Number, default: 0 },
    total_platform_fees: { type: Number, default: 0 },
    settlement_status: { 
      type: String, 
      enum: ['pending', 'processing', 'completed', 'failed'], 
      default: 'pending' 
    },
    bank_transfer: {
      transfer_id: { type: String },
      bank_account: { type: String },
      transfer_amount: { type: Number },
      transfer_date: { type: Date },
      transfer_status: { 
        type: String, 
        enum: ['initiated', 'processing', 'completed', 'failed'] 
      },
      transaction_reference: { type: String },
      failure_reason: { type: String }
    }
  }],
  
  platform_summary: {
    total_platform_revenue: { type: Number, default: 0 },
    agency_commissions: { type: Number, default: 0 },
    doctor_fees: { type: Number, default: 0 },
    net_platform_earnings: { type: Number, default: 0 },
    operational_costs: { type: Number, default: 0 },
    profit_margin: { type: Number, default: 0 }
  },
  
  tax_information: {
    tax_period: { type: String },
    tds_deducted: { type: Number, default: 0 },
    gst_collected: { type: Number, default: 0 },
    tax_filing_required: { type: Boolean, default: false },
    tax_documents_generated: { type: Boolean, default: false },
    accountant_notification_sent: { type: Boolean, default: false }
  },
  
  compliance_checks: {
    fraud_screening_passed: { type: Boolean, default: true },
    regulatory_compliance: { type: Boolean, default: true },
    audit_trail_complete: { type: Boolean, default: true },
    manual_review_required: { type: Boolean, default: false },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    approval_date: { type: Date }
  },
  
  processing_details: {
    auto_generated: { type: Boolean, default: true },
    generated_by: { type: mongoose.Schema.Types.ObjectId },
    processing_start_time: { type: Date },
    processing_end_time: { type: Date },
    total_processing_time: { type: Number }, // in seconds
    errors_encountered: [{ type: String }],
    retry_attempts: { type: Number, default: 0 }
  },
  
  status: { 
    type: String, 
    enum: ['draft', 'processing', 'completed', 'failed', 'cancelled'], 
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
settlementSchema.index({ "billing_period.start_date": -1 });
settlementSchema.index({ "agency_settlements.agency_id": 1 });
settlementSchema.index({ "doctor_settlements.doctor_id": 1 });
settlementSchema.index({ "settlement_id": 1 }, { unique: true });
settlementSchema.index({ "status": 1 });

// Pre-save middleware to calculate totals
settlementSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Calculate agency settlement totals
  this.agency_settlements.forEach(agencySettlement => {
    agencySettlement.total_agency_earnings = agencySettlement.bookings.reduce(
      (total, booking) => total + (booking.agency_share || 0), 0
    );
    agencySettlement.total_platform_fees = agencySettlement.bookings.reduce(
      (total, booking) => total + (booking.platform_fee || 0), 0
    );
    agencySettlement.total_doctor_fees = agencySettlement.bookings.reduce(
      (total, booking) => total + (booking.doctor_fee || 0), 0
    );
  });
  
  // Calculate doctor settlement totals
  this.doctor_settlements.forEach(doctorSettlement => {
    doctorSettlement.total_doctor_earnings = doctorSettlement.consultations.reduce(
      (total, consultation) => total + (consultation.doctor_share || 0), 0
    );
    doctorSettlement.total_platform_fees = doctorSettlement.consultations.reduce(
      (total, consultation) => total + (consultation.platform_fee || 0), 0
    );
  });
  
  // Calculate transaction summary
  this.transaction_summary.total_revenue = this.agency_settlements.reduce(
    (total, agency) => total + agency.total_agency_earnings + agency.total_platform_fees + agency.total_doctor_fees, 0
  );
  
  this.transaction_summary.total_settlements = this.agency_settlements.length + this.doctor_settlements.length;
  
  // Calculate platform summary
  this.platform_summary.agency_commissions = this.agency_settlements.reduce(
    (total, agency) => total + agency.total_platform_fees, 0
  );
  
  this.platform_summary.doctor_fees = this.doctor_settlements.reduce(
    (total, doctor) => total + doctor.total_doctor_earnings, 0
  );
  
  this.platform_summary.total_platform_revenue = this.platform_summary.agency_commissions + 
    this.doctor_settlements.reduce((total, doctor) => total + doctor.total_platform_fees, 0);
  
  this.platform_summary.net_platform_earnings = this.platform_summary.total_platform_revenue - 
    this.platform_summary.operational_costs;
  
  next();
});

// Method to initiate settlement processing
settlementSchema.methods.initiateSettlement = async function() {
  this.status = 'processing';
  this.processing_details.processing_start_time = new Date();
  
  // Process agency settlements
  for (let agencySettlement of this.agency_settlements) {
    try {
      // Simulate bank transfer initiation
      agencySettlement.bank_transfer = {
        transfer_id: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        transfer_amount: agencySettlement.total_agency_earnings,
        transfer_date: new Date(),
        transfer_status: 'initiated'
      };
      agencySettlement.settlement_status = 'processing';
    } catch (error) {
      agencySettlement.settlement_status = 'failed';
      this.processing_details.errors_encountered.push(`Agency ${agencySettlement.agency_id}: ${error.message}`);
    }
  }
  
  // Process doctor settlements
  for (let doctorSettlement of this.doctor_settlements) {
    try {
      // Simulate bank transfer initiation
      doctorSettlement.bank_transfer = {
        transfer_id: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        transfer_amount: doctorSettlement.total_doctor_earnings,
        transfer_date: new Date(),
        transfer_status: 'initiated'
      };
      doctorSettlement.settlement_status = 'processing';
    } catch (error) {
      doctorSettlement.settlement_status = 'failed';
      this.processing_details.errors_encountered.push(`Doctor ${doctorSettlement.doctor_id}: ${error.message}`);
    }
  }
  
  this.processing_details.processing_end_time = new Date();
  this.processing_details.total_processing_time = 
    (this.processing_details.processing_end_time - this.processing_details.processing_start_time) / 1000;
  
  // Update status based on results
  const hasFailures = this.agency_settlements.some(a => a.settlement_status === 'failed') ||
                     this.doctor_settlements.some(d => d.settlement_status === 'failed');
  
  if (hasFailures) {
    this.status = 'failed';
  } else {
    this.status = 'completed';
  }
  
  return this.save();
};

// Static method to generate weekly settlement
settlementSchema.statics.generateWeeklySettlement = async function(startDate, endDate) {
  const Booking = mongoose.model('Booking');
  const TeleSession = mongoose.model('TeleSession');
  
  // Get completed bookings in the period
  const bookings = await Booking.find({
    status: 'completed',
    createdAt: { $gte: startDate, $lte: endDate }
  }).populate('agency_id user_id');
  
  // Get completed tele sessions in the period
  const teleSessions = await TeleSession.find({
    status: 'completed',
    'session_details.start_time': { $gte: startDate, $lte: endDate }
  }).populate('participants.doctor.doctor_id');
  
  // Group by agency
  const agencyGroups = {};
  bookings.forEach(booking => {
    const agencyId = booking.agency_id?._id?.toString();
    if (agencyId) {
      if (!agencyGroups[agencyId]) {
        agencyGroups[agencyId] = {
          agency_id: booking.agency_id._id,
          bookings: []
        };
      }
      
      const serviceAmount = booking.total_amount || 0;
      const agencyShare = serviceAmount * 0.60;
      const platformFee = serviceAmount * 0.15;
      const doctorFee = serviceAmount * 0.25;
      
      agencyGroups[agencyId].bookings.push({
        booking_id: booking._id,
        service_amount: serviceAmount,
        agency_percentage: 60,
        agency_share: agencyShare,
        platform_fee: platformFee,
        doctor_fee: doctorFee,
        settlement_status: 'pending'
      });
    }
  });
  
  // Group by doctor
  const doctorGroups = {};
  teleSessions.forEach(session => {
    const doctorId = session.participants?.doctor?.doctor_id?._id?.toString();
    if (doctorId) {
      if (!doctorGroups[doctorId]) {
        doctorGroups[doctorId] = {
          doctor_id: session.participants.doctor.doctor_id._id,
          consultations: []
        };
      }
      
      const consultationFee = session.billing_info?.consultation_fee || 500; // Default fee
      const doctorShare = consultationFee * 0.75; // Doctor gets 75% of consultation fee
      const platformFee = consultationFee * 0.25;
      
      doctorGroups[doctorId].consultations.push({
        telesession_id: session._id,
        consultation_fee: consultationFee,
        doctor_percentage: 75,
        doctor_share: doctorShare,
        platform_fee: platformFee,
        settlement_status: 'pending'
      });
    }
  });
  
  // Create settlement document
  const settlement = new this({
    billing_period: {
      start_date: startDate,
      end_date: endDate,
      period_type: 'weekly'
    },
    agency_settlements: Object.values(agencyGroups),
    doctor_settlements: Object.values(doctorGroups)
  });
  
  return settlement.save();
};

const Settlement = mongoose.model('Settlement', settlementSchema);
module.exports = Settlement;
