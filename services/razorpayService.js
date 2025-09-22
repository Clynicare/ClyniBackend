const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayService {
  constructor() {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.warn('⚠️ Razorpay credentials not configured');
      this.razorpay = null;
      return;
    }

    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    console.log('✅ Razorpay initialized');
  }

  /**
   * Create an order for UPI payment
   * @param {Object} orderData - Order details
   * @param {number} orderData.amount - Amount in paise (₹1 = 100 paise)
   * @param {string} orderData.currency - Currency (default: INR)
   * @param {string} orderData.receipt - Unique receipt ID
   * @param {Object} orderData.notes - Additional notes
   * @returns {Promise<Object>} Razorpay order object
   */
  async createOrder(orderData) {
    try {
      if (!this.razorpay) {
        throw new Error('Razorpay not initialized - check credentials');
      }

      const options = {
        amount: orderData.amount, // Amount in paise
        currency: orderData.currency || 'INR',
        receipt: orderData.receipt,
        notes: orderData.notes || {},
        payment_capture: 1, // Auto capture payment
      };

      const order = await this.razorpay.orders.create(options);
      
      console.log('✅ Razorpay order created:', order.id);
      return {
        success: true,
        order: order,
        key_id: process.env.RAZORPAY_KEY_ID, // Frontend needs this
      };
    } catch (error) {
      console.error('❌ Error creating Razorpay order:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  /**
   * Verify payment signature
   * @param {Object} paymentData - Payment verification data
   * @param {string} paymentData.razorpay_order_id - Order ID from Razorpay
   * @param {string} paymentData.razorpay_payment_id - Payment ID from Razorpay
   * @param {string} paymentData.razorpay_signature - Signature from Razorpay
   * @returns {boolean} Verification result
   */
  verifyPaymentSignature(paymentData) {
    try {
      if (!this.razorpay) {
        throw new Error('Razorpay not initialized - check credentials');
      }

      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      } = paymentData;

      // Create expected signature
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

      const isValid = expectedSignature === razorpay_signature;
      
      if (isValid) {
        console.log('✅ Payment signature verified:', razorpay_payment_id);
      } else {
        console.error('❌ Payment signature verification failed:', razorpay_payment_id);
      }

      return isValid;
    } catch (error) {
      console.error('❌ Error verifying payment signature:', error);
      return false;
    }
  }

  /**
   * Get payment details
   * @param {string} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} Payment details
   */
  async getPaymentDetails(paymentId) {
    try {
      if (!this.razorpay) {
        throw new Error('Razorpay not initialized - check credentials');
      }

      const payment = await this.razorpay.payments.fetch(paymentId);
      return payment;
    } catch (error) {
      console.error('❌ Error fetching payment details:', error);
      throw new Error(`Failed to fetch payment: ${error.message}`);
    }
  }

  /**
   * Refund payment
   * @param {string} paymentId - Razorpay payment ID
   * @param {number} amount - Refund amount in paise (optional, full refund if not provided)
   * @returns {Promise<Object>} Refund details
   */
  async refundPayment(paymentId, amount = null) {
    try {
      if (!this.razorpay) {
        throw new Error('Razorpay not initialized - check credentials');
      }

      const refundData = amount ? { amount } : {};
      const refund = await this.razorpay.payments.refund(paymentId, refundData);
      
      console.log('✅ Refund processed:', refund.id);
      return refund;
    } catch (error) {
      console.error('❌ Error processing refund:', error);
      throw new Error(`Failed to process refund: ${error.message}`);
    }
  }
}

module.exports = new RazorpayService();
