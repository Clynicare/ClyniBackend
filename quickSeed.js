const mongoose = require('mongoose');
const Nurse = require('./models/nurse');
const Agency = require('./models/agency');

const MONGO_URL = "mongodb+srv://syedakousar222:youjv72XqW9Inn8n@amreen.j1fof.mongodb.net/";

async function quickSeed() {
  try {
    await mongoose.connect(MONGO_URL);
    console.log('Connected to MongoDB');

    // Create a default agency first
    let agency = await Agency.findOne();
    if (!agency) {
      agency = new Agency({
        name: "HealthCare Plus",
        email: "admin@healthcareplus.com",
        password: "$2b$10$hashedpassword", // This would be hashed in real scenario
        phone: "9876543210",
        license_number: "HC001",
        address: "123 Healthcare Street, Medical City",
        description: "Leading healthcare agency"
      });
      await agency.save();
      console.log('✅ Default agency created');
    }

    // Create a default nurse
    const existingNurse = await Nurse.findOne();
    if (!existingNurse) {
      const nurse = new Nurse({
        name: "Sarah Johnson",
        email: "sarah@healthcareplus.com",
        phone: "9876543210",
        agency_id: agency._id,
        specializations: ["General Care", "Elderly Care"],
        experience_years: 5,
        hourly_rate: 500,
        location: {
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001"
        },
        availability: {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          time_slots: ["09:00-17:00"]
        },
        status: "active",
        is_verified: true,
        rating: 4.8,
        total_bookings: 150
      });
      
      await nurse.save();
      console.log('✅ Default nurse created');
    }

    console.log('🎉 Quick seed completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

quickSeed();