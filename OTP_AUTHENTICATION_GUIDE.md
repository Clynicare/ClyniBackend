# OTP-Based Email Authentication System for Clynicare

## Overview
This implementation adds OTP (One-Time Password) based email authentication for user signup, agency registration, and doctor registration in the Clynicare backend system.

## Features Added

### 1. Email Service (`services/emailService.js`)
- **OTP Generation**: 6-digit random OTP generation
- **Email Templates**: Professional HTML email templates for:
  - User registration verification
  - Agency registration verification  
  - Doctor registration verification
  - Welcome emails after successful registration
- **Email Provider**: Uses nodemailer with Gmail service
- **Error Handling**: Comprehensive error handling for email delivery

### 2. OTP Model (`models/otp.js`)
- **Temporary Storage**: Stores OTP data with 10-minute expiration
- **User Types**: Supports 'user', 'agency', and 'doctor' registration types
- **Attempt Tracking**: Limits to 3 OTP verification attempts
- **Auto Cleanup**: Automatic document expiration and cleanup

### 3. Updated Models
- **User Model**: Added `email_verified` field
- **Agency Model**: Added `email_verified` field
- **Doctor Model**: Added `password` and `email_verified` fields

## API Endpoints

### User Registration
1. **Send OTP**: `POST /api/user/send-otp`
   - Body: `{ name, email, password, phone }`
   - Validates input and sends OTP email
   
2. **Verify OTP**: `POST /api/user/verify-otp`
   - Body: `{ email, otp }`
   - Creates user account upon successful verification
   
3. **Resend OTP**: `POST /api/user/resend-otp`
   - Body: `{ email }`
   - Sends new OTP for pending registration

### Agency Registration
1. **Send OTP**: `POST /api/agency/send-otp`
   - Body: `{ name, email, password, phone, license_number, address, description, services_offered, coverage_areas, website }`
   - Validates agency data and sends OTP email
   
2. **Verify OTP**: `POST /api/agency/verify-otp`
   - Body: `{ email, otp }`
   - Creates agency account with pending verification status
   
3. **Resend OTP**: `POST /api/agency/resend-otp`
   - Body: `{ email }`
   - Sends new OTP for pending agency registration

### Doctor Registration
1. **Send OTP**: `POST /api/doctor/send-otp`
   - Body: `{ name, email, phone, medical_license, specialization, sub_specializations, experience_years, consultation_fee, education, availability, bio, languages }`
   - Validates doctor data and sends OTP email
   
2. **Verify OTP**: `POST /api/doctor/verify-otp`
   - Body: `{ email, otp }`
   - Creates doctor account with pending verification status
   
3. **Resend OTP**: `POST /api/doctor/resend-otp`
   - Body: `{ email }`
   - Sends new OTP for pending doctor registration

4. **Set Password**: `POST /api/doctor/set-password`
   - Body: `{ email, password, confirmPassword }`
   - Allows doctors to set password after email verification

## Security Features

### OTP Security
- **6-digit random OTP**: Cryptographically secure random generation
- **10-minute expiration**: OTPs automatically expire after 10 minutes
- **3-attempt limit**: Maximum 3 verification attempts per OTP
- **Rate limiting**: Prevents spam by requiring new OTP after failed attempts

### Data Validation
- **Email format validation**: RFC-compliant email validation
- **Phone number validation**: 10-digit Indian phone number format
- **Password strength**: Minimum 6 characters
- **Required field validation**: Comprehensive input validation

### Email Security
- **Masked email responses**: Email addresses are partially masked in API responses
- **Professional templates**: HTML email templates with proper branding
- **Delivery confirmation**: Email service returns delivery status

## Environment Variables Required

Add these to your `.env` file:

```env
# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_SERVICE=gmail
```

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install nodemailer
   ```

2. **Configure Email**:
   - Create a Gmail app password
   - Update `.env` file with email credentials

3. **Database**:
   - MongoDB will automatically create the OTP collection
   - Existing user/agency/doctor collections will be updated with new fields

## Usage Flow

### For Users:
1. User submits registration form
2. Frontend calls `/api/user/send-otp`
3. User receives OTP email
4. User enters OTP in verification form
5. Frontend calls `/api/user/verify-otp`
6. User account is created and welcome email sent

### For Agencies:
1. Agency submits registration form
2. Frontend calls `/api/agency/send-otp`
3. Agency receives OTP email
4. Agency enters OTP in verification form
5. Frontend calls `/api/agency/verify-otp`
6. Agency account created with pending verification status
7. Admin approval required for activation

### For Doctors:
1. Doctor submits registration form
2. Frontend calls `/api/doctor/send-otp`
3. Doctor receives OTP email
4. Doctor enters OTP in verification form
5. Frontend calls `/api/doctor/verify-otp`
6. Doctor account created with pending verification status
7. Doctor can set password using `/api/doctor/set-password`
8. Admin approval required for activation

## Error Handling

- **Invalid OTP**: Returns attempt count and error message
- **Expired OTP**: Automatically cleaned up, requires new OTP request
- **Email delivery failure**: Returns specific error details
- **Duplicate registration**: Prevents duplicate accounts
- **Validation errors**: Comprehensive field validation with specific error messages

## Benefits

1. **Enhanced Security**: Email verification prevents fake registrations
2. **Professional Communication**: Branded email templates improve user experience
3. **Scalable Architecture**: Modular design supports multiple user types
4. **Rate Limiting**: Prevents spam and abuse
5. **Audit Trail**: Tracks registration attempts and verification status
6. **Flexible Integration**: Easy to extend for additional user types

## Testing

You can test the endpoints using tools like Postman or curl:

```bash
# Send OTP for user registration
curl -X POST http://localhost:7000/api/user/send-otp \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"password123","phone":"9876543210"}'

# Verify OTP
curl -X POST http://localhost:7000/api/user/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","otp":"123456"}'
```

This OTP-based authentication system provides a secure, professional, and user-friendly registration experience for all user types in the Clynicare platform.
