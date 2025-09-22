/**
 * PhonePe Payment Gateway Integration Service for Clynicare
 * Features: UPI payments, secure transactions, webhook handling
 */

const crypto = require('crypto');
const axios = require('axios');

class PhonePeService {
  constructor() {
    this.merchantId = process.env.PHONEPE_MERCHANT_ID;
    this.saltKey = process.env.PHONEPE_SALT_KEY;
    this.saltIndex = process.env.PHONEPE_SALT_INDEX || 1;
    this.environment = process.env.PHONEPE_ENVIRONMENT || 'SANDBOX';
    this.callbackUrl = process.env.PHONEPE_CALLBACK_URL;
    this.redirectUrl = process.env.PHONEPE_REDIRECT_URL;
    
    // Set base URL based on environment
    this.baseUrl = this.environment === 'PRODUCTION' 
      ? 'https://api.phonepe.com/apis/hermes'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  }

  /**
   * Generate PhonePe checksum for request validation
   */
  generateChecksum(payload) {
    const string = payload + '/pg/v1/pay' + this.saltKey;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    return sha256 + '###' + this.saltIndex;
  }

  /**
   * Verify PhonePe checksum for response validation
   */
  verifyChecksum(response, receivedChecksum) {
    const string = response + this.saltKey;
    const sha256 = crypto.createHash('sha256').update(string).digest('hex');
    const expectedChecksum = sha256 + '###' + this.saltIndex;
    return expectedChecksum === receivedChecksum;
  }

  /**
   * Create payment order with PhonePe
   */
  async createPaymentOrder(bookingId, amount, userDetails) {
    try {
      console.log('💳 [PHONEPE] Creating payment order for booking:', bookingId);

      // Validate input
      if (!bookingId || !amount || amount <= 0) {
        throw new Error('Invalid booking ID or amount');
      }

      if (!userDetails || !userDetails.phone) {
        throw new Error('User phone number is required for PhonePe payments');
      }

      // Generate unique transaction ID
      const transactionId = `TXN_${bookingId}_${crypto.randomUUID().replace(/-/g, '')}`;
      const merchantUserId = `USER_${userDetails.id || crypto.randomUUID().replace(/-/g, '')}`;

      // Create payment payload
      const paymentPayload = {
        merchantId: this.merchantId,
        merchantTransactionId: transactionId,
        merchantUserId: merchantUserId,
        amount: Math.round(amount * 100), // Convert to paise
        redirectUrl: this.redirectUrl,
        redirectMode: 'POST',
        callbackUrl: this.callbackUrl,
        mobileNumber: userDetails.phone.replace(/[^0-9]/g, ''), // Clean phone number
        paymentInstrument: {
          type: 'PAY_PAGE'
        }
      };

      // Encode payload
      const base64Payload = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
      
      // Generate checksum
      const checksum = this.generateChecksum(base64Payload);

      // Prepare request
      const requestData = {
        request: base64Payload
      };

      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'accept': 'application/json'
      };

      console.log('🚀 [PHONEPE] Initiating payment request...');

      // Make API call to PhonePe
      const response = await axios.post(
        `${this.baseUrl}/pg/v1/pay`,
        requestData,
        { headers }
      );

      if (response.data.success) {
        console.log('✅ [PHONEPE] Payment order created successfully');
        
        return {
          success: true,
          transactionId: transactionId,
          merchantId: this.merchantId,
          amount: amount,
          checkoutUrl: response.data.data.instrumentResponse.redirectInfo.url,
          paymentPayload: paymentPayload
        };
      } else {
        throw new Error(response.data.message || 'Failed to create PhonePe payment order');
      }

    } catch (error) {
      console.error('❌ [PHONEPE] Payment order creation failed:', error.message);
      throw new Error(`PhonePe payment initiation failed: ${error.message}`);
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(transactionId) {
    try {
      console.log('🔍 [PHONEPE] Checking payment status for:', transactionId);

      const endpoint = `/pg/v1/status/${this.merchantId}/${transactionId}`;
      const string = endpoint + this.saltKey;
      const checksum = crypto.createHash('sha256').update(string).digest('hex') + '###' + this.saltIndex;

      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': this.merchantId,
        'accept': 'application/json'
      };

      const response = await axios.get(
        `${this.baseUrl}${endpoint}`,
        { headers }
      );

      if (response.data.success) {
        const paymentData = response.data.data;
        console.log('✅ [PHONEPE] Payment status retrieved:', paymentData.state);
        
        return {
          success: true,
          transactionId: transactionId,
          state: paymentData.state,
          responseCode: paymentData.responseCode,
          paymentInstrument: paymentData.paymentInstrument,
          amount: paymentData.amount / 100, // Convert back to rupees
          transactionData: paymentData
        };
      } else {
        throw new Error(response.data.message || 'Failed to get payment status');
      }

    } catch (error) {
      console.error('❌ [PHONEPE] Status check failed:', error.message);
      throw new Error(`Payment status check failed: ${error.message}`);
    }
  }

