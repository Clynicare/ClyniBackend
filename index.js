const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const app = express();
const port = 7000;
const MONGO_URL = "mongodb+srv://syedakousar222:youjv72XqW9Inn8n@amreen.j1fof.mongodb.net/";
const SECRET_KEY = "thisisasecretkey";

const Service = require('./models/service');
const Booking = require('./models/booking');
const User = require('./models/user');
const service = require('./models/service');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ MongoDB Connection Error:", err));

/** 🔹 Middleware for verifying JWT Token */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: "Access denied. No token provided." });
    }
    
    const token = authHeader.split(' ')[1];
    jwt.verify(token, SECRET_KEY, async (err, decoded) => {
        if (err) return  res.status(403).json({ message: "Invalid token", error: err });
            try {
            const user = await User.findById(decoded.userID);
            if (!user) return res.status(404).json({ message: "User not found" });
            req.user = user;
            next();
        } catch (error) {
            return res.status(500).json({ message: "Server error", error });
        }
    });
};

/** 🔹 User Login */
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password });
        if (!user) return res.status(401).json({ message: "Invalid email or password" });

        const token = jwt.sign({ userID: user._id }, SECRET_KEY, { expiresIn: "1h" });
        res.status(200).json({ token });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

/** 🔹 Token Verification */
app.post('/api/token-valid', authenticateToken, (req, res) => {
    res.json({ userInfo: req.user });
});

/** 🔹 Fetch All Services */
// app.get('/api/services', async (req, res) => {
//     try {
//         const services = await Service.find({});
//         res.json(services);
//     } catch (error) {
//         res.status(500).json({ message: "Server error", error });
//     }
// });

/** 🔹 User Registration */
app.post('/api/user', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        console.log("its in th api user")
        const newUser = new User({ name, email, password, phone });
        await newUser.save();
        res.status(200).json({ message: "User created successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error creating user", error });
    }
});

/** 🔹 Fetch All Bookings (Protected) */
// app.get('/api/bookings', authenticateToken, async (req, res) => {
//     try {
//         const bookings = await Booking.find({});
//         res.json(bookings);
//     } catch (error) {
//         res.status(500).json({ message: "Server error", error });
//     }
// });

/** 🔹 Create Booking (Protected) */
//authenticateToken
app.post('/api/bookings',  authenticateToken,async (req, res) => {
    try {
        const { service_id, patient_name, booking_date, booking_time, address, mobile_no,additional_requirements,gender } = req.body;
        console.log(gender)
        let user_id=""
        const userauth=req.headers['authorization'].split(" ")
        jwt.verify(userauth[1],SECRET_KEY,(err,decoded)=>{
            
            if(err) return res.status(401).json({ message: "Invalid token before", error: err });
            
            try{
                user_id=decoded.userID
                console.log(user_id,"this is user id")
            }catch(err){
                console.log("error in verifying user",err)
                return res.status(403).json({ message: "Invalid token after verifing", error: err });
            }
        })
        const newBooking = new Booking({ service_id, user_id,patient_name, booking_date, booking_time, address, mobile_no,additional_requirements,gender });
        await newBooking.save();
        res.status(200).json({ message: "Booking successfully created" });
    } catch (error) {
        res.status(500).json({ message: "Error saving booking", error });
    }
});

app.get('/Bookings',authenticateToken,async(req,res)=>{
    const requesteduser=req.user._id
    const id=requesteduser.toString() 
    const bookingdetails=await Booking.find({user_id:id})
    .populate('service_id','service_name service_category service_description')
    .populate('user_id','email')
    console.log("this is the booking",bookingdetails)
    if(bookingdetails){
     return res.send(bookingdetails)
    }
    else{
        return res.send("No Bookings Found")
    }
})
app.get("/Services", async (req, res) => {
    try {  
        console.log("Received query:", req.url); // Debugging

        const { name } = req.query;
        console.log("Extracted name:", name); // Check if name is extracted

        if (name) {
            const serviceInfo = await Service.find({
                service_name: { $regex: new RegExp(name, "i") },
            });

            if (serviceInfo.length === 0) {
                return res.status(404).json({ message: "Service not found" });
            }

            return res.status(200).json(serviceInfo);
        }

        // Fetch all services if no name is provided
        const services = await Service.find({});
        return res.status(200).json(services);

    } catch (error) {
        console.error("Error fetching services:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


/** 🔹 Global Error Handler */
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
});

app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
