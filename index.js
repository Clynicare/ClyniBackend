// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

// Enhanced Models
const User = require('./models/user');
const Service = require('./models/service');
const Booking = require('./models/booking');
const Nurse = require('./models/nurse');
const Agency = require('./models/agency');
const Doctor = require('./models/doctor');
const NurseBooking = require('./models/nurseBooking');
const Admin = require('./models/admin');
const OTP = require('./models/otp');
const TeleSession = require('./models/teleSession');
const Prescription = require('./models/prescription');
const Settlement = require('./models/settlement');

// Enhanced Services
const { sendBookingRequestSMS, sendBookingStatusSMS, sendNurseBookingNotificationSMS, sendServiceCompletionSMS, sendNurseHandoffSMS, sendDoctorJoinSMS } = require('./services/smsService');
const { generateOTP, sendUserRegistrationOTP, sendAgencyRegistrationOTP, sendDoctorRegistrationOTP, sendWelcomeEmail } = require('./services/emailService');
const TelehealthService = require('./services/telehealthService');
const phonePeService = require('./services/phonePeService');
const NotificationService = require('./services/notificationService');

// Routes
const paymentRoutes = require('./routes/payments-minimal');

// Middleware System
const { 
  securityMiddleware, 
  corsMiddleware, 
  rateLimitMiddleware, 
  authenticateToken, 
  authenticateRole,
  requestLogger, 
  errorHandler 
} = require('./middleware');

const app = express();
const PORT = process.env.PORT || 7000;
const MONGO_URL = process.env.MONGO_URL;
const SECRET_KEY = process.env.SECRET_KEY || "your-secret-key-here";

if (!MONGO_URL) {
  console.error('❌ MONGO_URL environment variable is required');
  process.exit(1);
}

console.log('🔍 Environment check:');
console.log('MONGO_URL:', MONGO_URL ? 'Set' : 'Not set');
console.log('REDIS_URL:', process.env.REDIS_URL ? 'Set' : 'Not set');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');

// Apply comprehensive middleware stack
app.use(securityMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestLogger);
app.use(rateLimitMiddleware.general);

// Database Connections
mongoose.connect(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1);
  });

// Redis client (v4+)
let redisClient = null;
if (process.env.REDIS_URL) {
  redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    socket: {
      tls: true,
      rejectUnauthorized: false
    }
  });
  redisClient.connect()
    .then(() => console.log("✅ Connected to Redis"))
    .catch((err) => {
      console.error("❌ Redis connection failed:", err.message);
      redisClient = null;
    });
} else {
  console.log("⚠️ Redis URL not configured, caching disabled");
}

// REGISTER PAYMENT ROUTES - PhonePe Dual Payment System (COD + UPI)
app.use('/api/payments', paymentRoutes);

// �👨‍⚕️ TELECONSULTATION ROUTES

// Initiate teleconsultation session
app.post('/api/teleconsultation/initiate', authenticateRole('nurse'), async (req, res) => {
  try {
    const { booking_id, session_type, patient_symptoms, vital_signs } = req.body;
    
    console.log('🎥 [TELECONSULTATION] Initiating session for booking:', booking_id);
    
    const sessionData = {
      booking_id,
      session_type: session_type || 'hybrid',
      patient_symptoms: patient_symptoms || '',
      vital_signs: vital_signs || {},
      urgency: req.body.urgency || 'routine',
      specialization: req.body.specialization || 'general'
    };
    
    const result = await TelehealthService.initiateSession(sessionData, req.nurse);
    
    res.status(201).json({
      message: 'Teleconsultation session initiated successfully',
      session: result.session,
      webrtc_config: result.webrtc_config
    });
    
  } catch (err) {
    console.error('❌ [TELECONSULTATION] Initiation error:', err);
    res.status(500).json({ message: 'Failed to initiate teleconsultation', error: err.message });
  }
});

// Doctor joins teleconsultation
app.post('/api/teleconsultation/:sessionId/doctor-join', authenticateRole('doctor'), async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log('👨‍⚕️ [TELECONSULTATION] Doctor joining session:', sessionId);
    
    const result = await TelehealthService.doctorJoinSession(sessionId, req.doctor);
    
    res.status(200).json({
      message: 'Doctor joined teleconsultation successfully',
      session: result.session,
      webrtc_config: result.webrtc_config
    });
    
  } catch (err) {
    console.error('❌ [TELECONSULTATION] Doctor join error:', err);
    res.status(500).json({ message: 'Failed to join teleconsultation', error: err.message });
  }
});

// Patient joins teleconsultation
app.post('/api/teleconsultation/:sessionId/patient-join', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log('👤 [TELECONSULTATION] Patient joining session:', sessionId);
    
    const result = await TelehealthService.patientJoinSession(sessionId, req.user);
    
    res.status(200).json({
      message: 'Patient joined teleconsultation successfully',
      session: result.session,
      webrtc_config: result.webrtc_config
    });
    
  } catch (err) {
    console.error('❌ [TELECONSULTATION] Patient join error:', err);
    res.status(500).json({ message: 'Failed to join teleconsultation', error: err.message });
  }
});

// End teleconsultation session
app.post('/api/teleconsultation/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { treatment_notes, prescription_needed, follow_up_required } = req.body;
    
    console.log('🏁 [TELECONSULTATION] Ending session:', sessionId);
    
    const sessionData = {
      treatment_notes: treatment_notes || '',
      prescription_needed: prescription_needed || false,
      follow_up_required: follow_up_required || false
    };
    
    const result = await TelehealthService.endSession(sessionId, sessionData);
    
    res.status(200).json({
      message: 'Teleconsultation session ended successfully',
      session: result.session,
      prescription: result.prescription || null
    });
    
  } catch (err) {
    console.error('❌ [TELECONSULTATION] End session error:', err);
    res.status(500).json({ message: 'Failed to end teleconsultation', error: err.message });
  }
});

// Get teleconsultation session details
app.get('/api/teleconsultation/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await TeleSession.findOne({ session_id: sessionId })
      .populate('booking_id')
      .populate('participants.patient', 'name email phone')
      .populate('participants.nurse', 'name phone specializations')
      .populate('participants.doctor', 'name specialization consultation_fee');
    
    if (!session) {
      return res.status(404).json({ message: 'Teleconsultation session not found' });
    }
    
    res.status(200).json({ session });
    
  } catch (err) {
    console.error('❌ [TELECONSULTATION] Get session error:', err);
    res.status(500).json({ message: 'Failed to get teleconsultation details', error: err.message });
  }
});

// 💊 PRESCRIPTION ROUTES

