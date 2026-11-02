const crypto = require('crypto');
const { run, get, all } = require('../config/db');

const OTP_EXPIRY_MS = (parseInt(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000;
const OTP_COOLDOWN_MS = (parseInt(process.env.OTP_COOLDOWN_SECONDS) || 60) * 1000;
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS) || 5;

class Otp {
  static cleanMobile(mobileNumber) {
    if (!mobileNumber) return '';
    return mobileNumber.replace(/\D/g, '').slice(-10);
  }

  static generateCode() {
    // 6-digit cryptographic numeric OTP
    return crypto.randomInt(100000, 999999).toString();
  }

  static async createOtp(mobileNumber) {
    const cleanNumber = this.cleanMobile(mobileNumber);
    if (!cleanNumber || cleanNumber.length !== 10) {
      throw new Error('Please enter a valid 10-digit mobile number.');
    }

    const now = Date.now();

    // Check cooldown from latest OTP request
    const latest = await get(
      'SELECT * FROM otps WHERE mobileNumber = ? ORDER BY createdAt DESC LIMIT 1',
      [cleanNumber]
    );

    if (latest && now - latest.createdAt < OTP_COOLDOWN_MS) {
      const waitSec = Math.ceil((OTP_COOLDOWN_MS - (now - latest.createdAt)) / 1000);
      const error = new Error(`Please wait ${waitSec} seconds before requesting a new OTP.`);
      error.statusCode = 429;
      error.cooldownRemaining = waitSec;
      error.existingOtp = latest.otpCode;
      throw error;
    }

    const otpCode = this.generateCode();
    const expiresAt = now + OTP_EXPIRY_MS;

    const result = await run(
      `INSERT INTO otps (mobileNumber, otpCode, expiresAt, attempts, maxAttempts, verified, createdAt)
       VALUES (?, ?, ?, 0, ?, 0, ?)`,
      [cleanNumber, otpCode, expiresAt, OTP_MAX_ATTEMPTS, now]
    );

    return {
      id: result.lastID,
      mobileNumber: cleanNumber,
      otpCode,
      expiresAt,
      cooldownSeconds: Math.ceil(OTP_COOLDOWN_MS / 1000),
    };
  }

  static async verifyOtp(mobileNumber, enteredCode) {
    const cleanNumber = this.cleanMobile(mobileNumber);
    if (!cleanNumber || cleanNumber.length !== 10) {
      return { success: false, message: 'Invalid mobile number.' };
    }

    if (!enteredCode || enteredCode.trim().length !== 6) {
      return { success: false, message: 'Please enter a valid 6-digit OTP.' };
    }

    const now = Date.now();
    const record = await get(
      'SELECT * FROM otps WHERE mobileNumber = ? ORDER BY createdAt DESC LIMIT 1',
      [cleanNumber]
    );

    if (!record) {
      return { success: false, message: 'No OTP was requested for this mobile number.' };
    }

    if (record.verified === 1) {
      return { success: true, message: 'Mobile number is already verified.' };
    }

    if (now > record.expiresAt) {
      return { success: false, message: 'This OTP has expired. Please request a new one.' };
    }

    if (record.attempts >= record.maxAttempts) {
      return {
        success: false,
        message: 'Maximum verification attempts exceeded. Please request a new OTP.',
      };
    }

    // Increment attempt count
    await run('UPDATE otps SET attempts = attempts + 1 WHERE id = ?', [record.id]);

    if (record.otpCode.trim() !== enteredCode.trim()) {
      const remaining = record.maxAttempts - (record.attempts + 1);
      return {
        success: false,
        message: `Incorrect OTP code. ${remaining > 0 ? `${remaining} attempts remaining.` : 'Please request a new OTP.'}`,
      };
    }

    // Mark verified
    await run('UPDATE otps SET verified = 1 WHERE id = ?', [record.id]);
    return { success: true, message: 'OTP verified successfully.' };
  }

  static async isMobileVerified(mobileNumber) {
    const cleanNumber = this.cleanMobile(mobileNumber);
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    const record = await get(
      'SELECT * FROM otps WHERE mobileNumber = ? AND verified = 1 AND createdAt > ? ORDER BY createdAt DESC LIMIT 1',
      [cleanNumber, thirtyMinAgo]
    );
    return !!record;
  }
}

module.exports = Otp;
