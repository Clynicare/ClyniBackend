const mongoose = require('mongoose');

const nurseSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true, match: /^[0-9]{10}$/ },
    license_number: { type: String, required: true, unique: true },
    specializations: [{ type: String, required: true }],
    experience_years: { type: Number, required: true, min: 0 },
    hourly_rate: { type: Number, required: true, min: 0 },
    availability: {
        days: [{ type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }],
        hours: {
            start: { type: String, required: true },
            end: { type: String, required: true }
        }
    },
    location: {
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipcode: { type: String, required: true },
        coordinates: {
            lat: { type: Number },
            lng: { type: Number }
        }
    },
    profile_image: { type: String, default: '' },
    bio: { type: String, maxlength: 500 },
    certifications: [{ type: String }],
    languages: [{ type: String }],
    rating: { type: Number, default: 0, min: 0, max: 5 },
    total_reviews: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
    agency_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
    is_verified: { type: Boolean, default: false },
    password: { type: String }
}, { timestamps: true });

const Nurse = mongoose.model('Nurse', nurseSchema);
module.exports = Nurse;