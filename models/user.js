const mongoose=require('mongoose')

const userschema=mongoose.Schema({
    name: { type: String,  trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, minlength: 6 },
    phone: { type: String,  match: /^[0-9]{10}$/ },
    googleId: { type: String },
    profile_image: { type: String }
}, { timestamps: true });

const user=mongoose.model('user',userschema)

module.exports=user;