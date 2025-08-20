const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const redis = require('redis');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

// Models
const User = require('./models/user');
const Service = require('./models/service');
const Booking = require('./models/booking');
const Nurse = require('./models/nurse');
const Agency = require('./models/agency');
const Doctor = require('./models/doctor');
const NurseBooking = require('./models/nurseBooking');
const { sendBookingRequestSMS, sendBookingStatusSMS, sendNurseBookingNotificationSMS, sendServiceCompletionSMS, sendNurseHandoffSMS, sendDoctorJoinSMS } = require('./services/smsService');

const app = express();
const PORT = process.env.PORT || 7000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/clynicare";
const SECRET_KEY = process.env.SECRET_KEY || "your-secret-key-here";
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const compression=require('compression');
// Connect to MongoDB
mongoose.connect(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Redis client (v4+)
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
  socket: {
    tls: true,   // force TLS (required for Upstash)
    rejectUnauthorized: false, // optional for avoiding SSL cert warnings
  }
});
redisClient.connect()
  .then(() => console.log("✅ Connected to Redis"))
  .catch((err) => console.error("❌ Redis connection failed:", err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(compression());
app.disable('x-powered-by');


// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests, please try again later.",
});
app.use(limiter);

// JWT Authentication Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const user = await User.findById(decoded.userID);
    if (!user) return res.status(404).json({ message: "User not found" });
    req.user = user;
    next();
  } catch (err) {
    res.status(403).json({ message: "Invalid token", error: err });
  }
};

// Routes

// 🔐 Register
app.post('/api/user', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    console.log("🚀 Registering:", { name, email, phone });

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: "All fields are required" });
    }

    console.log("here it is ")
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      phone,
    });

    await newUser.save();
    console.log("✅ User registered:", email);
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("❌ Registration Error:", err);
    res.status(500).json({ message: "Registration failed", error: err.message });
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

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("✅ Cache hit");
      return res.status(200).json(JSON.parse(cached));
    }

    const query = name ? { service_name: { $regex: new RegExp(name, 'i') } } : {};
    const services = await Service.find(query);
    if (!services.length) return res.status(404).json({ message: "No services found" });

    await redisClient.set(cacheKey, JSON.stringify(services), {
      EX: 3600  // 1 hour cache
    });

    console.log("✅ Cache miss - stored in Redis");
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

// Agency registration
app.post('/api/agency/register', async (req, res) => {
  try {
    const { name, email, password, phone, license_number, address, description } = req.body;
    
    const existingAgency = await Agency.findOne({ $or: [{ email }, { license_number }] });
    if (existingAgency) {
      return res.status(409).json({ message: "Agency already exists" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newAgency = new Agency({
      name,
      email,
      password: hashedPassword,
      phone,
      license_number,
      address,
      description
    });
    
    await newAgency.save();
    res.status(201).json({ message: "Agency registered successfully" });
  } catch (err) {
    res.status(500).json({ message: "Registration failed", error: err.message });
  }
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
    
    const token = jwt.sign({ agencyID: agency._id, type: 'agency' }, SECRET_KEY, { expiresIn: '24h' });
    
    res.status(200).json({ token, agency: { id: agency._id, name: agency.name, email: agency.email } });
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
  }
});

// Agency middleware
const authenticateAgency = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });
  
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    if (decoded.type !== 'agency') {
      return res.status(403).json({ message: "Access denied. Agency token required." });
    }
    
    const agency = await Agency.findById(decoded.agencyID);
    if (!agency) return res.status(404).json({ message: "Agency not found" });
    
    req.agency = agency;
    next();
  } catch (err) {
    res.status(403).json({ message: "Invalid token", error: err.message });
  }
};

// Nurse middleware
const authenticateNurse = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });
  
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    if (decoded.type !== 'nurse') {
      return res.status(403).json({ message: "Access denied. Nurse token required." });
    }
    
    const nurse = await Nurse.findById(decoded.nurseID).populate('agency_id');
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    
    req.nurse = nurse;
    next();
  } catch (err) {
    res.status(403).json({ message: "Invalid token", error: err.message });
  }
};

// Add nurse (Agency only)
app.post('/api/agency/nurses', authenticateAgency, async (req, res) => {
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
app.get('/api/agency/nurses', authenticateAgency, async (req, res) => {
  try {
    const nurses = await Nurse.find({ agency_id: req.agency._id })
      .sort({ createdAt: -1 });
    
    res.status(200).json(nurses);
  } catch (err) {
    res.status(500).json({ message: "Error fetching nurses", error: err.message });
  }
});

// Update nurse
app.put('/api/agency/nurses/:id', authenticateAgency, async (req, res) => {
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
app.delete('/api/agency/nurses/:id', authenticateAgency, async (req, res) => {
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
app.put('/api/nurse/bookings/:id/confirm', authenticateNurse, async (req, res) => {
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
app.get('/api/nurse/bookings', authenticateNurse, async (req, res) => {
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
app.get('/api/agency/bookings', authenticateAgency, async (req, res) => {
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
app.put('/api/bookings/:id/handoff-to-doctor', authenticateNurse, async (req, res) => {
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
app.put('/api/bookings/:id/complete', authenticateNurse, async (req, res) => {
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

// Doctor login
app.post('/api/doctor/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Mock authentication for now
    if (email === 'dr.amit@email.com' && password === 'password123') {
      const token = jwt.sign({ doctorID: '1', type: 'doctor' }, SECRET_KEY, { expiresIn: '24h' });
      res.status(200).json({ 
        token, 
        doctor: { 
          id: '1', 
          name: 'Dr. Amit Verma', 
          email: 'dr.amit@email.com',
          specialization: 'General Medicine'
        } 
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ message: "Login failed", error: err.message });
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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("🔥 Server error:", err.stack);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