// Generate prescription
app.post('/api/prescriptions/generate', authenticateRole('doctor'), async (req, res) => {
  try {
    const { 
      patient_id, 
      booking_id, 
      session_id, 
      medications, 
      diagnosis, 
      treatment_plan, 
      follow_up_date 
    } = req.body;
    
    console.log('💊 [PRESCRIPTION] Generating prescription for patient:', patient_id);
    
    const prescriptionData = {
      patient_id,
      booking_id,
      session_id,
      medications: medications || [],
      diagnosis: diagnosis || '',
      treatment_plan: treatment_plan || '',
      follow_up_date: follow_up_date ? new Date(follow_up_date) : null
    };
    
    const result = await TelehealthService.generatePrescription(prescriptionData, req.doctor);
    
    res.status(201).json({
      message: 'Prescription generated successfully',
      prescription: result.prescription,
      pdf_url: result.pdf_url
    });
    
  } catch (err) {
    console.error('❌ [PRESCRIPTION] Generation error:', err);
    res.status(500).json({ message: 'Failed to generate prescription', error: err.message });
  }
});

// Get prescription details
app.get('/api/prescriptions/:prescriptionId', async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    
    const prescription = await Prescription.findOne({ prescription_id: prescriptionId })
      .populate('doctor_id', 'name medical_license specialization')
      .populate('patient_id', 'name email phone')
      .populate('booking_id')
      .populate('session_id');
    
    if (!prescription) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    
    res.status(200).json({ prescription });
    
  } catch (err) {
    console.error('❌ [PRESCRIPTION] Get prescription error:', err);
    res.status(500).json({ message: 'Failed to get prescription details', error: err.message });
  }
});

// Get user's prescriptions
app.get('/api/prescriptions', authenticateToken, async (req, res) => {
  try {
    const prescriptions = await Prescription.find({ patient_id: req.user._id })
      .populate('doctor_id', 'name specialization')
      .sort({ created_at: -1 });
    
    res.status(200).json({ prescriptions });
    
  } catch (err) {
    console.error('❌ [PRESCRIPTION] Get prescriptions error:', err);
    res.status(500).json({ message: 'Failed to get prescriptions', error: err.message });
  }
});

// 💳 PAYMENT ROUTES

// Create payment order
app.post('/api/payments/create-order', authenticateToken, async (req, res) => {
  try {
    const { booking_id, amount, payment_type } = req.body;
    
    console.log('💳 [PAYMENT] Creating payment order for booking:', booking_id);
    
    const result = await PaymentService.createPaymentOrder(
      booking_id, 
      amount, 
      req.user._id,
      payment_type || 'booking'
    );
    
    res.status(200).json({
      message: 'Payment order created successfully',
      order: result.order,
      razorpay_order_id: result.razorpay_order_id
    });
    
  } catch (err) {
    console.error('❌ [PAYMENT] Create order error:', err);
    res.status(500).json({ message: 'Failed to create payment order', error: err.message });
  }
});

// Verify payment
app.post('/api/payments/verify', authenticateToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    console.log('✅ [PAYMENT] Verifying payment:', razorpay_payment_id);
    
    const result = await PaymentService.verifyPayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    });
    
    res.status(200).json({
      message: 'Payment verified successfully',
      payment: result.payment,
      settlement: result.settlement
    });
    
  } catch (err) {
    console.error('❌ [PAYMENT] Verify payment error:', err);
    res.status(400).json({ message: 'Payment verification failed', error: err.message });
  }
});

// Process refund
app.post('/api/payments/refund', authenticateToken, async (req, res) => {
  try {
    const { payment_id, amount, reason } = req.body;
    
    console.log('💸 [PAYMENT] Processing refund for payment:', payment_id);
    
    const result = await PaymentService.processRefund(payment_id, amount, reason);
    
    res.status(200).json({
      message: 'Refund processed successfully',
      refund: result.refund
    });
    
  } catch (err) {
    console.error('❌ [PAYMENT] Refund error:', err);
    res.status(500).json({ message: 'Failed to process refund', error: err.message });
  }
});

// Payment webhook (for Razorpay)
app.post('/api/payments/webhook', async (req, res) => {
  try {
    console.log('🔗 [PAYMENT] Webhook received:', req.body.event);
    
    const result = await PaymentService.handleWebhook(req.body, req.headers);
    
    res.status(200).json({ message: 'Webhook processed successfully' });
    
  } catch (err) {
    console.error('❌ [PAYMENT] Webhook error:', err);
    res.status(400).json({ message: 'Webhook processing failed', error: err.message });
  }
});

// 💰 SETTLEMENT ROUTES

// Get agency settlements
app.get('/api/settlements/agency', authenticateRole('agency'), async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;
    
    const query = { agency_id: req.agency._id };
    
    if (start_date && end_date) {
      query.settlement_date = {
        $gte: new Date(start_date),
        $lte: new Date(end_date)
      };
    }
    
    if (status) query.status = status;
    
    const settlements = await Settlement.find(query)
      .populate('booking_id')
      .sort({ settlement_date: -1 });
    
    res.status(200).json({ settlements });
    
  } catch (err) {
    console.error('❌ [SETTLEMENT] Get agency settlements error:', err);
    res.status(500).json({ message: 'Failed to get settlements', error: err.message });
  }
});

// Get doctor settlements
app.get('/api/settlements/doctor', authenticateRole('doctor'), async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;
    
    const query = { doctor_id: req.doctor._id };
    
    if (start_date && end_date) {
      query.settlement_date = {
        $gte: new Date(start_date),
        $lte: new Date(end_date)
      };
    }
    
    if (status) query.status = status;
    
    const settlements = await Settlement.find(query)
      .populate('booking_id')
      .populate('session_id')
      .sort({ settlement_date: -1 });
    
    res.status(200).json({ settlements });
    
  } catch (err) {
    console.error('❌ [SETTLEMENT] Get doctor settlements error:', err);
    res.status(500).json({ message: 'Failed to get settlements', error: err.message });
  }
});

// 🔔 NOTIFICATION ROUTES

// Get user notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const notifications = await NotificationService.getUserNotifications(req.user._id, limit);
    
    res.status(200).json({ notifications });
    
  } catch (err) {
    console.error('❌ [NOTIFICATION] Get notifications error:', err);
    res.status(500).json({ message: 'Failed to get notifications', error: err.message });
  }
});

// Test notification
app.post('/api/notifications/test', authenticateToken, async (req, res) => {
  try {
    const { title, body, device_token } = req.body;
    
    if (!device_token) {
      return res.status(400).json({ message: 'Device token is required for testing' });
    }
    
    const result = await NotificationService.sendPushNotification(
      device_token,
      title || 'Test Notification',
      body || 'This is a test notification from Clynicare',
      { type: 'test' }
    );
    
    res.status(200).json({ message: 'Test notification sent', result });
    
  } catch (err) {
    console.error('❌ [NOTIFICATION] Test notification error:', err);
    res.status(500).json({ message: 'Failed to send test notification', error: err.message });
  }
});

// ENHANCED EXISTING ROUTES

