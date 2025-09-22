const TeleSession = require('../models/teleSession');
const Prescription = require('../models/prescription');
const Nurse = require('../models/nurse');
const Doctor = require('../models/doctor');
const User = require('../models/user');
const Booking = require('../models/booking');
const { redisClient } = require('../middleware');
const notificationService = require('./notificationService');

class TelehealthService {
  
  /**
   * Initiate a teleconsultation session
   */
  static async initiateSession(bookingId, nurseId, sessionData) {
    try {
      console.log('🎥 Initiating teleconsultation session...');
      
      // Validate booking exists and is active
      const booking = await Booking.findById(bookingId).populate('user_id');
      if (!booking) {
        throw new Error('Booking not found');
      }
      
      if (booking.status !== 'in_progress') {
        throw new Error('Booking must be in progress to initiate teleconsultation');
      }
      
      // Validate nurse
      const nurse = await Nurse.findById(nurseId).populate('agency_info.agency_id');
      if (!nurse) {
        throw new Error('Nurse not found');
      }
      
      // Create teleconsultation session
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const roomToken = await this.generateRoomToken(sessionId);
      
      const teleSession = new TeleSession({
        session_id: sessionId,
        booking_id: bookingId,
        participants: {
          patient: {
            user_id: booking.user_id._id,
            connection_quality: 'good'
          },
          nurse: {
            nurse_id: nurseId,
            joined_at: new Date(),
            initiated_call: true
          }
        },
        session_details: {
          start_time: new Date(),
          session_type: sessionData.session_type || 'video',
          initiated_by: 'nurse',
          reason_for_consultation: sessionData.reason || 'Nurse-initiated consultation',
          session_notes: sessionData.notes || ''
        },
        technical_details: {
          video_service_provider: 'webrtc',
          session_token: roomToken,
          recording_enabled: sessionData.recording_enabled || false
        },
        status: 'scheduled'
      });
      
      await teleSession.save();
      
      // Store session in Redis for real-time access
      await redisClient.setEx(
        `telesession:${sessionId}`, 
        3600, // 1 hour expiry
        JSON.stringify({
          sessionId,
          bookingId,
          patientId: booking.user_id._id.toString(),
          nurseId: nurseId.toString(),
          roomToken,
          status: 'scheduled',
          createdAt: new Date()
        })
      );
      
      // Find available doctors for consultation
      const availableDoctors = await this.findAvailableDoctors(sessionData.specialization);
      
      // Notify available doctors
      if (availableDoctors.length > 0) {
        await this.notifyAvailableDoctors(availableDoctors, teleSession, sessionData);
      }
      
      // Notify patient about upcoming consultation
      await notificationService.sendTeleconsultationInvite(
        booking.user_id,
        teleSession,
        nurse
      );
      
      console.log('✅ Teleconsultation session initiated:', sessionId);
      
      return {
        success: true,
        session_id: sessionId,
        room_token: roomToken,
        session_details: teleSession,
        available_doctors: availableDoctors.length,
        estimated_wait_time: this.calculateEstimatedWaitTime(availableDoctors.length)
      };
      
    } catch (error) {
      console.error('❌ Error initiating teleconsultation:', error);
      throw error;
    }
  }
  
  /**
   * Doctor joins the session
   */
  static async doctorJoinSession(sessionId, doctorId, consultationType = 'routine') {
    try {
      console.log('👨‍⚕️ Doctor joining session:', sessionId);
      
      // Find session
      const teleSession = await TeleSession.findOne({ session_id: sessionId })
        .populate('booking_id')
        .populate('participants.patient.user_id')
        .populate('participants.nurse.nurse_id');
      
      if (!teleSession) {
        throw new Error('Session not found');
      }
      
      if (teleSession.status !== 'scheduled') {
        throw new Error('Session is not available for joining');
      }
      
      // Validate doctor
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        throw new Error('Doctor not found');
      }
      
      if (doctor.status !== 'active' || !doctor.is_verified) {
        throw new Error('Doctor is not available for consultations');
      }
      
      // Update session with doctor
      teleSession.participants.doctor = {
        doctor_id: doctorId,
        joined_at: new Date(),
        consultation_type: consultationType
      };
      
      teleSession.status = 'active';
      teleSession.session_details.start_time = new Date();
      
      await teleSession.save();
      
      // Update Redis
      const sessionData = await redisClient.get(`telesession:${sessionId}`);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        session.doctorId = doctorId.toString();
        session.status = 'active';
        session.doctor_joined_at = new Date();
        
        await redisClient.setEx(
          `telesession:${sessionId}`,
          3600,
          JSON.stringify(session)
        );
      }
      
      // Notify all participants that doctor has joined
      await this.notifyParticipants(teleSession, 'doctor_joined', {
        doctor_name: doctor.name,
        doctor_specialization: doctor.specialization
      });
      
