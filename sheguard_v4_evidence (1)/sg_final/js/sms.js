/**
 * js/sms.js — Fast2SMS Alert Module (CORS-fixed)
 */


// ── CORS proxy wraps the Fast2SMS URL so the browser doesn't get blocked ──
const CORS_PROXY   = 'https://corsproxy.io/?';
const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';

async function sgSendSMS(phoneNumbers, message) {
  if (!phoneNumbers || phoneNumbers.length === 0) {
    sgLog('No phone numbers to send SMS to.', 'warning');
    return false;
  }

  // Extract .phone if items are contact objects, otherwise use as-is
  const numbers = phoneNumbers
    .map(n => (typeof n === 'object' && n !== null) ? (n.phone || '') : String(n))
    .map(n => n.replace(/\D/g, ''))
    .map(n => n.length === 12 && n.startsWith('91') ? n.slice(2) : n)
    .map(n => n.length === 11 && n.startsWith('0')  ? n.slice(1) : n)
    .filter(n => n.length === 10)
    .join(',');

  if (!numbers) {
    sgLog('No valid Indian phone numbers found for Fast2SMS.', 'error');
    return false;
  }

  sgLog(`Sending SMS to: ${numbers}`, 'info');

  const targetUrl = CORS_PROXY + encodeURIComponent(FAST2SMS_URL);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'authorization':    SG_FAST2SMS_KEY,
        'Content-Type':     'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        route:    'q',
        message:  message,
        language: 'english',
        flash:    0,
        numbers:  numbers,
      }),
    });

    const result = await response.json();

    if (result.return === true) {
      sgLog(`SMS sent successfully to ${numbers}.`, 'success');
      return true;
    } else {
      sgLog(`Fast2SMS error: ${JSON.stringify(result.message || result)}`, 'error');
      return false;
    }

  } catch (err) {
    sgLog(`SMS network error: ${err.message}`, 'error');
    return false;
  }
}

// ── Send emergency SMS to all contacts ───────────────
async function sgSendEmergencySMS(contacts, userName, lat, lng) {
  const mapsLink = sgMapsLink(lat, lng);
  const message  = `🚨 EMERGENCY ALERT! ${userName} needs help. Live location: ${mapsLink} — Please call immediately or contact authorities (100).`;

  const sent = await sgSendSMS(contacts, message);

  document.querySelectorAll('.sending-badge').forEach(b => {
    b.innerHTML = sent
      ? '<i class="fas fa-check"></i> SMS Sent'
      : '<i class="fas fa-exclamation"></i> SMS Failed';
    b.classList.toggle('done', sent);
  });

  const alertMsg = document.getElementById('sosAlertMsg');
  if (alertMsg) {
    alertMsg.textContent = sent
      ? '✅ Emergency SMS sent to all contacts.'
      : '⚠️ SMS failed — please call contacts manually.';
  }

  return sent;
}