// 🔐 Send OTP for User Registration
app.post('/api/user/send-otp', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    console.log("🚀 Sending OTP for user registration:", { name, email, phone });

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Validate phone format (10 digits)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: "Phone number must be 10 digits" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists with this email" });
    }

    // Delete any existing OTP for this email and type
    await OTP.deleteMany({ email, userType: 'user' });

    // Generate OTP
    const otp = generateOTP();
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store OTP and user data temporarily
    const otpRecord = new OTP({
      email,
      otp,
      userType: 'user',
      userData: {
        name,
        email,
        password: hashedPassword,
        phone
      }
    });

    await otpRecord.save();

    // Send OTP email
    const emailResult = await sendUserRegistrationOTP(email, name, otp);
    
    if (!emailResult.success) {
      return res.status(500).json({ message: "Failed to send OTP email", error: emailResult.error });
    }

    console.log("✅ OTP sent for user registration:", email);
    res.status(200).json({ 
      message: "OTP sent successfully to your email", 
      email: email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Mask email for security
    });
  } catch (err) {
    console.error("❌ Send OTP Error:", err);
    res.status(500).json({ message: "Failed to send OTP", error: err.message });
  }
});

// 🔐 Verify OTP and Complete User Registration
app.post('/api/user/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log("🔍 Verifying OTP for user:", email);

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // Find OTP record
    const otpRecord = await OTP.findOne({ email, userType: 'user', isVerified: false });
    
    if (!otpRecord) {
      return res.status(400).json({ message: "OTP not found or already verified" });
    }

    // Check if OTP is correct
    if (otpRecord.otp !== otp) {
      // Increment attempts
      otpRecord.attempts += 1;
      await otpRecord.save();

      if (otpRecord.attempts >= 3) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return res.status(400).json({ message: "Too many incorrect attempts. Please request a new OTP." });
      }

      return res.status(400).json({ 
        message: "Invalid OTP", 
        attemptsLeft: 3 - otpRecord.attempts 
      });
    }

    // Create user with stored data
    const userData = otpRecord.userData;
    const newUser = new User({
      name: userData.name,
      email: userData.email,
      password: userData.password,
      phone: userData.phone,
      email_verified: true
    });

    await newUser.save();

    // Mark OTP as verified and delete
    await OTP.deleteOne({ _id: otpRecord._id });

    // Send welcome email
    await sendWelcomeEmail(userData.email, userData.name, 'user');

    console.log("✅ User registered successfully:", userData.email);
    res.status(201).json({ 
      message: "User registered successfully",
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email
      }
    });
  } catch (err) {
    console.error("❌ OTP Verification Error:", err);
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
});

// 🔐 Resend OTP for User Registration
app.post('/api/user/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find existing OTP record
    const existingOTP = await OTP.findOne({ email, userType: 'user', isVerified: false });
    
    if (!existingOTP) {
      return res.status(400).json({ message: "No pending registration found for this email" });
    }

    // Generate new OTP
    const newOtp = generateOTP();
    
    // Update OTP record
    existingOTP.otp = newOtp;
    existingOTP.attempts = 0;
    existingOTP.createdAt = new Date();
    await existingOTP.save();

    // Send OTP email
    const emailResult = await sendUserRegistrationOTP(email, existingOTP.userData.name, newOtp);
    
    if (!emailResult.success) {
      return res.status(500).json({ message: "Failed to send OTP email", error: emailResult.error });
    }

    res.status(200).json({ message: "OTP resent successfully" });
  } catch (err) {
    console.error("❌ Resend OTP Error:", err);
    res.status(500).json({ message: "Failed to resend OTP", error: err.message });
  }
});



// 🔐 Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("email", email, "pass", password);

    // Step 1: Find user by email
    const user = await User.findOne({ email });

    // Step 2: If user doesn't exist, return error
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Step 3: Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);

    // Step 4: If password doesn't match, return error
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Step 5: Generate JWT token
    const token = jwt.sign({ userID: user._id }, SECRET_KEY, { expiresIn: '1h' });

    // Step 6: Return success
    res.status(200).json({ token });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});


// 🔐 Token Check
app.post('/api/token-valid', authenticateToken, (req, res) => {
  res.status(200).json({ userInfo: req.user });
});

// 🔐 Google OAuth
app.post('/api/auth/google', async (req, res) => {
  try {
    const { name, email, googleId, image } = req.body;
    
    let user = await User.findOne({ email });
    
    if (!user) {
      user = new User({
        name,
        email,
        googleId,
        profile_image: image,
        phone: '', // Will be updated later if needed
        password: null // No password for Google users
      });
      await user.save();
    } else {
      // Update existing user with Google info
      user.googleId = googleId;
      user.profile_image = image;
      await user.save();
    }
    
    const token = jwt.sign({ userID: user._id }, SECRET_KEY, { expiresIn: '1h' });
    res.status(200).json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.status(500).json({ message: 'Google authentication failed', error: err.message });
  }
});

// 📦 Get Services with Redis Caching
app.get("/Services", async (req, res) => {
  try {
    const { name } = req.query;
    const cacheKey = name ? `service_${name}` : 'services_all';

    // Try Redis cache if available
    if (redisClient) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          console.log("✅ Cache hit");
          return res.status(200).json(JSON.parse(cached));
        }
      } catch (cacheErr) {
        console.log("⚠️ Cache read failed, proceeding without cache");
      }
    }

    const query = name ? { service_name: { $regex: new RegExp(name, 'i') } } : {};
    const services = await Service.find(query);
    if (!services.length) return res.status(404).json({ message: "No services found" });

    // Try to cache if Redis is available
    if (redisClient) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(services), {
          EX: 3600  // 1 hour cache
        });
        console.log("✅ Cache miss - stored in Redis");
      } catch (cacheErr) {
        console.log("⚠️ Cache write failed, proceeding without cache");
      }
    }

    res.status(200).json(services);
  } catch (err) {
    console.error("❌ Service fetch error:", err);
    res.status(500).json({ message: "Internal Server Error", error: err });
  }
});

// 📅 Create Booking (Protected)
app.post('/api/bookings', authenticateToken, async (req, res) => {
  try {
    const { service_id, patient_name, booking_date, booking_time, address, mobile_no, additional_requirements, gender } = req.body;

    const newBooking = new Booking({
      service_id,
      user_id: req.user._id,
      patient_name,
      booking_date,
      booking_time,
      address,
      mobile_no,
      additional_requirements,
      gender
    });

    await newBooking.save();
    res.status(201).json({ message: "Booking created successfully" });
  } catch (err) {
    res.status(500).json({ message: "Booking failed", error: err });
  }
});

// 📃 Get Bookings (Protected)
app.get('/Bookings', authenticateToken, async (req, res) => {
  try {
    const bookings = await Booking.find({ user_id: req.user._id })
      .populate('service_id', 'service_name service_category service_description')
      .populate('user_id', 'email');

    if (!bookings.length) return res.status(404).json({ message: "No bookings found" });

    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ message: "Error fetching bookings", error: err });
  }
});

// 👩‍⚕️ NURSE MANAGEMENT ROUTES