      // Update nurse performance metrics
      await Nurse.findByIdAndUpdate(
        teleSession.participants.nurse.nurse_id,
        { $inc: { 'performance_metrics.teleconsults_initiated': 1 } }
      );
      
      console.log('✅ Doctor joined session successfully');
      
      return {
        success: true,
        session_details: teleSession,
        webrtc_config: await this.getWebRTCConfig(sessionId),
        doctor_info: {
          name: doctor.name,
          specialization: doctor.specialization,
          profile_image: doctor.profile_image
        }
      };
      
    } catch (error) {
      console.error('❌ Error doctor joining session:', error);
      throw error;
    }
  }
  
  /**
   * Patient joins the session
   */
  static async patientJoinSession(sessionId, userId) {
    try {
      console.log('👤 Patient joining session:', sessionId);
      
      const teleSession = await TeleSession.findOne({ session_id: sessionId })
        .populate('participants.nurse.nurse_id')
        .populate('participants.doctor.doctor_id');
      
      if (!teleSession) {
        throw new Error('Session not found');
      }
      
      if (teleSession.participants.patient.user_id.toString() !== userId.toString()) {
        throw new Error('Unauthorized access to session');
      }
      
      // Update patient join time
      teleSession.participants.patient.joined_at = new Date();
      await teleSession.save();
      
      return {
        success: true,
        session_details: {
          session_id: sessionId,
          room_token: teleSession.technical_details.session_token,
          participants: {
            nurse: teleSession.participants.nurse.nurse_id ? {
              name: teleSession.participants.nurse.nurse_id.name || teleSession.participants.nurse.nurse_id.personal_info?.full_name,
              profile_image: teleSession.participants.nurse.nurse_id.profile_image || teleSession.participants.nurse.nurse_id.personal_info?.profile_image
            } : null,
            doctor: teleSession.participants.doctor.doctor_id ? {
              name: teleSession.participants.doctor.doctor_id.name,
              specialization: teleSession.participants.doctor.doctor_id.specialization,
              profile_image: teleSession.participants.doctor.doctor_id.profile_image
            } : null
          },
          session_started: teleSession.status === 'active'
        },
        webrtc_config: await this.getWebRTCConfig(sessionId)
      };
      
    } catch (error) {
      console.error('❌ Error patient joining session:', error);
      throw error;
    }
  }
  
  /**
   * End teleconsultation session
   */
  static async endSession(sessionId, endedBy, sessionSummary = {}) {
    try {
      console.log('🏁 Ending session:', sessionId);
      
      const teleSession = await TeleSession.findOne({ session_id: sessionId });
      if (!teleSession) {
        throw new Error('Session not found');
      }
      
      // Update session end details
      teleSession.session_details.end_time = new Date();
      teleSession.status = 'completed';
      teleSession.session_details.session_notes = sessionSummary.notes || teleSession.session_details.session_notes;
      
      // Update medical outcome if provided
      if (sessionSummary.medical_outcome) {
        teleSession.medical_outcome = {
          ...teleSession.medical_outcome,
          ...sessionSummary.medical_outcome
        };
      }
      
      await teleSession.save();
      
      // Remove from Redis
      await redisClient.del(`telesession:${sessionId}`);
      
      // Notify all participants
      await this.notifyParticipants(teleSession, 'session_ended', {
        ended_by: endedBy,
        duration: teleSession.getDurationString(),
        summary: sessionSummary
      });
      
      console.log('✅ Session ended successfully');
      
      return {
        success: true,
        session_summary: {
          session_id: sessionId,
          duration: teleSession.getDurationString(),
          participants_count: this.getParticipantsCount(teleSession),
          medical_outcome: teleSession.medical_outcome
        }
      };
      
    } catch (error) {
      console.error('❌ Error ending session:', error);
      throw error;
    }
  }
  
  /**
   * Generate prescription during teleconsultation
   */
  static async generatePrescription(sessionId, doctorId, prescriptionData) {
    try {
      console.log('💊 Generating prescription for session:', sessionId);
      
      const teleSession = await TeleSession.findOne({ session_id: sessionId })
        .populate('booking_id participants.patient.user_id');
      
      if (!teleSession) {
        throw new Error('Session not found');
      }
      
      if (teleSession.participants.doctor.doctor_id.toString() !== doctorId.toString()) {
        throw new Error('Only the consulting doctor can generate prescription');
      }
      
      // Create prescription
      const prescription = new Prescription({
        medical_info: {
          doctor_id: doctorId,
          patient_id: teleSession.participants.patient.user_id._id,
          booking_id: teleSession.booking_id._id,
          telesession_id: teleSession._id,
          consultation_date: new Date(),
          diagnosis: prescriptionData.diagnosis,
          symptoms: prescriptionData.symptoms || [],
          vital_signs: prescriptionData.vital_signs || {}
        },
        medications: prescriptionData.medications || [],
        recommendations: prescriptionData.recommendations || {},
        status: 'issued'
      });
      
      await prescription.save();
      
      // Update telesession
      teleSession.medical_outcome.prescription_issued = true;
      teleSession.medical_outcome.prescription_id = prescription._id;
      teleSession.medical_outcome.diagnosis_provided = true;
      await teleSession.save();
      
      // Generate PDF and get URL
      const pdfUrl = prescription.generatePDFUrl();
      
      // Notify patient
      await notificationService.sendPrescriptionReady(
        teleSession.participants.patient.user_id,
        prescription,
        pdfUrl
      );
      
      console.log('✅ Prescription generated successfully');
      
      return {
        success: true,
        prescription_id: prescription.prescription_id,
        pdf_url: pdfUrl,
        prescription_details: prescription
      };
      
    } catch (error) {
      console.error('❌ Error generating prescription:', error);
      throw error;
    }
  }
  
  /**
   * Get session details
   */
  static async getSessionDetails(sessionId) {
    try {
      // Try Redis first for active sessions
      const redisData = await redisClient.get(`telesession:${sessionId}`);
      if (redisData) {
        return {
          success: true,
          session: JSON.parse(redisData),
          source: 'cache'
        };
      }
      
      // Fall back to database
      const teleSession = await TeleSession.findOne({ session_id: sessionId })
        .populate('booking_id')
        .populate('participants.patient.user_id', 'name email')
        .populate('participants.nurse.nurse_id', 'name phone profile_image')
        .populate('participants.doctor.doctor_id', 'name specialization profile_image');
      
      if (!teleSession) {
        throw new Error('Session not found');
      }
      
      return {
        success: true,
        session: teleSession,
        source: 'database'
      };
      
    } catch (error) {
      console.error('❌ Error getting session details:', error);
      throw error;
    }
  }
  
  // Helper methods
  
  static async generateRoomToken(sessionId) {
    // In production, integrate with actual WebRTC service like Twilio, Agora, or custom solution
    return `token_${sessionId}_${Date.now()}`;
  }
  
  static async findAvailableDoctors(specialization = null) {
    const query = {
      status: 'active',
      is_verified: true,
      'availability.currently_available': true
    };
    
    if (specialization) {
      query.specialization = new RegExp(specialization, 'i');
    }
    
    return await Doctor.find(query)
      .limit(10)
      .sort({ rating: -1, total_consultations: -1 });
  }
  
  static async notifyAvailableDoctors(doctors, teleSession, sessionData) {
    for (const doctor of doctors) {
      await notificationService.sendTeleconsultationRequest(
        doctor,
        teleSession,
        sessionData
      );
    }
  }
  
  static async notifyParticipants(teleSession, eventType, data) {
    // Notify via WebSocket, push notifications, etc.
    console.log(`📢 Notifying participants about ${eventType}:`, data);
    
    // In production, implement real-time notifications
    // using Socket.io, Firebase, or similar service
  }
  
  static calculateEstimatedWaitTime(availableDoctorsCount) {
    if (availableDoctorsCount === 0) return '15-20 minutes';
    if (availableDoctorsCount >= 5) return '2-5 minutes';
    if (availableDoctorsCount >= 3) return '5-10 minutes';
    return '10-15 minutes';
  }
  
  static getParticipantsCount(teleSession) {
    let count = 0;
    if (teleSession.participants.patient.joined_at) count++;
    if (teleSession.participants.nurse.joined_at) count++;
    if (teleSession.participants.doctor.joined_at) count++;
    return count;
  }
  
  static async getWebRTCConfig(sessionId) {
    // Return WebRTC configuration for the session
    return {
      ice_servers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      video_constraints: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio_constraints: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };
  }
  
  /**
   * Get analytics for teleconsultations
   */
  static async getAnalytics(startDate, endDate) {
    try {
      const analytics = await TeleSession.getSessionAnalytics(startDate, endDate);
      
      const totalSessions = await TeleSession.countDocuments({
        'session_details.start_time': { $gte: startDate, $lte: endDate }
      });
      
      const avgDuration = await TeleSession.aggregate([
        {
          $match: {
            'session_details.start_time': { $gte: startDate, $lte: endDate },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: '$session_details.duration_minutes' }
          }
        }
      ]);
      
      return {
        total_sessions: totalSessions,
        completed_sessions: analytics.find(a => a._id === 'completed')?.count || 0,
        active_sessions: analytics.find(a => a._id === 'active')?.count || 0,
        failed_sessions: analytics.find(a => a._id === 'failed')?.count || 0,
        average_duration_minutes: avgDuration[0]?.avgDuration || 0,
        success_rate: totalSessions > 0 ? ((analytics.find(a => a._id === 'completed')?.count || 0) / totalSessions * 100) : 0
      };
      
    } catch (error) {
      console.error('❌ Error getting analytics:', error);
      throw error;
    }
  }
}

module.exports = TelehealthService;
