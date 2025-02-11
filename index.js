const express = require('express');
const app=express()
const cors=require('cors')
const mongoose =require('mongoose')
const port=7000
const MONGO_URL="mongodb+srv://syedakousar222:youjv72XqW9Inn8n@amreen.j1fof.mongodb.net/"

app.use(express.json())
app.use(express.urlencoded({ extended: true }));
app.use(cors())
const service =require('./models/service')
const booking=require('./models/booking');
const user=require('./models/user')
if(mongoose.connect(MONGO_URL)){
    console.log("MongoDB Connected");
}
app.post('/api/login',async(req,res)=>{
    const{email,password} = req.body;
    const user=await user.findOne({email:email,password:password})
     if(user){
         res.send("login successful")
     }else{
         res.send("login failed")
     }
})
app.post('/api/user',async (req,res)=>{
    const {name,email,password,phone,}=req.body;
    const newuser=await user.create({name:name,email:email,password:password,phone:phone})
    newuser.save()
    console.log("the user is been saved")
    res.send("the user has been sucessfully created")
})
app.get('/api/services', async function(req, res){
const servicess=await service.find({})
res.send(servicess)
 
})

app.post('/api/services',async  function(req, res){
    const body=req.body;
    console.log(body)
    console.log("this is body of post request")
    const service_name=body.service_name
    const service_description=body.service_description
    const service_price= body.service_price
    const service_category=body.service_category
    const service_image= body.service_image
    const serve=await service.create({service_name, service_description, service_price, service_category, service_image})
    serve.save()
    res.send("service created successfully")
})

app.post('/api/bookings',async (req,res)=>{
    const body=req.body;
    console.log(body)
    console.log("this is body of post request")
    const {service_id,user_name,booking_date,booking_time,address,mobile_no}=body
    //should add the user id for real
    
    const book=await booking.create({
        service_id:service_id,
        //// user_id:user_id,
        user_name:user_name,
        booking_date:booking_date,
        booking_time:booking_time,
        address:address,
        mobile_no:mobile_no,

    })
    book.save()
    res.send("the booking is sucessfully saved")


})

app.get('/api/bookings/:id',async (req,res)=>{
    const user_id=req.params.id;
    if(user_id){
        const result=await booking.find({user_id:user_id})
    console.log(result)
    res.send(result)
    }else{
        console.log("the user is not found")
    }
})

app.listen(port,(req,res)=>{
 console.log(`listening on port ${port}`);
})