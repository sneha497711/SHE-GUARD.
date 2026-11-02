/**
 * server/controllers/authController.js — Authentication & OTP Controller
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { sendOtpSms } = require('../services/smsService');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured");
}
const JWT_EXPIRES_IN = '7d';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      mobileNumber: user.mobileNumber,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ── 1. SEND OTP ──────────────────────────────────────
async function sendOtp(req, res) {
  try {
    const { mobileNumber, checkExisting } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required.',
      });
    }

    const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
    if (cleanMobile.length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number.',
      });
    }

    // Optional check if mobile already registered for registration flow
    if (checkExisting) {
      const existingUser = await User.findByMobile(cleanMobile);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'This mobile number is already registered. Please log in.',
        });
      }
    }

    const otpData = await Otp.createOtp(cleanMobile);
    const smsResult = await sendOtpSms(cleanMobile, otpData.otpCode);

    return res.status(200).json({
      success: true,
      message: smsResult.message,
      cooldownSeconds: otpData.cooldownSeconds,
      expiresAt: otpData.expiresAt,
      mode: smsResult.mode,
      devOtp: smsResult.devOtp, // available only in dev mode for testing
    });
  } catch (error) {
    console.error('[Send OTP Error]:', error);
    const status = error.statusCode || 500;
    const isDev = process.env.NODE_ENV !== 'production';
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to send OTP. Please try again.',
      cooldownRemaining: error.cooldownRemaining,
      devOtp: isDev ? error.existingOtp : undefined,
    });
  }
}

// ── 2. VERIFY OTP ────────────────────────────────────
async function verifyOtp(req, res) {
  try {
    const { mobileNumber, otpCode } = req.body;

    if (!mobileNumber || !otpCode) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and 6-digit OTP are required.',
      });
    }

    const result = await Otp.verifyOtp(mobileNumber, otpCode);

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json({
      success: true,
      message: 'Mobile number verified successfully.',
    });
  } catch (error) {
    console.error('[Verify OTP Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Error verifying OTP.',
    });
  }
}

// ── 3. REGISTER USER ─────────────────────────────────
async function register(req, res) {
  try {
    const {
      fullName,
      email,
      mobileNumber,
      password,
      confirmPassword,
      age,
      address,
      city,
      state,
      pin,
      bloodGroup,
      medicalConditions,
      allergies,
      currentMedication,
      additionalMedicalInformation,
      emergencyContactName,
      emergencyContactNumber,
      emergencyContactRelationship,
      emergencyInformation,
    } = req.body;

    // Validation: Required fields
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    if (!mobileNumber || !mobileNumber.trim()) {
      return res.status(400).json({ success: false, message: 'Mobile number is required.' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required.' });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    // Mobile number validation
    const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
    if (cleanMobile.length !== 10) {
      return res.status(400).json({ success: false, message: 'Mobile number must be a valid 10-digit number.' });
    }

    // Password strength & match
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    // Mobile OTP Verification check
    const isVerified = await Otp.isMobileVerified(cleanMobile);
    if (!isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number has not been verified via OTP. Please verify your mobile number first.',
      });
    }

    // Check existing email
    const existingByEmail = await User.findByEmail(email);
    if (existingByEmail) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.',
      });
    }

    // Check existing mobile
    const existingByMobile = await User.findByMobile(cleanMobile);
    if (existingByMobile) {
      return res.status(400).json({
        success: false,
        message: 'An account with this mobile number already exists. Please log in.',
      });
    }

    // Hash password securely
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await User.create({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      mobileNumber: cleanMobile,
      passwordHash,
      mobileVerified: 1,
      age: age ? parseInt(age) : null,
      address: address ? address.trim() : '',
      city: city ? city.trim() : '',
      state: state ? state.trim() : '',
      pin: pin ? pin.trim() : '',
      bloodGroup: bloodGroup || 'Unknown',
      medicalConditions: medicalConditions || '',
      allergies: allergies || '',
      currentMedication: currentMedication || '',
      additionalMedicalInformation: additionalMedicalInformation || '',
      emergencyContactName: emergencyContactName || '',
      emergencyContactNumber: emergencyContactNumber || '',
      emergencyContactRelationship: emergencyContactRelationship || 'Family',
      emergencyInformation: emergencyInformation || '',
    });

    const token = generateToken(newUser);
    const safeUser = User.sanitize(newUser);

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Welcome to SHE-GUARD.',
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error('[Register Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Registration failed due to a server error. Please try again.',
    });
  }
}

// ── 4. LOGIN USER ────────────────────────────────────
async function login(req, res) {
  try {
    const { identifier, email, mobileNumber, password } = req.body;
    const loginTarget = identifier || email || mobileNumber;

    if (!loginTarget || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your Email/Mobile number and Password.',
      });
    }

    const user = await User.findByEmailOrMobile(loginTarget);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/mobile or password.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/mobile or password.',
      });
    }

    const token = generateToken(user);
    const safeUser = User.sanitize(user);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${safeUser.fullName}!`,
      token,
      user: safeUser,
    });
  } catch (error) {
    console.error('[Login Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed due to a server error.',
    });
  }
}

// ── 5. LOGOUT ────────────────────────────────────────
async function logout(req, res) {
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
}

// ── 6. GET CURRENT AUTHENTICATED USER ────────────────
async function getMe(req, res) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      });
    }

    return res.status(200).json({
      success: true,
      user: User.sanitize(user),
    });
  } catch (error) {
    console.error('[GetMe Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve profile.',
    });
  }
}

module.exports = {
  sendOtp,
  verifyOtp,
  register,
  login,
  logout,
  getMe,
};
