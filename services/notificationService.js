const admin = require('firebase-admin');
const { redisClient } = require('../middleware');

// Initialize Firebase Admin (you'll need to set up Firebase project)
if (!admin.apps.length) {
  try {
    // Temporarily disabled Firebase for development
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
      console.log('✅ Firebase Admin initialized');
    } else {
      console.log('⚠️ Firebase credentials not configured, push notifications disabled');
    }
  } catch (error) {
    console.log('Firebase admin initialization error:', error);
  }
}

class NotificationService {
  
  /**
   * Send push notification to device
   */
  static async sendPushNotification(deviceToken, title, body, data = {}) {
    try {
      if (!deviceToken) {
        console.log('⚠️ No device token provided');
        return { success: false, reason: 'No device token' };
      }
      
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          timestamp: new Date().toISOString()
        },
        token: deviceToken,
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#3B82F6',
            sound: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };
      
      const response = await admin.messaging().send(message);
      console.log('✅ Push notification sent successfully:', response);
      
      return { success: true, messageId: response };
      
    } catch (error) {
      console.error('❌ Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send teleconsultation invitation to patient
   */
  static async sendTeleconsultationInvite(patient, teleSession, nurse) {
    try {
      console.log('📞 Sending teleconsultation invite to patient');
      
      // Send push notification if device token available
      if (patient.device_token) {
        await this.sendPushNotification(
          patient.device_token,
          'Teleconsultation Available',
          `${nurse.name || nurse.personal_info?.full_name} has initiated a video consultation for you`,
          {
            type: 'teleconsultation_invite',
            session_id: teleSession.session_id,
            nurse_name: nurse.name || nurse.personal_info?.full_name
          }
        );
      }
      
      // Send email notification
      const emailService = require('./emailService');
      await emailService.sendTeleconsultationInviteEmail(patient, teleSession, nurse);
      
      console.log('✅ Teleconsultation invite sent successfully');
      
    } catch (error) {
      console.error('❌ Error sending teleconsultation invite:', error);
    }
  }
  
  /**
   * Send teleconsultation request to available doctors
   */
  static async sendTeleconsultationRequest(doctor, teleSession, sessionData) {
    try {
      console.log('👨‍⚕️ Sending teleconsultation request to doctor:', doctor.name);
      
      // Send push notification
      if (doctor.device_token) {
        await this.sendPushNotification(
          doctor.device_token,
          'New Teleconsultation Request',
          `Patient consultation required - ${sessionData.reason || 'Routine consultation'}`,
          {
            type: 'teleconsultation_request',
            session_id: teleSession.session_id,
            urgency: sessionData.urgency || 'routine',
            specialization: sessionData.specialization || 'general'
          }
        );
      }
      
      // Send SMS for urgent cases
      if (sessionData.urgency === 'emergency') {
        const smsService = require('./smsService');
        await smsService.sendTeleconsultationUrgentSMS(doctor, teleSession);
      }
      
      console.log('✅ Teleconsultation request sent to doctor');
      
    } catch (error) {
      console.error('❌ Error sending teleconsultation request:', error);
    }
  }
  
  /**
   * Send prescription ready notification
   */
  static async sendPrescriptionReady(patient, prescription, pdfUrl) {
    try {
      console.log('💊 Sending prescription ready notification');
      
      // Send push notification
      if (patient.device_token) {
        await this.sendPushNotification(
          patient.device_token,
          'Prescription Ready',
          'Your digital prescription is ready for download',
          {
            type: 'prescription_ready',
            prescription_id: prescription.prescription_id,
            pdf_url: pdfUrl
          }
        );
      }
      
      // Send email with prescription attachment
      const emailService = require('./emailService');
      await emailService.sendPrescriptionReadyEmail(patient, prescription, pdfUrl);
      
      console.log('✅ Prescription ready notification sent');
      
    } catch (error) {
      console.error('❌ Error sending prescription notification:', error);
    }
  }
  
  /**
   * Send payment confirmation notification
   */
  static async sendPaymentConfirmation(patient, booking, amount) {
    try {
      console.log('💳 Sending payment confirmation notification');
      
      // Send push notification
      if (patient.device_token) {
        await this.sendPushNotification(
          patient.device_token,
          'Payment Confirmed',
          `Payment of ₹${amount} has been processed successfully`,
          {
            type: 'payment_confirmation',
            booking_id: booking._id.toString(),
            amount: amount
          }
        );
      }
      
      // Send email receipt
      const emailService = require('./emailService');
      await emailService.sendPaymentConfirmationEmail(patient, booking, amount);
      
      console.log('✅ Payment confirmation sent');
      
    } catch (error) {
      console.error('❌ Error sending payment confirmation:', error);
    }
  }
  
  /**
   * Send refund notification
   */
  static async sendRefundNotification(patient, booking, refundAmount) {
    try {
      console.log('💸 Sending refund notification');
      
      // Send push notification
      if (patient.device_token) {
        await this.sendPushNotification(
          patient.device_token,
          'Refund Processed',
          `Refund of ₹${refundAmount} has been initiated to your account`,
          {
            type: 'refund_notification',
            booking_id: booking._id.toString(),
            refund_amount: refundAmount
          }
        );
      }
      
      // Send email notification
      const emailService = require('./emailService');
      await emailService.sendRefundNotificationEmail(patient, booking, refundAmount);
      
      console.log('✅ Refund notification sent');
      
    } catch (error) {
      console.error('❌ Error sending refund notification:', error);
    }
  }
  
  /**
   * Send service completion notification
   */
  static async sendServiceCompletionNotification(patient, booking, nurse) {
    try {
      console.log('✅ Sending service completion notification');
      
      // Send push notification
      if (patient.device_token) {
        await this.sendPushNotification(
          patient.device_token,
          'Service Completed',
          `Your healthcare service has been completed successfully by ${nurse.name || nurse.personal_info?.full_name}`,
          {
            type: 'service_completion',
            booking_id: booking._id.toString(),
            nurse_name: nurse.name || nurse.personal_info?.full_name
          }
        );
      }
      
      // Send follow-up email
      const emailService = require('./emailService');
      await emailService.sendServiceCompletionEmail(patient, booking, nurse);
      
      console.log('✅ Service completion notification sent');
      
    } catch (error) {
      console.error('❌ Error sending service completion notification:', error);
    }
  }
  
  /**
   * Store notification for later retrieval
   */
  static async storeNotification(userId, notification) {
    try {
      const notificationData = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        user_id: userId.toString(),
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        read: false,
        created_at: new Date(),
        expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) // 30 days
      };
      
      await redisClient.lpush(
        `notifications:${userId}`,
        JSON.stringify(notificationData)
      );
      
      // Keep only last 100 notifications
      await redisClient.ltrim(`notifications:${userId}`, 0, 99);
      
      return notificationData;
      
    } catch (error) {
      console.error('❌ Error storing notification:', error);
      throw error;
    }
  }
  
  /**
   * Get stored notifications for user
   */
  static async getUserNotifications(userId, limit = 20) {
    try {
      const notifications = await redisClient.lrange(`notifications:${userId}`, 0, limit - 1);
      
      return notifications.map(notif => JSON.parse(notif));
      
    } catch (error) {
      console.error('❌ Error getting user notifications:', error);
      return [];
    }
  }
}

module.exports = NotificationService;