// Get all nurses with filtering
app.get('/api/nurses', async (req, res) => {
  try {
    const { city, specialization, availability, page = 1, limit = 10 } = req.query;
    const query = { status: 'active', is_verified: true };
    
    if (city) query['location.city'] = new RegExp(city, 'i');
    if (specialization) query.specializations = { $in: [new RegExp(specialization, 'i')] };
    if (availability) query['availability.days'] = { $in: [availability] };
    
    const nurses = await Nurse.find(query)
      .populate('agency_id', 'name rating')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ rating: -1, createdAt: -1 });
    
    const total = await Nurse.countDocuments(query);
    
    res.status(200).json({
      nurses,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching nurses", error: err.message });
  }
});

// Get single nurse details
app.get('/api/nurses/:id', async (req, res) => {
  try {
    const nurse = await Nurse.findById(req.params.id)
      .populate('agency_id', 'name rating description');
    
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    
    res.status(200).json(nurse);
  } catch (err) {
    res.status(500).json({ message: "Error fetching nurse", error: err.message });
  }
});

// 👨‍⚕️ DOCTOR MANAGEMENT ROUTES

// Get all doctors
app.get('/api/doctors', async (req, res) => {
  try {
    const { specialization, availability, page = 1, limit = 10 } = req.query;
    const query = { status: 'active', is_verified: true };
    
    if (specialization) query.specialization = new RegExp(specialization, 'i');
    if (availability) query['availability.days'] = { $in: [availability] };
    
    const doctors = await Doctor.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ rating: -1, total_consultations: -1 });
    
    const total = await Doctor.countDocuments(query);
    
    res.status(200).json({
      doctors,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching doctors", error: err.message });
  }
});

// 📅 NURSE BOOKING ROUTES

// Create nurse booking
app.post('/api/nurse-bookings', authenticateToken, async (req, res) => {
  try {
    console.log('🚀 Booking request received:', JSON.stringify(req.body, null, 2));
    const {
      nurse_id,
      doctor_id,
      service_type,
      patient_details,
      appointment_details,
      pricing
    } = req.body;

    // If no nurse_id provided, find an available nurse
    let selectedNurseId = nurse_id;
    if (!selectedNurseId) {
      const availableNurse = await Nurse.findOne({ 
        status: 'active', 
        is_verified: true 
      }).populate('agency_id');
      selectedNurseId = availableNurse ? availableNurse._id : null;
      
      if (!selectedNurseId) {
        return res.status(400).json({ message: "No available nurses found" });
      }
    }

    const newBooking = new NurseBooking({
      patient_id: req.user._id,
      nurse_id: selectedNurseId,
      doctor_id,
      service_type,
      patient_details,
      appointment_details,
      pricing,
      status: 'pending'
    });

    await newBooking.save();
    
    // Populate the booking with nurse and doctor details
    const populatedBooking = await NurseBooking.findById(newBooking._id)
      .populate('nurse_id', 'name phone specializations')
      .populate('doctor_id', 'name specialization consultation_fee')
      .populate('patient_id', 'name email phone');
    
    // Send SMS confirmation to patient
    const smsDetails = {
      date: appointment_details.date,
      time: appointment_details.time_slot,
      service: service_type === 'hybrid' ? 'Hybrid Care (Nurse + Doctor)' : 'Home Nursing',
      amount: pricing.total_amount
    };
    
    console.log('📱 [BOOKING] Patient phone from DB:', populatedBooking.patient_id.phone);
    console.log('📱 [BOOKING] Patient phone from request:', patient_details.phone);
    
    const patientPhone = populatedBooking.patient_id.phone || patient_details.phone;
    if (patientPhone) {
      console.log('📱 [BOOKING] Sending SMS to patient:', patientPhone);
      const smsResult = await sendBookingRequestSMS(patientPhone, smsDetails);
      console.log('📱 [BOOKING] Patient SMS result:', smsResult);
    } else {
      console.log('❌ [BOOKING] No patient phone number available');
    }
    
    // Send SMS notification to nurse
    const nurseNotificationDetails = {
      patientName: populatedBooking.patient_id.name,
      date: appointment_details.date,
      time: appointment_details.time_slot,
      address: appointment_details.address,
      amount: pricing.total_amount
    };
    
    console.log('📱 [BOOKING] Nurse phone:', populatedBooking.nurse_id.phone);
    if (populatedBooking.nurse_id.phone) {
      console.log('📱 [BOOKING] Sending SMS to nurse:', populatedBooking.nurse_id.phone);
      const nurseSmsResult = await sendNurseBookingNotificationSMS(populatedBooking.nurse_id.phone, nurseNotificationDetails);
      console.log('📱 [BOOKING] Nurse SMS result:', nurseSmsResult);
    } else {
      console.log('❌ [BOOKING] No nurse phone number available');
    }
    
    console.log(`📱 Notification sent to nurse: ${populatedBooking.nurse_id.name}`);
    console.log(`⏰ Booking for: ${appointment_details.date} at ${appointment_details.time_slot}`);
    
    res.status(201).json({ 
      message: "Booking request sent to nurse. Waiting for confirmation.", 
      booking: populatedBooking 
    });
  } catch (err) {
    console.error('❌ Booking Error Details:', err);
    res.status(500).json({ message: "Booking failed", error: err.message, details: err });
  }
});

// Get user's nurse bookings
app.get('/api/nurse-bookings', authenticateToken, async (req, res) => {
  try {
    const bookings = await NurseBooking.find({ patient_id: req.user._id })
      .populate('nurse_id', 'name phone specializations profile_image rating')
      .populate('doctor_id', 'name specialization profile_image rating')
      .sort({ createdAt: -1 });
    
    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ message: "Error fetching bookings", error: err.message });
  }
});

// 🏥 AGENCY ROUTES

