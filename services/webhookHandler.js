/**
 * Razorpay Webhook Handler for Clynicare
 * Handles real-time payment events from Razorpay
 */

const crypto = require('crypto');
const Payment = require('../models/payment');
const Booking = require('../models/booking');
const NotificationService = require('./notificationService');

class RazorpayWebhookHandler {
  
  /**
   * Verify webhook signature
   */
  static verifyWebhookSignature(body, signature) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(JSON.stringify(body))
        .digest('hex');
      
      return signature === expectedSignature;
    } catch (error) {
      console.error('❌ Webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Handle payment captured event
   */
  static async handlePaymentCaptured(paymentData) {
    try {
      console.log('✅ [WEBHOOK] Payment captured:', paymentData.id);
      
      const payment = await Payment.findOne({ 
        razorpay_payment_id: paymentData.id 
      });
      
      if (payment) {
        payment.status = 'captured';
        payment.captured_at = new Date();
        payment.payment_details.captured_amount = paymentData.amount / 100;
        await payment.save();
        
        // Update booking status
        const booking = await Booking.findById(payment.booking_id);
        if (booking) {
          booking.payment_status = 'completed';
          await booking.save();
          
          // Send confirmation notification
          await NotificationService.sendPaymentConfirmation(
            booking.user_id,
            booking,
            payment.amount
          );
        }
      }
      
    } catch (error) {
      console.error('❌ [WEBHOOK] Error handling payment captured:', error);
      throw error;
    }
  }

  /**
   * Handle payment failed event
   */
  static async handlePaymentFailed(paymentData) {
    try {
      console.log('❌ [WEBHOOK] Payment failed:', paymentData.id);
      
      const payment = await Payment.findOne({ 
        razorpay_order_id: paymentData.order_id 
      });
      
      if (payment) {
        payment.status = 'failed';
        payment.failure_reason = paymentData.error_description;
        payment.failed_at = new Date();
        await payment.save();
        
        // Update booking status
        const booking = await Booking.findById(payment.booking_id);
        if (booking) {
          booking.payment_status = 'failed';
          await booking.save();
          
          // Send failure notification
          await NotificationService.sendPaymentFailureNotification(
            booking.user_id,
            booking,
            paymentData.error_description
          );
        }
      }
      
    } catch (error) {
      console.error('❌ [WEBHOOK] Error handling payment failed:', error);
      throw error;
    }
  }

  /**
   * Handle refund processed event
   */
  static async handleRefundProcessed(refundData) {
    try {
      console.log('💸 [WEBHOOK] Refund processed:', refundData.id);
      
      const payment = await Payment.findOne({ 
        razorpay_payment_id: refundData.payment_id 
      });
      
      if (payment) {
        payment.refund_details = {
          refund_id: refundData.id,
          amount: refundData.amount / 100,
          status: refundData.status,
          processed_at: new Date()
        };
        
        if (refundData.status === 'processed') {
          payment.status = 'refunded';
        }
        
        await payment.save();
        
        // Update booking status
        const booking = await Booking.findById(payment.booking_id);
        if (booking) {
          booking.payment_status = 'refunded';
          await booking.save();
          
          // Send refund confirmation
          await NotificationService.sendRefundConfirmation(
            booking.user_id,
            booking,
            refundData.amount / 100
          );
        }
      }
      
    } catch (error) {
      console.error('❌ [WEBHOOK] Error handling refund processed:', error);
      throw error;
    }
  }

  /**
   * Main webhook handler
   */
  static async handleWebhook(body, signature) {
    try {
      // Verify signature
      if (!this.verifyWebhookSignature(body, signature)) {
        throw new Error('Invalid webhook signature');
      }

      const { event, payload } = body;
      
      console.log(`📥 [WEBHOOK] Received event: ${event}`);
      
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
          
        case 'order.paid':
          console.log('💰 [WEBHOOK] Order paid event received');
          // Additional handling if needed
          break;
          
        default:
          console.log(`⚠️  [WEBHOOK] Unhandled event type: ${event}`);
      }
      
      return { success: true, event };
      
    } catch (error) {
      console.error('❌ [WEBHOOK] Handler error:', error);
      throw error;
    }
  }
}

module.exports = RazorpayWebhookHandler;
