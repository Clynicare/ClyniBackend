const mongoose=require('mongoose')
const bookingschema = new mongoose.Schema({
    service_id: { type: mongoose.Schema.Types.ObjectId, ref: "service", required: true },
    // user_id: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    user_name: { type: String,required:true},
    booking_date: { type: Date, required: true },
    booking_time: { type: String, required: true },
    address: { type: String, required: true },
    mobile_no: { type: String, required: true, match: /^[0-9]{10}$/ } 
}, { timestamps: true });
const booking=mongoose.model("Bookings", bookingschema)
module.exports=booking;