// 🔐 Send OTP for Agency Registration
app.post('/api/agency/send-otp', async (req, res) => {
  try {
    const { name, email, password, phone, license_number, address, description, services_offered, coverage_areas, website } = req.body;
    console.log("🚀 Sending OTP for agency registration:", { name, email, license_number });

    // Validate required fields
    if (!name || !email || !password || !phone || !license_number || !address) {
      return res.status(400).json({ message: "Name, email, password, phone, license number, and address are required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Validate phone format (10 digits)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: "Phone number must be 10 digits" });
    }

    // Check if agency already exists
    const existingAgency = await Agency.findOne({ $or: [{ email }, { license_number }] });
    if (existingAgency) {
      return res.status(409).json({ message: "Agency already exists with this email or license number" });
    }

    // Delete any existing OTP for this email and type
    await OTP.deleteMany({ email, userType: 'agency' });

    // Generate OTP
    const otp = generateOTP();
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store OTP and agency data temporarily
    const otpRecord = new OTP({
      email,
      otp,
      userType: 'agency',
      userData: {
        name,
        email,
        password: hashedPassword,
        phone,
        license_number,
        address,
        description,
        website,
        services_offered: services_offered || [],
        coverage_areas: coverage_areas || [],
        status: 'pending_verification',
        is_verified: false
      }
    });

    await otpRecord.save();

    // Send OTP email
    const emailResult = await sendAgencyRegistrationOTP(email, name, otp);
    
    if (!emailResult.success) {
      return res.status(500).json({ message: "Failed to send OTP email", error: emailResult.error });
    }

    console.log("✅ OTP sent for agency registration:", email);
    res.status(200).json({ 
      message: "OTP sent successfully to your email", 
      email: email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Mask email for security
    });
  } catch (err) {
    console.error("❌ Send Agency OTP Error:", err);
    res.status(500).json({ message: "Failed to send OTP", error: err.message });
  }
});

// 🔐 Verify OTP and Complete Agency Registration
app.post('/api/agency/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log("🔍 Verifying OTP for agency:", email);

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // Find OTP record
    const otpRecord = await OTP.findOne({ email, userType: 'agency', isVerified: false });
    
    if (!otpRecord) {
      return res.status(400).json({ message: "OTP not found or already verified" });
    }

    // Check if OTP is correct
    if (otpRecord.otp !== otp) {
      // Increment attempts
      otpRecord.attempts += 1;
      await otpRecord.save();

      if (otpRecord.attempts >= 3) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return res.status(400).json({ message: "Too many incorrect attempts. Please request a new OTP." });
      }

      return res.status(400).json({ 
        message: "Invalid OTP", 
        attemptsLeft: 3 - otpRecord.attempts 
      });
    }

    // Create agency with stored data
    const agencyData = otpRecord.userData;
    agencyData.email_verified = true;
    const newAgency = new Agency(agencyData);

    await newAgency.save();

    // Mark OTP as verified and delete
    await OTP.deleteOne({ _id: otpRecord._id });

    // Send welcome email
    await sendWelcomeEmail(agencyData.email, agencyData.name, 'agency');

    console.log("✅ Agency registered successfully:", agencyData.email);
    res.status(201).json({ 
      message: "Agency registration submitted successfully. Please wait for admin approval.",
      status: "pending_verification",
      agency: {
        id: newAgency._id,
        name: newAgency.name,
        email: newAgency.email,
        status: newAgency.status
      }
    });
  } catch (err) {
    console.error("❌ Agency OTP Verification Error:", err);
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
});

// 🔐 Resend OTP for Agency Registration
app.post('/api/agency/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find existing OTP record
    const existingOTP = await OTP.findOne({ email, userType: 'agency', isVerified: false });
    
    if (!existingOTP) {
      return res.status(400).json({ message: "No pending agency registration found for this email" });
    }

    // Generate new OTP
    const newOtp = generateOTP();
    
    // Update OTP record
    existingOTP.otp = newOtp;
    existingOTP.attempts = 0;
    existingOTP.createdAt = new Date();
    await existingOTP.save();

    // Send OTP email
    const emailResult = await sendAgencyRegistrationOTP(email, existingOTP.userData.name, newOtp);
    
    if (!emailResult.success) {
      return res.status(500).json({ message: "Failed to send OTP email", error: emailResult.error });
    }

    res.status(200).json({ message: "OTP resent successfully" });
  } catch (err) {
    console.error("❌ Resend Agency OTP Error:", err);
    res.status(500).json({ message: "Failed to resend OTP", error: err.message });
  }
});

// Agency registration (DEPRECATED - use OTP-based registration above)
app.post('/api/agency/register', async (req, res) => {
  res.status(400).json({ 
    message: "This endpoint is deprecated. Please use /api/agency/send-otp for registration.",
    deprecated: true
  });
});

// Agency login
app.post('/api/agency/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const agency = await Agency.findOne({ email });
    if (!agency) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    const isMatch = await bcrypt.compare(password, agency.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    // Check verification status
    if (agency.status === 'pending_verification') {
      return res.status(403).json({ 
        message: "Your agency registration is pending admin approval. Please wait for verification.",
        status: "pending_verification"
      });
    }
    
    if (agency.status === 'inactive') {
      return res.status(403).json({ 
        message: "Your agency account has been deactivated. Please contact support.",
        status: "inactive"
      });
    }
    
    if (!agency.is_verified) {
      return res.status(403).json({ 
        message: "Your agency is not verified. Please contact support.",
        status: "not_verified"
      });
    }
    
    const token = jwt.sign({ agencyID: agency._id, type: 'agency' }, SECRET_KEY, { expiresIn: '24h' });
    
    res.status(200).json({ 
      token, 
      agency: { 
        id: agency._id, 
        name: agency.name, 
        email: agency.email,
        status: agency.status,
        is_verified: agency.is_verified
      } 
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// Agency middleware (DEPRECATED - using authenticateRole('agency'))
const authenticateAgency = authenticateRole('agency');

// Nurse middleware (DEPRECATED - using authenticateRole('nurse'))
const authenticateNurse = authenticateRole('nurse');

// Add nurse (Agency only)
app.post('/api/agency/nurses', authenticateRole('agency'), async (req, res) => {
  try {
    console.log('Creating nurse with data:', req.body);
    
    // Check for existing nurse with same email or license
    const existingNurse = await Nurse.findOne({
      $or: [
        { email: req.body.email },
        { license_number: req.body.license_number }
      ]
    });
    
    if (existingNurse) {
      return res.status(409).json({ 
        message: existingNurse.email === req.body.email 
          ? "A nurse with this email already exists" 
          : "A nurse with this license number already exists"
      });
    }
    
    // Hash password if provided
    let hashedPassword = null;
    if (req.body.password) {
      hashedPassword = await bcrypt.hash(req.body.password, 10);
    }
    
    const nurseData = { 
      ...req.body, 
      agency_id: req.agency._id,
      password: hashedPassword
    };
    const newNurse = new Nurse(nurseData);
    await newNurse.save();
    
    console.log('Nurse created successfully:', newNurse._id);
    res.status(201).json({ message: "Nurse added successfully", nurse: newNurse });
  } catch (err) {
    console.error('Error creating nurse:', err);
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ message: "Validation failed", errors });
    }
    
    // Handle duplicate key errors
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ 
        message: `A nurse with this ${field} already exists` 
      });
    }
    
    res.status(500).json({ message: "Failed to add nurse", error: err.message });
  }
});

// Get agency's nurses
app.get('/api/agency/nurses', authenticateRole('agency'), async (req, res) => {
  try {
    const nurses = await Nurse.find({ agency_id: req.agency._id })
      .sort({ createdAt: -1 });
    
    res.status(200).json(nurses);
  } catch (err) {
    res.status(500).json({ message: "Error fetching nurses", error: err.message });
  }
});