  /**
   * Verify payment from callback/webhook
   */
  async verifyPayment(callbackData) {
    try {
      console.log('🔍 [PHONEPE] Verifying payment callback');

      const { response, checksum } = callbackData;
      
      if (!response || !checksum) {
        throw new Error('Invalid callback data - missing response or checksum');
      }

      // Verify checksum
      if (!this.verifyChecksum(response, checksum)) {
        throw new Error('Invalid checksum - payment verification failed');
      }

      // Decode response
      const decodedResponse = Buffer.from(response, 'base64').toString('utf-8');
      const paymentData = JSON.parse(decodedResponse);

      console.log('✅ [PHONEPE] Payment verification successful:', paymentData.data.state);

      return {
        success: true,
        transactionId: paymentData.data.merchantTransactionId,
        state: paymentData.data.state,
        responseCode: paymentData.data.responseCode,
        amount: paymentData.data.amount / 100,
        paymentInstrument: paymentData.data.paymentInstrument,
        verifiedData: paymentData.data
      };

    } catch (error) {
      console.error('❌ [PHONEPE] Payment verification failed:', error.message);
      throw new Error(`Payment verification failed: ${error.message}`);
    }
  }

  /**
   * Process refund
   */
  async processRefund(originalTransactionId, refundAmount, reason) {
    try {
      console.log('💸 [PHONEPE] Processing refund for transaction:', originalTransactionId);

      const refundTransactionId = `REFUND_${originalTransactionId}_${crypto.randomUUID().replace(/-/g, '')}`;

      const refundPayload = {
        merchantId: this.merchantId,
        merchantTransactionId: refundTransactionId,
        originalTransactionId: originalTransactionId,
        amount: Math.round(refundAmount * 100), // Convert to paise
        callbackUrl: this.callbackUrl
      };

      // Encode payload
      const base64Payload = Buffer.from(JSON.stringify(refundPayload)).toString('base64');
      
      // Generate checksum
      const checksum = this.generateChecksum(base64Payload);

      const requestData = {
        request: base64Payload
      };

      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'accept': 'application/json'
      };

      const response = await axios.post(
        `${this.baseUrl}/pg/v1/refund`,
        requestData,
        { headers }
      );

      if (response.data.success) {
        console.log('✅ [PHONEPE] Refund initiated successfully');
        
        return {
          success: true,
          refundTransactionId: refundTransactionId,
          state: response.data.data.state,
          responseCode: response.data.data.responseCode,
          amount: refundAmount
        };
      } else {
        throw new Error(response.data.message || 'Failed to process refund');
      }

    } catch (error) {
      console.error('❌ [PHONEPE] Refund processing failed:', error.message);
      throw new Error(`Refund processing failed: ${error.message}`);
    }
  }

  /**
   * Handle webhook callback
   */
  async handleWebhook(webhookData) {
    try {
      console.log('📥 [PHONEPE] Processing webhook callback');

      const { response, checksum } = webhookData;

      // Verify the webhook
      const verificationResult = await this.verifyPayment({ response, checksum });

      if (verificationResult.success) {
        console.log('✅ [PHONEPE] Webhook verified successfully');
        
        return {
          success: true,
          transactionId: verificationResult.transactionId,
          state: verificationResult.state,
          amount: verificationResult.amount,
          paymentData: verificationResult.verifiedData
        };
      } else {
        throw new Error('Webhook verification failed');
      }

    } catch (error) {
      console.error('❌ [PHONEPE] Webhook processing failed:', error.message);
      throw new Error(`Webhook processing failed: ${error.message}`);
    }
  }

  /**
   * Get supported payment methods
   */
  getSupportedPaymentMethods() {
    return {
      upi: true,
      cards: true,
      netbanking: true,
      wallets: true,
      primary_method: 'UPI',
      description: 'PhonePe supports all major payment methods with focus on UPI'
    };
  }

  /**
   * Validate environment configuration
   */
  validateConfiguration() {
    const required = ['merchantId', 'saltKey', 'callbackUrl', 'redirectUrl'];
    const missing = required.filter(field => !this[field]);
    
    if (missing.length > 0) {
      throw new Error(`PhonePe configuration incomplete. Missing: ${missing.join(', ')}`);
    }

    console.log('✅ [PHONEPE] Configuration validated successfully');
    return true;
  }
}

module.exports = new PhonePeService();
