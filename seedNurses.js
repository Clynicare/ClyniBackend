const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Agency = require('./models/agency');
const Nurse = require('./models/nurse');

const MONGO_URL = "mongodb+srv://syedakousar222:youjv72XqW9Inn8n@amreen.j1fof.mongodb.net/";

async function seedDatabase() {
  try {
    await mongoose.connect(MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    // Clear existing data
    await Agency.deleteMany({});
    await Nurse.deleteMany({});
    console.log("🗑️ Cleared existing agencies and nurses");

    // Create sample agencies
    const agencies = [
      {
        name: "HealthCare Plus",
        email: "admin@healthcareplus.com",
        password: await bcrypt.hash("password123", 10),
        phone: "9876543210",
        license_number: "HC001",
        address: {
          street: "123 Medical Street",
          city: "Mumbai",
          state: "Maharashtra",
          zipcode: "400001"
        },
        description: "Leading healthcare agency",
        status: "active",
        is_verified: true
      },
      {
        name: "CareFirst Agency",
        email: "info@carefirst.com",
        password: await bcrypt.hash("password123", 10),
        phone: "9876543211",
        license_number: "CF002",
        address: {
          street: "456 Care Avenue",
          city: "Delhi",
          state: "Delhi",
          zipcode: "110001"
        },
        description: "Premium nursing services",
        status: "active",
        is_verified: true
      }
    ];

    const createdAgencies = await Agency.insertMany(agencies);
    console.log("✅ Created agencies:", createdAgencies.map(a => a.name));

    // Create sample nurses for each agency
    const nurses = [
      {
        name: "Sarah Johnson",
        email: "sarah@healthcareplus.com",
        password: await bcrypt.hash("nurse123", 10),
        phone: "8088058792",
        license_number: "RN001",
        specializations: ["General Care", "Elderly Care"],
        experience_years: 5,
        hourly_rate: 500,
        availability: {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          hours: { start: "09:00", end: "17:00" }
        },
        location: {
          city: "Mumbai",
          state: "Maharashtra",
          zipcode: "400001"
        },
        bio: "Experienced nurse with 5 years in patient care",
        rating: 4.8,
        status: "active",
        is_verified: true,
        agency_id: createdAgencies[0]._id
      },
      {
        name: "Priya Sharma",
        email: "priya@healthcareplus.com",
        password: await bcrypt.hash("nurse456", 10),
        phone: "8088058793",
        license_number: "RN002",
        specializations: ["ICU Care", "Post-Surgery Care"],
        experience_years: 7,
        hourly_rate: 600,
        availability: {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          hours: { start: "08:00", end: "16:00" }
        },
        location: {
          city: "Mumbai",
          state: "Maharashtra",
          zipcode: "400002"
        },
        bio: "Specialized in critical care nursing",
        rating: 4.9,
        status: "active",
        is_verified: true,
        agency_id: createdAgencies[0]._id
      },
      {
        name: "Anjali Patel",
        email: "anjali@carefirst.com",
        password: await bcrypt.hash("nurse789", 10),
        phone: "8088058794",
        license_number: "RN003",
        specializations: ["Pediatric Care", "Home Care"],
        experience_years: 4,
        hourly_rate: 450,
        availability: {
          days: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          hours: { start: "10:00", end: "18:00" }
        },
        location: {
          city: "Delhi",
          state: "Delhi",
          zipcode: "110001"
        },
        bio: "Caring nurse specializing in children and home care",
        rating: 4.7,
        status: "active",
        is_verified: true,
        agency_id: createdAgencies[1]._id
      }
    ];

    const createdNurses = await Nurse.insertMany(nurses);
    console.log("✅ Created nurses:", createdNurses.map(n => n.name));

    console.log("\n🎉 Database seeded successfully!");
    console.log("\n📋 Login Credentials:");
    console.log("\n🏥 AGENCIES:");
    console.log("Email: admin@healthcareplus.com | Password: password123");
    console.log("Email: info@carefirst.com | Password: password123");
    console.log("\n👩‍⚕️ NURSES:");
    console.log("Email: sarah@healthcareplus.com | Password: nurse123");
    console.log("Email: priya@healthcareplus.com | Password: nurse456");
    console.log("Email: anjali@carefirst.com | Password: nurse789");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seedDatabase();