// Update nurse
app.put('/api/agency/nurses/:id', authenticateRole('agency'), async (req, res) => {
  try {
    console.log('Updating nurse:', req.params.id, 'with data:', req.body);
    
    // Check if nurse exists and belongs to this agency
    const existingNurse = await Nurse.findOne({ 
      _id: req.params.id, 
      agency_id: req.agency._id 
    });
    
    if (!existingNurse) {
      return res.status(404).json({ message: "Nurse not found" });
    }
    
    // Check for conflicts with other nurses (excluding current nurse)
    if (req.body.email || req.body.license_number) {
      const conflictQuery = {
        _id: { $ne: req.params.id },
        $or: []
      };
      
      if (req.body.email) conflictQuery.$or.push({ email: req.body.email });
      if (req.body.license_number) conflictQuery.$or.push({ license_number: req.body.license_number });
      
      const conflictingNurse = await Nurse.findOne(conflictQuery);
      if (conflictingNurse) {
        return res.status(409).json({ 
          message: conflictingNurse.email === req.body.email 
            ? "Another nurse with this email already exists" 
            : "Another nurse with this license number already exists"
        });
      }
    }
    
    const nurse = await Nurse.findOneAndUpdate(
      { _id: req.params.id, agency_id: req.agency._id },
      req.body,
      { new: true, runValidators: true }
    );
    
    console.log('Nurse updated successfully:', nurse._id);
    res.status(200).json({ message: "Nurse updated successfully", nurse });
  } catch (err) {
    console.error('Error updating nurse:', err);
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ message: "Validation failed", errors });
    }
    
    // Handle duplicate key errors
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ 
        message: `Another nurse with this ${field} already exists` 
      });
    }
    
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

// Delete nurse
app.delete('/api/agency/nurses/:id', authenticateRole('agency'), async (req, res) => {
  try {
    const nurse = await Nurse.findOneAndDelete({ 
      _id: req.params.id, 
      agency_id: req.agency._id 
    });
    
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    
    res.status(200).json({ message: "Nurse deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

// Nurse confirms/rejects booking
app.put('/api/nurse/bookings/:id/confirm', authenticateRole('nurse'), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejection_reason } = req.body;
    
    console.log(`🏥 [BOOKING] Nurse ${action} booking ${id}`);
    console.log(`🏥 [BOOKING] Request body:`, req.body);
    
    const booking = await NurseBooking.findById(id)
      .populate('patient_id', 'name email phone')
      .populate('nurse_id', 'name');
    
    if (!booking) {
      console.log(`❌ [BOOKING] Booking ${id} not found`);
      return res.status(404).json({ message: "Booking not found" });
    }
    
    console.log(`🏥 [BOOKING] Found booking:`, {
      id: booking._id,
      patient: booking.patient_id.name,
      nurse: booking.nurse_id.name,
      currentStatus: booking.status
    });
    
    if (action === 'confirm') {
      booking.status = 'confirmed';
      booking.confirmed_at = new Date();
      console.log(`✅ [BOOKING] Booking confirmed by ${booking.nurse_id.name}`);
      
      // Send confirmation SMS
      const confirmDetails = {
        date: booking.appointment_details.date,
        time: booking.appointment_details.time_slot,
        nurseName: booking.nurse_id.name,
        address: booking.appointment_details.address
      };
      
      console.log(`📱 [BOOKING] Sending confirmation SMS to patient:`, booking.patient_id.phone);
      const smsResult = await sendBookingStatusSMS(booking.patient_id.phone, 'confirmed', confirmDetails);
      console.log(`📱 [BOOKING] SMS result:`, smsResult);
      
    } else if (action === 'reject') {
      booking.status = 'cancelled';
      booking.rejection_reason = rejection_reason;
      booking.cancelled_at = new Date();
      console.log(`❌ [BOOKING] Booking rejected: ${rejection_reason}`);
      
      // Send cancellation SMS
      const cancelDetails = {
        bookingId: booking._id,
        reason: rejection_reason
      };
      
      console.log(`📱 [BOOKING] Sending cancellation SMS to patient:`, booking.patient_id.phone);
      const smsResult = await sendBookingStatusSMS(booking.patient_id.phone, 'cancelled', cancelDetails);
      console.log(`📱 [BOOKING] SMS result:`, smsResult);
    }
    
    await booking.save();
    console.log(`✅ [BOOKING] Booking ${action}ed and saved successfully`);
    res.status(200).json({ message: `Booking ${action}ed successfully`, booking });
  } catch (err) {
    console.error(`❌ [BOOKING] Error updating booking:`, err);
    res.status(500).json({ message: "Error updating booking", error: err.message });
  }
});

// Get booking status
app.get('/api/bookings/:id/status', async (req, res) => {
  try {
    const booking = await NurseBooking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    res.status(200).json({ status: booking.status, booking });
  } catch (err) {
    res.status(500).json({ message: "Error fetching booking status", error: err.message });
  }
});

// Get nurse's assigned bookings
app.get('/api/nurse/bookings', authenticateRole('nurse'), async (req, res) => {
  try {
    const bookings = await NurseBooking.find({ nurse_id: req.nurse._id })
      .populate('patient_id', 'name email phone')
      .populate('doctor_id', 'name specialization')
      .sort({ createdAt: -1 });
    
    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ message: "Error fetching bookings", error: err.message });
  }
});

// BOOKING MANAGEMENT ROUTES

// Get bookings for agency (to assign to nurses)
app.get('/api/agency/bookings', authenticateRole('agency'), async (req, res) => {
  try {
    const bookings = await NurseBooking.find({
      nurse_id: { $in: await Nurse.find({ agency_id: req.agency._id }).select('_id') }
    })
    .populate('patient_id', 'name email phone')
    .populate('nurse_id', 'name phone')
    .populate('doctor_id', 'name specialization')
    .sort({ createdAt: -1 });
    
    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ message: "Error fetching bookings", error: err.message });
  }
});

// Update booking status (accept/reject by nurse or doctor)
app.put('/api/bookings/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const booking = await NurseBooking.findByIdAndUpdate(
      req.params.id,
      { 
        status,
        'consultation_details.treatment_plan': notes || ''
      },
      { new: true }
    ).populate('nurse_id patient_id doctor_id');
    
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    
    // Send SMS notification to patient about status change
    if (booking.patient_id.phone) {
      const smsDetails = {
        date: booking.appointment_details.date,
        time: booking.appointment_details.time_slot,
        nurseName: booking.nurse_id.name,
        address: booking.appointment_details.address,
        bookingId: booking._id,
        amount: booking.pricing.total_amount
      };
      
      await sendBookingStatusSMS(booking.patient_id.phone, status, smsDetails);
    }
    
    res.status(200).json({ message: "Booking status updated", booking });
  } catch (err) {
    res.status(500).json({ message: "Error updating booking", error: err.message });
  }
});

