const mongoose = require('mongoose');

const nurseBookingSchema = new mongoose.Schema({
    patient_id: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    nurse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Nurse', required: true },
    doctor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    service_type: { 
        type: String, 
        enum: ['home_nursing', 'teleconsultation', 'hybrid'], 
        required: true 
    },
    patient_details: {
        name: { type: String, required: true },
        age: { type: Number, required: true },
        gender: { type: String, enum: ['male', 'female', 'other'], required: true },
        medical_history: { type: String },
        current_medications: { type: String },
        allergies: { type: String }
    },
    appointment_details: {
        date: { type: Date, required: true },
        time_slot: { type: String, required: true },
        duration: { type: Number, default: 60 }, // in minutes
        address: { type: String, required: true },
        special_instructions: { type: String }
    },
    consultation_details: {
        video_call_scheduled: { type: Boolean, default: false },
        video_call_link: { type: String },
        vital_signs: {
            blood_pressure: { type: String },
            heart_rate: { type: String },
            temperature: { type: String },
            oxygen_saturation: { type: String },
            blood_sugar: { type: String }
        },
        symptoms: { type: String },
        diagnosis: { type: String },
        treatment_plan: { type: String },
        prescriptions: [{ 
            medication: { type: String },
            dosage: { type: String },
            frequency: { type: String },
            duration: { type: String }
        }]
    },
    pricing: {
        nurse_fee: { type: Number, required: true },
        doctor_fee: { type: Number, default: 0 },
        platform_fee: { type: Number, required: true },
        total_amount: { type: Number, required: true }
    },
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'], 
        default: 'pending' 
    },
    rejection_reason: { type: String },
    confirmed_at: { type: Date },
    cancelled_at: { type: Date },
    payment_status: { 
        type: String, 
        enum: ['pending', 'paid', 'refunded'], 
        default: 'pending' 
    },
    rating: {
        nurse_rating: { type: Number, min: 1, max: 5 },
        doctor_rating: { type: Number, min: 1, max: 5 },
        review: { type: String }
    }
}, { timestamps: true });

const NurseBooking = mongoose.model('NurseBooking', nurseBookingSchema);
module.exports = NurseBooking;