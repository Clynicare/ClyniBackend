const Razorpay = require('razorpay');
const crypto = require('crypto');
const Settlement = require('../models/settlement');
const Booking = require('../models/booking');
const TeleSession = require('../models/teleSession');
const { redisClient } = require('../middleware');
const notificationService = require('./notificationService');

class PaymentService {
  
  constructor() {
    // Initialize Razorpay
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    
    // Payment configuration
    this.config = {
      currency: 'INR',
      receipt_prefix: 'CLYNI',
      agency_share_percentage: 60,
      doctor_share_percentage: 25,
      platform_fee_percentage: 15,
      gst_percentage: 18,
      tds_percentage: 2
    };
  }
  
  /**
   * Create payment order for booking
   */
  async createPaymentOrder(bookingId, userId, paymentData) {
    try {
      console.log('💳 Creating payment order for booking:', bookingId);
      
      // Validate booking
      const booking = await Booking.findById(bookingId).populate('user_id service_id');
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.user_id._id.toString() !== userId.toString()) {
        throw new Error('Unauthorized payment attempt');
      }
      
      if (booking.payment_status === 'completed') {
        throw new Error('Payment already completed for this booking');
      }
      
      const amount = paymentData.amount || booking.total_amount;
      if (!amount || amount <= 0) {
        throw new Error('Invalid payment amount');
      }
      
      // Create Razorpay order
      const orderOptions = {
        amount: Math.round(amount * 100), // Convert to paisa
        currency: this.config.currency,
        receipt: `${this.config.receipt_prefix}_${bookingId}_${Date.now()}`,
        payment_capture: 1,
        notes: {
          booking_id: bookingId.toString(),
          user_id: userId.toString(),
          service_type: booking.service_id?.service_name || 'Healthcare Service'
        }
      };
      
      const razorpayOrder = await this.razorpay.orders.create(orderOptions);
      
      // Store payment order details in Redis for verification
      const paymentDetails = {
        razorpay_order_id: razorpayOrder.id,
        booking_id: bookingId.toString(),
        user_id: userId.toString(),
        amount: amount,
        currency: this.config.currency,
        created_at: new Date(),
        status: 'created'
      };
      
      await redisClient.setEx(
        `payment:${razorpayOrder.id}`,
        3600, // 1 hour expiry
        JSON.stringify(paymentDetails)
      );
      
      // Update booking with payment order details
      booking.payment_details = {
        razorpay_order_id: razorpayOrder.id,
        amount: amount,
        currency: this.config.currency,
        payment_method: paymentData.payment_method || 'online'
      };
      booking.payment_status = 'pending';
      await booking.save();
      
      console.log('✅ Payment order created successfully:', razorpayOrder.id);
      
      return {
        success: true,
        order_id: razorpayOrder.id,
        amount: amount,
        currency: this.config.currency,
        key: process.env.RAZORPAY_KEY_ID,
        name: 'Clynicare',
        description: `Payment for ${booking.service_id?.service_name || 'Healthcare Service'}`,
        image: 'https://clynicare.com/logo.png',
        prefill: {
          name: booking.user_id.name,
          email: booking.user_id.email,
          contact: booking.user_id.phone
        },
        theme: {
          color: '#3B82F6'
        },
        notes: orderOptions.notes
      };
      
    } catch (error) {
      console.error('❌ Error creating payment order:', error);
      throw error;
    }
  }
  
  /**
   * Verify and process payment
   */
  async verifyAndProcessPayment(paymentData) {
    try {
      console.log('🔍 Verifying payment:', paymentData.razorpay_order_id);
      
      // Verify payment signature
      const signature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${paymentData.razorpay_order_id}|${paymentData.razorpay_payment_id}`)
        .digest('hex');
      
      if (signature !== paymentData.razorpay_signature) {
        throw new Error('Invalid payment signature');
      }
      
      // Get payment details from Redis
      const storedPayment = await redisClient.get(`payment:${paymentData.razorpay_order_id}`);
      if (!storedPayment) {
        throw new Error('Payment order not found or expired');
      }
      
      const paymentDetails = JSON.parse(storedPayment);
      
      // Fetch payment details from Razorpay
      const razorpayPayment = await this.razorpay.payments.fetch(paymentData.razorpay_payment_id);
      
      if (razorpayPayment.status !== 'captured') {
        throw new Error('Payment not captured successfully');
      }
      
      // Update booking with payment completion
      const booking = await Booking.findById(paymentDetails.booking_id);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      booking.payment_details = {
        ...booking.payment_details,
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_signature: paymentData.razorpay_signature,
        payment_status: 'captured',
        paid_amount: razorpayPayment.amount / 100, // Convert back to rupees
        payment_method: razorpayPayment.method,
        bank: razorpayPayment.bank,
        card_id: razorpayPayment.card_id,
        paid_at: new Date(razorpayPayment.created_at * 1000)
      };
      booking.payment_status = 'completed';
      await booking.save();
      
      // Calculate settlement breakdown
      const settlementBreakdown = this.calculateSettlementBreakdown(razorpayPayment.amount / 100);
      
      // Store settlement data for future processing
      await this.storeSettlementData(booking, settlementBreakdown);
      
      // Clean up Redis
      await redisClient.del(`payment:${paymentData.razorpay_order_id}`);
      
      // Send notifications
      await notificationService.sendPaymentConfirmation(
        booking.user_id,
        booking,
        razorpayPayment.amount / 100
      );
      
      console.log('✅ Payment verified and processed successfully');
      
      return {
        success: true,
        payment_id: razorpayPayment.id,
        booking_id: booking._id,
        amount_paid: razorpayPayment.amount / 100,
        settlement_breakdown: settlementBreakdown,
        receipt_url: await this.generateReceiptUrl(booking, razorpayPayment)
      };
      
    } catch (error) {
      console.error('❌ Error verifying payment:', error);
      throw error;
    }
  }
  
  /**
   * Process refund
   */
  async processRefund(bookingId, refundAmount, reason) {
    try {
      console.log('💸 Processing refund for booking:', bookingId);
      
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.payment_status !== 'completed') {
        throw new Error('Cannot refund incomplete payment');
      }
      
      const paymentId = booking.payment_details.razorpay_payment_id;
      if (!paymentId) {
        throw new Error('Payment ID not found');
      }
      
      // Create refund in Razorpay
      const refundOptions = {
        amount: Math.round(refundAmount * 100), // Convert to paisa
        speed: 'normal',
        notes: {
          booking_id: bookingId.toString(),
          reason: reason
        }
      };
      
      const refund = await this.razorpay.payments.refund(paymentId, refundOptions);
      
      // Update booking with refund details
      booking.payment_details.refund = {
        refund_id: refund.id,
        amount: refundAmount,
        status: refund.status,
        reason: reason,
        processed_at: new Date()
      };
      booking.payment_status = 'refunded';
      await booking.save();
      
      // Send refund notification
      await notificationService.sendRefundNotification(
        booking.user_id,
        booking,
        refundAmount
      );
      
      console.log('✅ Refund processed successfully:', refund.id);
      
      return {
        success: true,
        refund_id: refund.id,
        amount_refunded: refundAmount,
        status: refund.status
      };
      
    } catch (error) {
      console.error('❌ Error processing refund:', error);
      throw error;
    }
  }
  
  /**
   * Calculate settlement breakdown
   */
  calculateSettlementBreakdown(totalAmount) {
    const agencyShare = totalAmount * (this.config.agency_share_percentage / 100);
    const doctorShare = totalAmount * (this.config.doctor_share_percentage / 100);
    const platformFee = totalAmount * (this.config.platform_fee_percentage / 100);
    
    const gstAmount = totalAmount * (this.config.gst_percentage / 100);
    const tdsAmount = totalAmount * (this.config.tds_percentage / 100);
    
    return {
      total_amount: totalAmount,
      agency_share: agencyShare,
      doctor_share: doctorShare,
      platform_fee: platformFee,
      gst_amount: gstAmount,
      tds_amount: tdsAmount,
      net_agency_amount: agencyShare - tdsAmount,
      net_doctor_amount: doctorShare - tdsAmount,
      net_platform_amount: platformFee + gstAmount + (tdsAmount * 2) // Platform keeps TDS
    };
  }
  
  /**
   * Store settlement data for processing
   */
  async storeSettlementData(booking, settlementBreakdown) {
    try {
      // Store in Redis for immediate access
      const settlementData = {
        booking_id: booking._id.toString(),
        agency_id: booking.agency_id?.toString(),
        user_id: booking.user_id.toString(),
        settlement_breakdown: settlementBreakdown,
        created_at: new Date(),
        processed: false
      };
      
      await redisClient.lpush(
        'pending_settlements',
        JSON.stringify(settlementData)
      );
      
      console.log('💰 Settlement data stored for processing');
      
    } catch (error) {
      console.error('❌ Error storing settlement data:', error);
      throw error;
    }
  }
  
  /**
   * Process weekly settlements
   */
  async processWeeklySettlements() {
    try {
      console.log('🏦 Processing weekly settlements...');
      
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago
      
      // Generate settlement using the model's static method
      const settlement = await Settlement.generateWeeklySettlement(startDate, endDate);
      
      // Initiate settlement processing
      await settlement.initiateSettlement();
      
      console.log('✅ Weekly settlement processed:', settlement.settlement_id);
      
      return {
        success: true,
        settlement_id: settlement.settlement_id,
        period: { start_date: startDate, end_date: endDate },
        summary: settlement.transaction_summary
      };
      
    } catch (error) {
      console.error('❌ Error processing weekly settlements:', error);
      throw error;
    }
  }
  
  /**
   * Get payment analytics
   */
  async getPaymentAnalytics(startDate, endDate) {
    try {
      const analytics = await Booking.aggregate([
        {
          $match: {
            payment_status: 'completed',
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            total_revenue: { $sum: '$payment_details.paid_amount' },
            total_transactions: { $sum: 1 },
            avg_transaction_value: { $avg: '$payment_details.paid_amount' }
          }
        }
      ]);
      
      const refunds = await Booking.aggregate([
        {
          $match: {
            payment_status: 'refunded',
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            total_refunds: { $sum: '$payment_details.refund.amount' },
            refund_count: { $sum: 1 }
          }
        }
      ]);
      
      const result = analytics[0] || {};
      const refundData = refunds[0] || {};
      
      return {
        total_revenue: result.total_revenue || 0,
        total_transactions: result.total_transactions || 0,
        avg_transaction_value: result.avg_transaction_value || 0,
        total_refunds: refundData.total_refunds || 0,
        refund_count: refundData.refund_count || 0,
        net_revenue: (result.total_revenue || 0) - (refundData.total_refunds || 0),
        success_rate: result.total_transactions > 0 ? 
          ((result.total_transactions - refundData.refund_count) / result.total_transactions * 100) : 0
      };
      
    } catch (error) {
      console.error('❌ Error getting payment analytics:', error);
      throw error;
    }
  }
  
  /**
   * Generate receipt URL
   */
  async generateReceiptUrl(booking, payment) {
    // In production, generate and store actual receipt
    return `https://receipts.clynicare.com/${booking._id}_${payment.id}.pdf`;
  }
  
  /**
   * Webhook handler for Razorpay events
   */
  async handleWebhook(webhookData, signature) {
    try {
      // Verify webhook signature
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(JSON.stringify(webhookData))
        .digest('hex');
      
      if (signature !== expectedSignature) {
        throw new Error('Invalid webhook signature');
      }
      
      const { event, payload } = webhookData;
      
      switch (event) {
        case 'payment.captured':
          await this.handlePaymentCaptured(payload.payment.entity);
          break;
          
        case 'payment.failed':
          await this.handlePaymentFailed(payload.payment.entity);
          break;
          
        case 'refund.processed':
          await this.handleRefundProcessed(payload.refund.entity);
          break;
          
        default:
          console.log('Unhandled webhook event:', event);
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Error handling webhook:', error);
      throw error;
    }
  }
  
  async handlePaymentCaptured(payment) {
    console.log('✅ Payment captured webhook:', payment.id);
    // Handle successful payment capture
  }
  
  async handlePaymentFailed(payment) {
    console.log('❌ Payment failed webhook:', payment.id);
    // Handle payment failure
  }
  
  async handleRefundProcessed(refund) {
    console.log('💸 Refund processed webhook:', refund.id);
    // Handle refund completion
  }
}

module.exports = new PaymentService();