// Nurse handoff to doctor (for teleconsultancy)
app.put('/api/bookings/:id/handoff-to-doctor', authenticateRole('nurse'), async (req, res) => {
  try {
    const { vital_signs, nurse_notes } = req.body;
    
    const booking = await NurseBooking.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'doctor_consultation',
        nurse_handoff_at: new Date(),
        'consultation_details.vital_signs': vital_signs || {},
        'consultation_details.nurse_notes': nurse_notes || ''
      },
      { new: true }
    ).populate('nurse_id patient_id doctor_id');
    
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    
    if (booking.service_type !== 'hybrid') {
      return res.status(400).json({ message: "Handoff only available for hybrid teleconsultancy" });
    }
    
    // Send handoff SMS to patient
    if (booking.patient_id.phone && booking.doctor_id) {
      const handoffDetails = {
        nurseName: booking.nurse_id.name,
        doctorName: booking.doctor_id.name,
        doctorSpecialization: booking.doctor_id.specialization
      };
      
      await sendNurseHandoffSMS(booking.patient_id.phone, handoffDetails);
      
      // Send doctor join notification after 2 minutes (simulate)
      setTimeout(async () => {
        const doctorJoinDetails = {
          doctorName: booking.doctor_id.name,
          doctorSpecialization: booking.doctor_id.specialization,
          nurseName: booking.nurse_id.name,
          consultationFee: booking.pricing.doctor_fee || 500
        };
        await sendDoctorJoinSMS(booking.patient_id.phone, doctorJoinDetails);
      }, 2000); // 2 seconds for demo (would be 2 minutes in production)
    }
    
    res.status(200).json({ message: "Handoff to doctor successful", booking });
  } catch (err) {
    res.status(500).json({ message: "Error during handoff", error: err.message });
  }
});

// Complete service (nurse marks service as completed)
app.put('/api/bookings/:id/complete', authenticateRole('nurse'), async (req, res) => {
  try {
    const { notes, vital_signs } = req.body;
    
    const booking = await NurseBooking.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'completed',
        completed_at: new Date(),
        'consultation_details.treatment_plan': notes || '',
        'consultation_details.vital_signs': vital_signs || {}
      },
      { new: true }
    ).populate('nurse_id patient_id doctor_id');
    
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    
    // Send completion SMS to patient
    if (booking.patient_id.phone) {
      const completionDetails = {
        date: booking.appointment_details.date,
        time: booking.appointment_details.time_slot,
        nurseName: booking.nurse_id.name,
        amount: booking.pricing.total_amount
      };
      
      await sendServiceCompletionSMS(booking.patient_id.phone, completionDetails);
    }
    
    res.status(200).json({ message: "Service completed successfully", booking });
  } catch (err) {
    res.status(500).json({ message: "Error completing service", error: err.message });
  }
});

// NURSE & DOCTOR AUTHENTICATION

// Nurse login
app.post('/api/nurse/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('👩‍⚕️ [NURSE] Login attempt:', email);
    
    // Find nurse by email
    const nurse = await Nurse.findOne({ email, status: 'active' })
      .populate('agency_id', 'name');
    
    if (!nurse) {
      console.log('❌ [NURSE] Nurse not found or inactive:', email);
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    // Check if nurse has password (set by agency)
    if (!nurse.password) {
      console.log('❌ [NURSE] Nurse has no password set:', email);
      return res.status(401).json({ message: "Account not activated. Contact your agency." });
    }
    
    // Compare password
    const isMatch = await bcrypt.compare(password, nurse.password);
    if (!isMatch) {
      console.log('❌ [NURSE] Invalid password for:', email);
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    const token = jwt.sign({ nurseID: nurse._id, type: 'nurse' }, SECRET_KEY, { expiresIn: '24h' });
    
    console.log('✅ [NURSE] Login successful:', nurse.name);
    res.status(200).json({ 
      token, 
      nurse: { 
        id: nurse._id,
        name: nurse.name,
        email: nurse.email,
        phone: nurse.phone,
        specializations: nurse.specializations,
        agency: nurse.agency_id.name
      } 
    });
  } catch (err) {
    console.error('❌ [NURSE] Login error:', err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// 👨‍⚕️ DOCTOR REGISTRATION ROUTES

// 🔐 Send OTP for Doctor Registration
app.post('/api/doctor/send-otp', async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone, 
      medical_license, 
      specialization, 
      sub_specializations, 
      experience_years, 
      consultation_fee, 
      education, 
      availability, 
      bio, 
      languages 
    } = req.body;
    
    console.log("🚀 Sending OTP for doctor registration:", { name, email, medical_license, specialization });

    // Validate required fields
    if (!name || !email || !phone || !medical_license || !specialization || !experience_years || !consultation_fee) {
      return res.status(400).json({ 
        message: "Name, email, phone, medical license, specialization, experience years, and consultation fee are required" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Validate phone format (10 digits)
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: "Phone number must be 10 digits" });
    }

    // Validate experience years
    if (experience_years < 0 || experience_years > 50) {
      return res.status(400).json({ message: "Experience years must be between 0 and 50" });
    }

    // Validate consultation fee
    if (consultation_fee < 0) {
      return res.status(400).json({ message: "Consultation fee must be a positive number" });
    }

    // Check if doctor already exists
    const existingDoctor = await Doctor.findOne({ $or: [{ email }, { medical_license }] });
    if (existingDoctor) {
      return res.status(409).json({ message: "Doctor already exists with this email or medical license" });
    }

    // Delete any existing OTP for this email and type
    await OTP.deleteMany({ email, userType: 'doctor' });

    // Generate OTP
    const otp = generateOTP();

    // Store OTP and doctor data temporarily
    const otpRecord = new OTP({
      email,
      otp,
      userType: 'doctor',
      userData: {
        name,
        email,
        phone,
        medical_license,
        specialization,
        sub_specializations: sub_specializations || [],
        experience_years: parseInt(experience_years),
        consultation_fee: parseFloat(consultation_fee),
        education: education || [],
        availability: availability || {
          days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          hours: { start: '09:00', end: '17:00' }
        },
        bio: bio || '',
        languages: languages || ['English'],
        rating: 0,
        total_consultations: 0,
        total_reviews: 0,
        status: 'active',
        is_verified: false,
        video_call_enabled: true
      }
    });

    await otpRecord.save();

    // Send OTP email
    const emailResult = await sendDoctorRegistrationOTP(email, name, otp);
    
    if (!emailResult.success) {
      return res.status(500).json({ message: "Failed to send OTP email", error: emailResult.error });
    }

    console.log("✅ OTP sent for doctor registration:", email);
    res.status(200).json({ 
      message: "OTP sent successfully to your email", 
      email: email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Mask email for security
    });
  } catch (err) {
    console.error("❌ Send Doctor OTP Error:", err);
    res.status(500).json({ message: "Failed to send OTP", error: err.message });
  }
});

// 🔐 Verify OTP and Complete Doctor Registration
app.post('/api/doctor/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    console.log("🔍 Verifying OTP for doctor:", email);

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    // Find OTP record
    const otpRecord = await OTP.findOne({ email, userType: 'doctor', isVerified: false });
    
    if (!otpRecord) {
      return res.status(400).json({ message: "OTP not found or already verified" });
    }

    // Check if OTP is correct
    if (otpRecord.otp !== otp) {
      // Increment attempts
      otpRecord.attempts += 1;
      await otpRecord.save();

      if (otpRecord.attempts >= 3) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return res.status(400).json({ message: "Too many incorrect attempts. Please request a new OTP." });
      }

      return res.status(400).json({ 
        message: "Invalid OTP", 
        attemptsLeft: 3 - otpRecord.attempts 
      });
    }

    // Create doctor with stored data
    const doctorData = otpRecord.userData;
    doctorData.email_verified = true;
    const newDoctor = new Doctor(doctorData);

    await newDoctor.save();

    // Mark OTP as verified and delete
    await OTP.deleteOne({ _id: otpRecord._id });

    // Send welcome email
    await sendWelcomeEmail(doctorData.email, doctorData.name, 'doctor');

    console.log("✅ Doctor registered successfully:", doctorData.email);
    res.status(201).json({ 
      message: "Doctor registration submitted successfully. Please wait for admin approval.",
      status: "pending_verification",
      doctor: {
        id: newDoctor._id,
        name: newDoctor.name,
        email: newDoctor.email,
        specialization: newDoctor.specialization,
        is_verified: newDoctor.is_verified
      }
    });
  } catch (err) {
    console.error("❌ Doctor OTP Verification Error:", err);
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
});

