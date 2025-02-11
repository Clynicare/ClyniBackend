const mongoose=require('mongoose')

const userschema=mongoose.Schema({
    name: { type: String,  trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String,  match: /^[0-9]{10}$/ },
}, { timestamps: true });

const user=mongoose.model('user',userschema)

module.exports=user;