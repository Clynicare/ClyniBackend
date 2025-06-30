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

const app = express();
const PORT = process.env.PORT || 7000;
const MONGO_URL = process.env.MONGO_URL || "mongodb+srv://syedakousar222:youjv72XqW9Inn8n@amreen.j1fof.mongodb.net/";
const SECRET_KEY = process.env.SECRET_KEY || "thisisasecretkey";
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
  url:process.env.REDIS_URL ||"rediss://default:AYv7AAIjcDFmZWNlNTE1YWFjMTI0OWUwOTBlMTk2MWFmYjZmOGQ1NHAxMA@immense-adder-35835.upstash.io:6379",
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
    const token = jwt.sign({ userID: user._id }, process.env.SECRET_KEY, { expiresIn: '1h' });

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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("🔥 Server error:", err.stack);
  res.status(500).json({ message: "Internal Server Error", error: err.message });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
