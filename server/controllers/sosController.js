/**
 * server/controllers/sosController.js — Smart SOS Lifecycle Controller
 */

const SOSIncident = require('../models/SOSIncident');
const EmergencyContact = require('../models/EmergencyContact');
const User = require('../models/User');
const { sendSosAlertSms } = require('../services/smsService');

// ── 1. TRIGGER CENTRAL SOS ─────────────────────────────
async function triggerSOS(req, res) {
  try {
    const {
      triggerSource = 'button',
      latitude,
      longitude,
      accuracy,
      notes,
    } = req.body;

    const userId = req.userId;

    // Get User Details
    const user = await User.findById(userId);
    const userName = user ? user.fullName : 'SHE-GUARD User';

    // Fetch Emergency Contacts sorted by Priority
    const contacts = await EmergencyContact.findByUserId(userId);
    const contactPhones = contacts.map(c => c.phoneNumber).filter(Boolean);
    const primaryContact = contacts.length > 0 ? contacts[0] : null;

    let smsStatus = 'NO_CONTACTS';
    let smsDetails = null;

    // Dispatch SMS to all configured contacts
    if (contactPhones.length > 0) {
      smsDetails = await sendSosAlertSms(contactPhones, userName, latitude, longitude);
      smsStatus = smsDetails.sent ? 'SENT' : 'FAILED';
    }

    const callStatus = primaryContact ? 'READY' : 'NO_PRIMARY_CONTACT';
    const pushNotificationStatus = 'DISPATCHED';
    const liveLocationStatus = (latitude && longitude) ? 'ACTIVE' : 'NO_GPS';

    // Resolve any previous active incidents to prevent orphaned states
    await SOSIncident.resolveActive(userId, 'Auto-resolved by new SOS trigger');

    // Create Incident Record in Database
    const incident = await SOSIncident.create({
      userId,
      triggerSource,
      latitude,
      longitude,
      accuracy,
      smsStatus,
      callStatus,
      pushNotificationStatus,
      liveLocationStatus,
      notes: notes || `Triggered via ${triggerSource}`,
    });

    console.log(`[SOS Controller] Active Incident #${incident.id} registered for User #${userId} (${triggerSource})`);

    return res.status(201).json({
      success: true,
      message: '🚨 SOS Emergency Alert Activated!',
      incident,
      primaryContact: primaryContact ? {
        id: primaryContact.id,
        name: primaryContact.name,
        phoneNumber: primaryContact.phoneNumber,
        relationship: primaryContact.relationship,
        callLink: `tel:${primaryContact.phoneNumber}`,
      } : null,
      contactsNotified: contactPhones.length,
      smsResult: smsDetails,
    });
  } catch (error) {
    console.error('[Trigger SOS Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate SOS alert. Please dial emergency services directly (112).',
      error: error.message,
    });
  }
}

// ── 2. GET SOS STATUS (ACTIVE INCIDENT) ─────────────────
async function getSOSStatus(req, res) {
  try {
    const userId = req.userId;
    const incident = await SOSIncident.getActiveIncident(userId);

    let primaryContact = null;
    if (incident) {
      const contacts = await EmergencyContact.findByUserId(userId);
      if (contacts.length > 0) {
        primaryContact = {
          id: contacts[0].id,
          name: contacts[0].name,
          phoneNumber: contacts[0].phoneNumber,
          relationship: contacts[0].relationship,
          callLink: `tel:${contacts[0].phoneNumber}`,
        };
      }
    }

    return res.status(200).json({
      success: true,
      active: !!incident,
      incident: incident || null,
      primaryContact,
    });
  } catch (error) {
    console.error('[Get SOS Status Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching SOS status.',
    });
  }
}

// ── 3. UPDATE LIVE LOCATION ────────────────────────────
async function updateSOSLocation(req, res) {
  try {
    const { id } = req.params;
    const { latitude, longitude, accuracy } = req.body;
    const userId = req.userId;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude coordinates are required.',
      });
    }

    let incident;
    if (id && id !== 'current') {
      incident = await SOSIncident.updateLocation(id, userId, latitude, longitude, accuracy);
    } else {
      const active = await SOSIncident.getActiveIncident(userId);
      if (active) {
        incident = await SOSIncident.updateLocation(active.id, userId, latitude, longitude, accuracy);
      }
    }

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: 'No active SOS incident found to update location.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Live location updated successfully.',
      incident,
    });
  } catch (error) {
    console.error('[Update SOS Location Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update live location.',
    });
  }
}

// ── 4. RESOLVE SOS INCIDENT ────────────────────────────
async function resolveSOS(req, res) {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = req.userId;

    let incident;
    if (id && id !== 'current') {
      incident = await SOSIncident.resolve(id, userId, notes || 'Resolved by user');
    } else {
      const active = await SOSIncident.getActiveIncident(userId);
      if (active) {
        incident = await SOSIncident.resolve(active.id, userId, notes || 'Resolved by user');
      }
    }

    if (!incident) {
      // If no specific or active incident, resolve all active
      await SOSIncident.resolveActive(userId, notes || 'Resolved by user');
      return res.status(200).json({
        success: true,
        message: 'All active SOS alerts have been marked safe and resolved.',
      });
    }

    console.log(`[SOS Controller] Incident #${incident.id} marked RESOLVED for User #${userId}`);

    return res.status(200).json({
      success: true,
      message: 'SOS incident resolved. You are marked safe.',
      incident,
    });
  } catch (error) {
    console.error('[Resolve SOS Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resolve SOS incident.',
    });
  }
}

// ── 5. GET SOS INCIDENT HISTORY ─────────────────────────
async function getSOSHistory(req, res) {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const incidents = await SOSIncident.getHistory(userId, limit, offset);
    const total = await SOSIncident.countByUser(userId);

    return res.status(200).json({
      success: true,
      total,
      count: incidents.length,
      incidents,
    });
  } catch (error) {
    console.error('[Get SOS History Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve SOS incident history.',
    });
  }
}

// ── 6. SMARTWATCH / BLUETOOTH / EXTERNAL WEBHOOK ───────
async function receiveExternalTrigger(req, res) {
  try {
    const { triggerSource = 'smartwatch', latitude, longitude, deviceId } = req.body;
    const userId = req.userId;

    console.log(`[SOS Controller] External trigger received from ${triggerSource} (Device: ${deviceId || 'N/A'})`);

    req.body.triggerSource = triggerSource;
    req.body.notes = `External trigger from device: ${deviceId || triggerSource}`;

    return triggerSOS(req, res);
  } catch (error) {
    console.error('[External Trigger Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Error handling external SOS trigger.',
    });
  }
}

module.exports = {
  triggerSOS,
  getSOSStatus,
  updateSOSLocation,
  resolveSOS,
  getSOSHistory,
  receiveExternalTrigger,
};
