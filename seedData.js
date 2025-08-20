const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Import models
const Agency = require('./models/agency');
const Nurse = require('./models/nurse');
const Doctor = require('./models/doctor');

const MONGO_URL = process.env.MONGO_URL || "mongodb+srv://syedakousar222:youjv72XqW9Inn8n@amreen.j1fof.mongodb.net/";

// Sample data
const sampleAgencies = [
  {
    name: "HealthCare Plus Agency",
    email: "admin@healthcareplus.com",
    password: "password123",
    phone: "9876543210",
    license_number: "HCP001",
    address: {
      street: "123 Medical Street",
      city: "Mumbai",
      state: "Maharashtra",
      zipcode: "400001"
    },
    description: "Leading healthcare agency providing quality nursing services",
    services_offered: ["Home Nursing", "ICU Care", "Elderly Care"],
    coverage_areas: ["Mumbai", "Pune", "Nashik"],
    status: "active",
    is_verified: true
  },
  {
    name: "Care First Nursing",
    email: "info@carefirst.com",
    password: "password123",
    phone: "9876543211",
    license_number: "CF002",
    address: {
      street: "456 Care Avenue",
      city: "Delhi",
      state: "Delhi",
      zipcode: "110001"
    },
    description: "Specialized in post-surgery and critical care nursing",
    services_offered: ["Post-Surgery Care", "Wound Care", "Medication Management"],
    coverage_areas: ["Delhi", "Gurgaon", "Noida"],
    status: "active",
    is_verified: true
  }
];

const sampleNurses = [
  {
    name: "Priya Sharma",
    email: "priya.sharma@email.com",
    phone: "9876543212",
    license_number: "RN001",
    specializations: ["General Nursing", "Elderly Care", "Medication Management"],
    experience_years: 5,
    hourly_rate: 500,
    availability: {
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      hours: {
        start: "09:00",
        end: "17:00"
      }
    },
    location: {
      city: "Mumbai",
      state: "Maharashtra",
      zipcode: "400001",
      coordinates: {
        lat: 19.0760,
        lng: 72.8777
      }
    },
    bio: "Experienced nurse with 5 years in home healthcare",
    certifications: ["BLS", "ACLS"],
    languages: ["English", "Hindi", "Marathi"],
    rating: 4.8,
    total_reviews: 45,
    status: "active",
    is_verified: true
  },
  {
    name: "Rajesh Kumar",
    email: "rajesh.kumar@email.com",
    phone: "9876543213",
    license_number: "RN002",
    specializations: ["ICU Care", "Post-Surgery Care", "Wound Care"],
    experience_years: 8,
    hourly_rate: 700,
    availability: {
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      hours: {
        start: "08:00",
        end: "20:00"
      }
    },
    location: {
      city: "Delhi",
      state: "Delhi",
      zipcode: "110001",
      coordinates: {
        lat: 28.7041,
        lng: 77.1025
      }
    },
    bio: "Critical care specialist with extensive ICU experience",
    certifications: ["BLS", "ACLS", "PALS"],
    languages: ["English", "Hindi"],
    rating: 4.9,
    total_reviews: 67,
    status: "active",
    is_verified: true
  },
  {
    name: "Anita Patel",
    email: "anita.patel@email.com",
    phone: "9876543214",
    license_number: "RN003",
    specializations: ["Pediatric Care", "General Nursing", "Physical Therapy"],
    experience_years: 6,
    hourly_rate: 600,
    availability: {
      days: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      hours: {
        start: "10:00",
        end: "18:00"
      }
    },
    location: {
      city: "Bangalore",
      state: "Karnataka",
      zipcode: "560001",
      coordinates: {
        lat: 12.9716,
        lng: 77.5946
      }
    },
    bio: "Pediatric care specialist with gentle approach to child healthcare",
    certifications: ["BLS", "PALS"],
    languages: ["English", "Hindi", "Gujarati"],
    rating: 4.7,
    total_reviews: 38,
    status: "active",
    is_verified: true
  }
];

const sampleDoctors = [
  {
    name: "Dr. Amit Verma",
    email: "dr.amit@email.com",
    phone: "9876543215",
    medical_license: "MD001",
    specialization: "General Medicine",
    sub_specializations: ["Internal Medicine", "Preventive Care"],
    experience_years: 12,
    consultation_fee: 800,
    education: [
      {
        degree: "MBBS",
        institution: "AIIMS Delhi",
        year: 2010
      },
      {
        degree: "MD Internal Medicine",
        institution: "AIIMS Delhi",
        year: 2013
      }
    ],
    availability: {
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      hours: {
        start: "09:00",
        end: "17:00"
      }
    },
    bio: "Experienced general physician with focus on preventive healthcare",
    languages: ["English", "Hindi"],
    rating: 4.8,
    total_consultations: 1200,
    total_reviews: 89,
    status: "active",
    is_verified: true,
    video_call_enabled: true
  },
  {
    name: "Dr. Sunita Reddy",
    email: "dr.sunita@email.com",
    phone: "9876543216",
    medical_license: "MD002",
    specialization: "Cardiology",
    sub_specializations: ["Interventional Cardiology", "Heart Failure"],
    experience_years: 15,
    consultation_fee: 1200,
    education: [
      {
        degree: "MBBS",
        institution: "CMC Vellore",
        year: 2007
      },
      {
        degree: "MD Cardiology",
        institution: "CMC Vellore",
        year: 2011
      }
    ],
    availability: {
      days: ["Monday", "Wednesday", "Friday", "Saturday"],
      hours: {
        start: "10:00",
        end: "16:00"
      }
    },
    bio: "Cardiologist specializing in heart disease prevention and treatment",
    languages: ["English", "Hindi", "Telugu"],
    rating: 4.9,
    total_consultations: 800,
    total_reviews: 67,
    status: "active",
    is_verified: true,
    video_call_enabled: true
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB");

    // Clear existing data
    await Agency.deleteMany({});
    await Nurse.deleteMany({});
    await Doctor.deleteMany({});
    console.log("🗑️ Cleared existing data");

    // Hash passwords for agencies
    for (let agency of sampleAgencies) {
      agency.password = await bcrypt.hash(agency.password, 10);
    }

    // Insert agencies
    const insertedAgencies = await Agency.insertMany(sampleAgencies);
    console.log(`✅ Inserted ${insertedAgencies.length} agencies`);

    // Assign agencies to nurses
    sampleNurses[0].agency_id = insertedAgencies[0]._id; // Mumbai agency
    sampleNurses[1].agency_id = insertedAgencies[1]._id; // Delhi agency
    sampleNurses[2].agency_id = insertedAgencies[0]._id; // Mumbai agency

    // Insert nurses
    const insertedNurses = await Nurse.insertMany(sampleNurses);
    console.log(`✅ Inserted ${insertedNurses.length} nurses`);

    // Insert doctors
    const insertedDoctors = await Doctor.insertMany(sampleDoctors);
    console.log(`✅ Inserted ${insertedDoctors.length} doctors`);

    console.log("🎉 Database seeded successfully!");
    console.log("\n📋 Sample Login Credentials:");
    console.log("Agency 1: admin@healthcareplus.com / password123");
    console.log("Agency 2: info@carefirst.com / password123");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

// Run the seeder
seedDatabase();