const mongoose =require('mongoose');

    // Add your schema here
    const serviceschema = new mongoose.Schema({
        service_name: { type: String, required: true},
        service_description: { type: String, required: true },
        service_price: { type: Number, required: true, min: 0 },
        service_category: { type: String, required: true}, 
        service_image: { type: String, required: true }
    }, { timestamps: true });
    const service= mongoose.model('service', serviceschema)
    module.exports= service;
