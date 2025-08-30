const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();

const Admin = require('./models/admin');

const MONGO_URL = process.env.MONGO_URL;

const createSuperAdmin = async () => {
  try {
    await mongoose.connect(MONGO_URL);
    console.log("✅ Connected to MongoDB");

    // Check if super admin already exists
    const existingAdmin = await Admin.findOne({ role: 'super_admin' });
    if (existingAdmin) {
      console.log("⚠️ Super admin already exists");
      console.log("Email:", existingAdmin.email);
      process.exit(0);
    }

    // Create super admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const superAdmin = new Admin({
      name: "Super Admin",
      email: "admin@clynicare.com",
      password: hashedPassword,
      role: "super_admin",
      permissions: ["manage_agencies", "manage_users", "manage_bookings", "view_analytics"],
      status: "active"
    });

    await superAdmin.save();
    
    console.log("🎉 Super Admin created successfully!");
    console.log("📋 Login Credentials:");
    console.log("Email: admin@clynicare.com");
    console.log("Password: admin123");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error creating super admin:", error);
    process.exit(1);
  }
};

createSuperAdmin();