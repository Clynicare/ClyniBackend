const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Razorpay payment details
  razorpay_order_id: {
    type: String,
    required: true
  },
  razorpay_payment_id: {
    type: String,
    required: true,
    unique: true
  },
  razorpay_signature: {
    type: String,
    required: true
  },
  
  // Payment information
  amount: {
    type: Number,
    required: true // Amount in paise
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['created', 'authorized', 'captured', 'refunded', 'failed'],
    default: 'created'
  },
  method: {
    type: String,
    enum: ['upi', 'card', 'netbanking', 'wallet'],
    default: 'upi'
  },
  
  // UPI specific details
  upi: {
    vpa: String, // Virtual Payment Address
    payer_bank_reference: String,
    payer_bank: String
  },
  
  // Related entities
  booking_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  
  // Verification status
  verified: {
    type: Boolean,
    default: false
  },
  
  // Refund details
  refund_id: String,
  refund_amount: Number,
  refund_status: {
    type: String,
    enum: ['pending', 'processed', 'failed'],
    default: null
  },
  refund_reason: String,
  refund_date: Date,
  
  // Additional metadata
  metadata: {
    type: Map,
    of: String,
    default: new Map()
  },
  
  // Timestamps
  payment_date: {
    type: Date,
    default: Date.now
  },
  
  // Webhook data
  webhook_received: {
    type: Boolean,
    default: false
  },
  webhook_data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
paymentSchema.index({ user_id: 1, payment_date: -1 });
paymentSchema.index({ razorpay_payment_id: 1 }, { unique: true });
paymentSchema.index({ razorpay_order_id: 1 });
paymentSchema.index({ booking_id: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ payment_date: -1 });

// Virtual for amount in rupees
paymentSchema.virtual('amount_rupees').get(function() {
  return this.amount / 100;
});

// Virtual for refund amount in rupees
paymentSchema.virtual('refund_amount_rupees').get(function() {
  return this.refund_amount ? this.refund_amount / 100 : 0;
});

// Instance method to check if payment can be refunded
paymentSchema.methods.canRefund = function() {
  return this.status === 'captured' && !this.refund_id;
};

// Instance method to get payment summary
paymentSchema.methods.getSummary = function() {
  return {
    id: this._id,
    razorpay_payment_id: this.razorpay_payment_id,
    amount: this.amount_rupees,
    currency: this.currency,
    status: this.status,
    method: this.method,
    verified: this.verified,
    payment_date: this.payment_date,
    can_refund: this.canRefund()
  };
};

// Static method to get user payments
paymentSchema.statics.getUserPayments = function(userId, options = {}) {
  const query = { user_id: userId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.booking_id) {
    query.booking_id = options.booking_id;
  }
  
  return this.find(query)
    .sort({ payment_date: -1 })
    .limit(options.limit || 50)
    .populate('booking_id', 'service_type date time');
};

// Static method to get payment stats
paymentSchema.statics.getPaymentStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { user_id: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        total_amount: { $sum: '$amount' }
      }
    }
  ]);
  
  return stats.reduce((acc, stat) => {
    acc[stat._id] = {
      count: stat.count,
      total_amount: stat.total_amount / 100 // Convert to rupees
    };
    return acc;
  }, {});
};

module.exports = mongoose.model('Payment', paymentSchema);
