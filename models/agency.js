const mongoose = require('mongoose');

const agencySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String, required: true, match: /^[0-9]{10}$/ },
    license_number: { type: String, required: true, unique: true },
    address: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipcode: { type: String, required: true }
    },
    description: { type: String, maxlength: 1000 },
    website: { type: String },
    logo: { type: String, default: '' },
    services_offered: [{ type: String }],
    coverage_areas: [{ type: String }],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    total_reviews: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive', 'pending_verification'], default: 'pending_verification' },
    is_verified: { type: Boolean, default: false },
    subscription_plan: { type: String, enum: ['basic', 'premium', 'enterprise'], default: 'basic' },
    commission_rate: { type: Number, default: 0.15, min: 0, max: 1 }
}, { timestamps: true });

const Agency = mongoose.model('Agency', agencySchema);
module.exports = Agency;