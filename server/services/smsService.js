/**
 * server/services/smsService.js — Fast2SMS & Development Alert Dispatcher
 */

const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';

/**
 * Send OTP verification SMS
 */
async function sendOtpSms(mobileNumber, otpCode) {
  const cleanNumber = mobileNumber.replace(/\D/g, '').slice(-10);
  const isDev = process.env.NODE_ENV !== 'production';
  const apiKey = process.env.FAST2SMS_KEY;

  console.log(`\n========================================`);
  console.log(`[SHE-GUARD OTP DISPATCH]`);
  console.log(`Mobile: +91 ${cleanNumber}`);
  console.log(`OTP Code: ${otpCode}`);
  console.log(`Expires in: 10 minutes`);
  console.log(`========================================\n`);

  if (!apiKey || apiKey.includes('your_fast2sms') || apiKey.trim() === '') {
    return {
      sent: true,
      mode: 'dev_simulator',
      message: 'OTP generated (Development Mode: check backend console or preview indicator)',
      devOtp: isDev ? otpCode : undefined,
    };
  }

  try {
    const response = await fetch(FAST2SMS_URL, {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'otp',
        variables_values: otpCode,
        numbers: cleanNumber,
      }),
    });

    const data = await response.json();

    if (data.return === true) {
      console.log(`[SMS Service] Fast2SMS dispatched successfully to +91 ${cleanNumber}`);
      return {
        sent: true,
        mode: 'sms_gateway',
        message: `OTP sent via SMS to +91 ${cleanNumber}`,
        devOtp: isDev ? otpCode : undefined,
      };
    } else {
      console.warn(`[SMS Service] Fast2SMS returned error:`, data.message || data);
      return {
        sent: true,
        mode: 'dev_fallback',
        message: 'SMS provider unavailable — OTP logged to developer console',
        devOtp: isDev ? otpCode : undefined,
      };
    }
  } catch (err) {
    console.error(`[SMS Service] Network error during SMS dispatch:`, err.message);
    return {
      sent: true,
      mode: 'dev_fallback',
      message: 'Network issue contacting SMS gateway — OTP logged to developer console',
      devOtp: isDev ? otpCode : undefined,
    };
  }
}

/**
 * Send Emergency SOS Alert SMS to contact numbers
 */
async function sendSosAlertSms(phoneNumbers, userName, lat, lng) {
  if (!phoneNumbers || phoneNumbers.length === 0) {
    return { sent: false, message: 'No emergency contacts provided' };
  }

  const cleanNumbers = phoneNumbers
    .map(p => String(p).replace(/\D/g, '').slice(-10))
    .filter(p => p.length === 10);

  if (cleanNumbers.length === 0) {
    return { sent: false, message: 'No valid phone numbers found' };
  }

  const numbersString = cleanNumbers.join(',');
  const mapsLink = (lat && lng) ? `https://maps.google.com/?q=${lat},${lng}` : 'Location unavailable';
  const alertMessage = `🚨 SHE-GUARD EMERGENCY ALERT! ${userName} has activated an SOS. Current Location: ${mapsLink} — Please call immediately or contact Police (112).`;

  console.log(`\n========================================`);
  console.log(`🚨 [SHE-GUARD SOS SMS DISPATCH]`);
  console.log(`User: ${userName}`);
  console.log(`Recipients: ${numbersString}`);
  console.log(`Location: ${mapsLink}`);
  console.log(`Message: ${alertMessage}`);
  console.log(`========================================\n`);

  const apiKey = process.env.FAST2SMS_KEY;

  if (!apiKey || apiKey.includes('your_fast2sms') || apiKey.trim() === '') {
    return {
      sent: true,
      mode: 'dev_simulator',
      message: `Emergency SMS dispatched to ${cleanNumbers.length} contacts (Dev mode: logged to console)`,
      recipients: cleanNumbers,
    };
  }

  try {
    const response = await fetch(FAST2SMS_URL, {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        route: 'q',
        message: alertMessage,
        language: 'english',
        flash: 0,
        numbers: numbersString,
      }),
    });

    const data = await response.json();

    if (data.return === true) {
      console.log(`[SMS Service] SOS SMS sent via Fast2SMS to: ${numbersString}`);
      return {
        sent: true,
        mode: 'sms_gateway',
        message: `Emergency SMS sent to ${cleanNumbers.length} contacts`,
        recipients: cleanNumbers,
      };
    } else {
      console.warn(`[SMS Service] Fast2SMS error:`, data.message || data);
      return {
        sent: false,
        mode: 'sms_gateway_error',
        message: `SMS gateway error: ${JSON.stringify(data.message || data)}`,
      };
    }
  } catch (err) {
    console.error(`[SMS Service] SOS SMS network error:`, err.message);
    return {
      sent: false,
      mode: 'network_error',
      message: `SMS dispatch failed: ${err.message}`,
    };
  }
}

module.exports = {
  sendOtpSms,
  sendSosAlertSms,
};
