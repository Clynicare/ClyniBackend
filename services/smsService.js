const client = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);


// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const apiKeySid = process.env.TWILIO_API_KEY_SID;
const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client

if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else if (apiKeySid && apiKeySecret && accountSid) {
  client = twilio(apiKeySid, apiKeySecret, { accountSid });
} else {
  console.warn('Twilio credentials not configured. SMS service disabled.');
  client = null;
}

const sendBookingRequestSMS = async (phoneNumber, bookingDetails) => {
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }
  
  try {
    const message = `🏥 CLYNICARE Booking Request Received!
    
📅 Date: ${bookingDetails.date}
⏰ Time: ${bookingDetails.time}
👩⚕️ Service: ${bookingDetails.service}
💰 Amount: ₹${bookingDetails.amount}

Your request has been sent to our nurse.
We'll notify you once confirmed.

For queries: +91 8088058792

Thank you for choosing Clynicare! 💙`;

    const formattedPhone = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;

    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: formattedPhone
    });

    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const sendNurseBookingNotificationSMS = async (phoneNumber, bookingDetails) => {
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }
  
  try {
    const message = `🏥 NEW BOOKING REQUEST - CLYNICARE

👤 Patient: ${bookingDetails.patientName}
📅 Date: ${bookingDetails.date}
⏰ Time: ${bookingDetails.time}
📍 Address: ${bookingDetails.address}
💰 Amount: ₹${bookingDetails.amount}

Please accept/reject in your dashboard.
Login: clynicare.com/NurseLogin

Contact: +91 8088058792`;

    const formattedPhone = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;

    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: formattedPhone
    });

    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const sendBookingStatusSMS = async (phoneNumber, status, bookingDetails) => {
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }
  
  try {
    let message = '';
    
    if (status === 'confirmed') {
      message = `✅ Your Clynicare booking is CONFIRMED!
      
📅 ${bookingDetails.date} at ${bookingDetails.time}
👩⚕️ ${bookingDetails.nurseName} will visit you
📍 ${bookingDetails.address}

Prepare any medical reports. We'll call before arrival.
Contact: +91 8088058792`;
    } else if (status === 'cancelled') {
      message = `❌ Your Clynicare booking has been cancelled.
      
Booking ID: ${bookingDetails.bookingId}
Reason: ${bookingDetails.reason || 'Nurse unavailable'}

Please book again or call +91 8088058792 for assistance.`;
    } else if (status === 'completed') {
      message = `✅ Your Clynicare service has been COMPLETED!
      
📅 ${bookingDetails.date} at ${bookingDetails.time}
👩⚕️ Service by: ${bookingDetails.nurseName}
💰 Amount: ₹${bookingDetails.amount}

Thank you for choosing Clynicare! 💙
Rate your experience: clynicare.com
Contact: +91 8088058792`;
    }

    if (!message) {
      return { success: false, error: 'Invalid status for SMS' };
    }

    const formattedPhone = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;

    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: formattedPhone
    });

    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const sendServiceCompletionSMS = async (phoneNumber, bookingDetails) => {
  return await sendBookingStatusSMS(phoneNumber, 'completed', bookingDetails);
};

const sendNurseHandoffSMS = async (phoneNumber, bookingDetails) => {
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }
  
  try {
    const message = `🏥 TELECONSULTANCY UPDATE - CLYNICARE

✅ Nurse assessment completed!
👩⚕️ ${bookingDetails.nurseName} has finished initial care

🔄 HANDOFF TO DOCTOR:
👨⚕️ Dr. ${bookingDetails.doctorName} will now join
📱 Video call starting in 2 minutes
💊 Specialization: ${bookingDetails.doctorSpecialization}

Please stay ready for video consultation.
Contact: +91 8088058792`;

    const formattedPhone = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;

    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: formattedPhone
    });

    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const sendDoctorJoinSMS = async (phoneNumber, bookingDetails) => {
  if (!client) {
    return { success: false, error: 'SMS service not configured' };
  }
  
  try {
    const message = `👨⚕️ DOCTOR CONSULTATION STARTED - CLYNICARE

🎥 Dr. ${bookingDetails.doctorName} is now ONLINE
💊 ${bookingDetails.doctorSpecialization} Specialist

📋 Nurse Report Summary:
• Vital signs recorded by ${bookingDetails.nurseName}
• Initial assessment completed
• Ready for doctor consultation

🔗 Join video call now!
Consultation fee: ₹${bookingDetails.consultationFee}

Contact: +91 8088058792`;

    const formattedPhone = phoneNumber.startsWith('+91') ? phoneNumber : `+91${phoneNumber}`;

    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: formattedPhone
    });

    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendBookingRequestSMS,
  sendNurseBookingNotificationSMS,
  sendBookingStatusSMS,
  sendServiceCompletionSMS,
  sendNurseHandoffSMS,
  sendDoctorJoinSMS
};