const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['super_admin', 'admin'], default: 'admin' },
    permissions: [{
        type: String,
        enum: ['manage_agencies', 'manage_users', 'manage_bookings', 'view_analytics']
    }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    last_login: { type: Date },
    profile_image: { type: String, default: '' }
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);
module.exports = Admin;