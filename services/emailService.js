const nodemailer = require('nodemailer');

// Create email transporter
const createEmailTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email for user registration
const sendUserRegistrationOTP = async (email, name, otp) => {
  try {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Clynicare - Verify Your Email for Registration',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0;">🏥 CLYNICARE</h1>
              <p style="color: #666; margin: 5px 0;">Quality Healthcare at Your Doorstep</p>
            </div>
            
            <h2 style="color: #333; margin-bottom: 20px;">Welcome to Clynicare, ${name}!</h2>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 25px;">
              Thank you for choosing Clynicare for your healthcare needs. To complete your registration, 
              please verify your email address using the OTP below:
            </p>
            
            <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 10px 0;">Verification Code</h3>
              <div style="font-size: 32px; font-weight: bold; color: #1e40af; letter-spacing: 5px; font-family: monospace;">
                ${otp}
              </div>
              <p style="color: #666; margin: 10px 0 0 0; font-size: 14px;">This code will expire in 10 minutes</p>
            </div>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
              If you didn't request this registration, please ignore this email.
            </p>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                Need help? Contact us at <a href="tel:+918088058792" style="color: #2563eb;">+91 8088058792</a>
              </p>
              <p style="color: #666; font-size: 12px; margin: 10px 0 0 0;">
                © 2024 Clynicare. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

// Send OTP email for agency registration
const sendAgencyRegistrationOTP = async (email, name, otp) => {
  try {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Clynicare - Agency Registration Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #059669; margin: 0;">🏥 CLYNICARE</h1>
              <p style="color: #666; margin: 5px 0;">Healthcare Agency Partnership</p>
            </div>
            
            <h2 style="color: #333; margin-bottom: 20px;">Welcome to Clynicare, ${name}!</h2>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 25px;">
              Thank you for applying to become a healthcare agency partner with Clynicare. 
              To complete your agency registration, please verify your email address using the OTP below:
            </p>
            
            <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
              <h3 style="color: #059669; margin: 0 0 10px 0;">Agency Verification Code</h3>
              <div style="font-size: 32px; font-weight: bold; color: #047857; letter-spacing: 5px; font-family: monospace;">
                ${otp}
              </div>
              <p style="color: #666; margin: 10px 0 0 0; font-size: 14px;">This code will expire in 10 minutes</p>
            </div>
            
            <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <p style="color: #92400e; margin: 0; font-size: 14px;">
                <strong>Next Steps:</strong> After email verification, our team will review your agency 
                credentials and license information. You'll receive approval notification within 24-48 hours.
              </p>
            </div>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
              If you didn't request this registration, please ignore this email.
            </p>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                Agency Support: <a href="tel:+918088058792" style="color: #059669;">+91 8088058792</a>
              </p>
              <p style="color: #666; font-size: 12px; margin: 10px 0 0 0;">
                © 2024 Clynicare. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

// Send OTP email for doctor registration
const sendDoctorRegistrationOTP = async (email, name, otp) => {
  try {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Clynicare - Doctor Registration Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #7c3aed; margin: 0;">🏥 CLYNICARE</h1>
              <p style="color: #666; margin: 5px 0;">Doctor Network Partnership</p>
            </div>
            
            <h2 style="color: #333; margin-bottom: 20px;">Welcome Dr. ${name}!</h2>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 25px;">
              Thank you for joining the Clynicare medical network. We're excited to have you provide 
              teleconsultation services to our patients. Please verify your email address using the OTP below:
            </p>
            
            <div style="background-color: #faf5ff; padding: 20px; border-radius: 8px; text-align: center; margin: 25px 0;">
              <h3 style="color: #7c3aed; margin: 0 0 10px 0;">Doctor Verification Code</h3>
              <div style="font-size: 32px; font-weight: bold; color: #6d28d9; letter-spacing: 5px; font-family: monospace;">
                ${otp}
              </div>
              <p style="color: #666; margin: 10px 0 0 0; font-size: 14px;">This code will expire in 10 minutes</p>
            </div>
            
            <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
              <p style="color: #1e40af; margin: 0; font-size: 14px;">
                <strong>Next Steps:</strong> After email verification, our medical team will review your 
                credentials and medical license. You'll receive approval notification within 24-48 hours.
              </p>
            </div>
            
            <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #0369a1; margin: 0 0 10px 0;">What to expect:</h4>
              <ul style="color: #555; margin: 0; padding-left: 20px;">
                <li>Access to teleconsultation platform</li>
                <li>Patient referrals from our nurse network</li>
                <li>Flexible scheduling and availability management</li>
                <li>Competitive consultation fees</li>
              </ul>
            </div>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
              If you didn't request this registration, please ignore this email.
            </p>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                Doctor Support: <a href="tel:+918088058792" style="color: #7c3aed;">+91 8088058792</a>
              </p>
              <p style="color: #666; font-size: 12px; margin: 10px 0 0 0;">
                © 2024 Clynicare. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

// Send welcome email after successful registration
const sendWelcomeEmail = async (email, name, userType = 'user') => {
  try {
    const transporter = createEmailTransporter();
    
    let subject, content;
    
    if (userType === 'agency') {
      subject = 'Welcome to Clynicare Agency Network!';
      content = `
        <h2>Welcome ${name}!</h2>
        <p>Your agency has been successfully registered with Clynicare. You can now:</p>
        <ul>
          <li>Manage your nurse network</li>
          <li>Receive booking requests</li>
          <li>Track service completion</li>
          <li>Monitor earnings and commissions</li>
        </ul>
      `;
    } else if (userType === 'doctor') {
      subject = 'Welcome to Clynicare Medical Network!';
      content = `
        <h2>Welcome Dr. ${name}!</h2>
        <p>Your doctor profile has been successfully registered with Clynicare. You can now:</p>
        <ul>
          <li>Receive teleconsultation requests</li>
          <li>Set your availability and consultation fees</li>
          <li>Collaborate with our nurse network</li>
          <li>Manage your patient consultations</li>
        </ul>
      `;
    } else {
      subject = 'Welcome to Clynicare!';
      content = `
        <h2>Welcome ${name}!</h2>
        <p>Your account has been successfully created with Clynicare. You can now:</p>
        <ul>
          <li>Book healthcare services</li>
          <li>Track your appointments</li>
          <li>Access medical records</li>
          <li>Connect with healthcare professionals</li>
        </ul>
      `;
    }
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0;">🏥 CLYNICARE</h1>
              <p style="color: #666; margin: 5px 0;">Quality Healthcare at Your Doorstep</p>
            </div>
            
            ${content}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://clynicare.com" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold;">
                Access Your Dashboard
              </a>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 14px; margin: 0;">
                Need help? Contact us at <a href="tel:+918088058792" style="color: #2563eb;">+91 8088058792</a>
              </p>
              <p style="color: #666; font-size: 12px; margin: 10px 0 0 0;">
                © 2024 Clynicare. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateOTP,
  sendUserRegistrationOTP,
  sendAgencyRegistrationOTP,
  sendDoctorRegistrationOTP,
  sendWelcomeEmail
};