// 🔐 Resend OTP for Doctor Registration
app.post('/api/doctor/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find existing OTP record
    const existingOTP = await OTP.findOne({ email, userType: 'doctor', isVerified: false });
    
    if (!existingOTP) {
      return res.status(400).json({ message: "No pending doctor registration found for this email" });
    }

    // Generate new OTP
    const newOtp = generateOTP();
    
    // Update OTP record
    existingOTP.otp = newOtp;
    existingOTP.attempts = 0;
    existingOTP.createdAt = new Date();
    await existingOTP.save();

    // Send OTP email
    const emailResult = await sendDoctorRegistrationOTP(email, existingOTP.userData.name, newOtp);
    
    if (!emailResult.success) {
      return res.status(500).json({ message: "Failed to send OTP email", error: emailResult.error });
    }

    res.status(200).json({ message: "OTP resent successfully" });
  } catch (err) {
    console.error("❌ Resend Doctor OTP Error:", err);
    res.status(500).json({ message: "Failed to resend OTP", error: err.message });
  }
});

// Doctor login
app.post('/api/doctor/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Find doctor by email
    const doctor = await Doctor.findOne({ email });
    if (!doctor) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Note: Since doctors registered via OTP don't have passwords initially,
    // you may want to add a separate endpoint for doctors to set their password
    // For now, we'll check if password is set and if not, suggest password setup
    if (!doctor.password) {
      return res.status(400).json({ 
        message: "Password not set. Please set your password first.",
        requirePasswordSetup: true,
        doctorId: doctor._id
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, doctor.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check verification status
    if (!doctor.is_verified) {
      return res.status(403).json({ 
        message: "Your doctor profile is pending admin verification. Please wait for approval.",
        status: "pending_verification"
      });
    }

    if (doctor.status === 'inactive') {
      return res.status(403).json({ 
        message: "Your doctor account has been deactivated. Please contact support.",
        status: "inactive"
      });
    }

    const token = jwt.sign({ doctorID: doctor._id, type: 'doctor' }, SECRET_KEY, { expiresIn: '24h' });
    
    res.status(200).json({ 
      token, 
      doctor: { 
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        specialization: doctor.specialization,
        consultation_fee: doctor.consultation_fee,
        rating: doctor.rating,
        total_consultations: doctor.total_consultations
      } 
    });
  } catch (err) {
    console.error('❌ [DOCTOR] Login error:', err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// 🔐 Set Password for Doctor (after OTP verification)
app.post('/api/doctor/set-password', async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;
    
    if (!email || !password || !confirmPassword) {
      return res.status(400).json({ message: "Email, password, and confirm password are required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // Find doctor
    const doctor = await Doctor.findOne({ email });
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update doctor with password
    doctor.password = hashedPassword;
    await doctor.save();

    res.status(200).json({ message: "Password set successfully. You can now login." });
  } catch (err) {
    console.error('❌ [DOCTOR] Set password error:', err);
    res.status(500).json({ message: "Failed to set password", error: err.message });
  }
});

// 🔐 ADMIN AUTHENTICATION & AGENCY APPROVAL

// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const admin = await Admin.findOne({ email, status: 'active' });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    
    admin.last_login = new Date();
    await admin.save();
    
    const token = jwt.sign({ adminID: admin._id, type: 'admin' }, SECRET_KEY, { expiresIn: '24h' });
    
    res.status(200).json({ 
      token, 
      admin: { 
        id: admin._id, 
        name: admin.name, 
        email: admin.email, 
        role: admin.role,
        permissions: admin.permissions
      } 
    });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// Admin middleware (DEPRECATED - using authenticateRole('admin'))
const authenticateAdmin = authenticateRole('admin');

// Get pending agencies for approval
app.get('/api/admin/agencies/pending', authenticateRole('admin'), async (req, res) => {
  try {
    const agencies = await Agency.find({ 
      status: 'pending_verification',
      is_verified: false 
    }).sort({ createdAt: -1 });
    
    res.status(200).json(agencies);
  } catch (err) {
    res.status(500).json({ message: "Error fetching pending agencies", error: err.message });
  }
});

// Approve/Reject agency
app.put('/api/admin/agencies/:id/status', authenticateRole('admin'), async (req, res) => {
  try {
    const { status, rejection_reason } = req.body; // status: 'active' or 'inactive'
    
    const agency = await Agency.findById(req.params.id);
    if (!agency) {
      return res.status(404).json({ message: "Agency not found" });
    }
    
    if (status === 'active') {
      agency.status = 'active';
      agency.is_verified = true;
    } else {
      agency.status = 'inactive';
      agency.rejection_reason = rejection_reason;
    }
    
    await agency.save();
    
    res.status(200).json({ 
      message: `Agency ${status === 'active' ? 'approved' : 'rejected'} successfully`, 
      agency 
    });
  } catch (err) {
    res.status(500).json({ message: "Error updating agency status", error: err.message });
  }
});

// Get all agencies (for admin)
app.get('/api/admin/agencies', authenticateRole('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = status ? { status } : {};
    
    const agencies = await Agency.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    
    const total = await Agency.countDocuments(query);
    
    res.status(200).json({
      agencies,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching agencies", error: err.message });
  }
});

// Test SMS endpoint
app.post('/api/test-sms', async (req, res) => {
  try {
    const { phone } = req.body;
    const testDetails = {
      date: '2024-12-15',
      time: '2:00 PM',
      service: 'Test Service',
      amount: 500
    };
    
    console.log('📱 [TEST] Testing SMS to:', phone);
    const result = await sendBookingRequestSMS(phone, testDetails);
    console.log('📱 [TEST] SMS result:', result);
    
    res.status(200).json({ message: 'Test SMS sent', result });
  } catch (error) {
    console.error('❌ [TEST] SMS test failed:', error);
    res.status(500).json({ message: 'SMS test failed', error: error.message });
  }
});

// Apply comprehensive error handling middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`� Server running on port ${PORT}`);
  console.log(`🏥 Clynicare Healthcare Platform API`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`� API Documentation: http://localhost:${PORT}/api-docs`);
});
