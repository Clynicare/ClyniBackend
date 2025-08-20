const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true, match: /^[0-9]{10}$/ },
    medical_license: { type: String, required: true, unique: true },
    specialization: { type: String, required: true },
    sub_specializations: [{ type: String }],
    experience_years: { type: Number, required: true, min: 0 },
    consultation_fee: { type: Number, required: true, min: 0 },
    education: [{ 
        degree: { type: String, required: true },
        institution: { type: String, required: true },
        year: { type: Number, required: true }
    }],
    availability: {
        days: [{ type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }],
        hours: {
            start: { type: String, required: true },
            end: { type: String, required: true }
        }
    },
    profile_image: { type: String, default: '' },
    bio: { type: String, maxlength: 1000 },
    languages: [{ type: String }],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    total_consultations: { type: Number, default: 0 },
    total_reviews: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive', 'busy'], default: 'active' },
    is_verified: { type: Boolean, default: false },
    video_call_enabled: { type: Boolean, default: true }
}, { timestamps: true });

const Doctor = mongoose.model('Doctor', doctorSchema);
module.exports = Doctor;