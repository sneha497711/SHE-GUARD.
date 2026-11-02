/**
 * server/controllers/fakeCallController.js — Fake Call Generator Controller (Module 8)
 */

const FakeCall = require('../models/FakeCall');

// ── 1. GET PRESET VOICE TEMPLATES & RINGTONES ───────────
function getVoiceTemplates(req, res) {
  const templates = [
    {
      id: 'mom_checkin',
      title: 'Mom — Dinner Check-in',
      callerName: 'Mom',
      avatar: '👩',
      dialogue: 'Hey sweetie! Where are you right now? Dinner is on the table and Dad is waiting outside in the car for you. Hurry home!',
      durationSec: 8,
    },
    {
      id: 'friend_pickup',
      title: 'Best Friend — Waiting Outside',
      callerName: 'Priya (Friend)',
      avatar: '👧',
      dialogue: 'Hey! I am parked right outside your building with the car running. Come out right now, we need to leave!',
      durationSec: 7,
    },
    {
      id: 'boss_urgent',
      title: 'Manager / Office — Urgent Call',
      callerName: 'Office Manager',
      avatar: '👔',
      dialogue: 'Hi, sorry to call so late, but we have an urgent escalation on the project. Are you near your laptop? Please jump on the bridge immediately.',
      durationSec: 9,
    },
    {
      id: 'brother_location',
      title: 'Brother — Reached Location',
      callerName: 'Bhaiya (Brother)',
      avatar: '👦',
      dialogue: 'Haan I just reached the gate. I am standing near the front entrance. Come outside quickly, lets head back.',
      durationSec: 7,
    },
  ];

  const ringtones = [
    { id: 'marimba', name: 'Marimba Modern Chime', type: 'synth' },
    { id: 'classic_bell', name: 'Classic Telephone Bell', type: 'synth' },
    { id: 'radar_electronic', name: 'Radar Electronic Alarm', type: 'synth' },
    { id: 'gentle_harp', name: 'Gentle Harp Melody', type: 'synth' },
  ];

  return res.status(200).json({
    success: true,
    templates,
    ringtones,
  });
}

// ── 2. CREATE / SCHEDULE FAKE CALL ──────────────────────
async function createFakeCall(req, res) {
  try {
    const userId = req.userId;
    const {
      callerName = 'Mom',
      callerNumber = '+91 98765 43210',
      callerAvatar = '👩',
      ringtone = 'marimba',
      voiceType = 'mom_checkin',
      customVoiceData = '',
      delaySeconds = 0,
    } = req.body;

    if (!callerName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Caller name is required.',
      });
    }

    const fakeCall = await FakeCall.create(userId, {
      callerName: callerName.trim(),
      callerNumber: callerNumber.trim(),
      callerAvatar,
      ringtone,
      voiceType,
      customVoiceData,
      delaySeconds: parseInt(delaySeconds) || 0,
      status: 'SCHEDULED',
    });

    return res.status(201).json({
      success: true,
      message: delaySeconds > 0
        ? `Fake call from "${fakeCall.callerName}" scheduled in ${delaySeconds} seconds.`
        : `Fake call from "${fakeCall.callerName}" triggered immediately.`,
      fakeCall,
    });
  } catch (error) {
    console.error('[Create Fake Call Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to schedule fake call.',
    });
  }
}

// ── 3. GET USER'S FAKE CALLS ────────────────────────────
async function getFakeCalls(req, res) {
  try {
    const userId = req.userId;
    const { status } = req.query;

    const fakeCalls = await FakeCall.getByUser(userId, status || null);

    return res.status(200).json({
      success: true,
      count: fakeCalls.length,
      fakeCalls,
    });
  } catch (error) {
    console.error('[Get Fake Calls Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch fake calls.',
    });
  }
}

// ── 4. GET SINGLE FAKE CALL BY ID ───────────────────────
async function getFakeCallById(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const fakeCall = await FakeCall.getById(id, userId);
    if (!fakeCall) {
      return res.status(404).json({
        success: false,
        message: 'Fake call record not found.',
      });
    }

    return res.status(200).json({
      success: true,
      fakeCall,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error retrieving fake call.' });
  }
}

// ── 5. UPDATE FAKE CALL ─────────────────────────────────
async function updateFakeCall(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const updated = await FakeCall.update(id, userId, req.body);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Fake call not found or unauthorized.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Fake call settings updated successfully.',
      fakeCall: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update fake call.' });
  }
}

// ── 6. UPDATE FAKE CALL STATUS ──────────────────────────
async function updateFakeCallStatus(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['SCHEDULED', 'RINGING', 'ANSWERED', 'REJECTED', 'MISSED', 'CANCELLED', 'COMPLETED'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const updated = await FakeCall.updateStatus(id, userId, status);
    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Fake call not found or unauthorized.',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Fake call status updated to "${status}".`,
      fakeCall: updated,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
}

// ── 7. DELETE FAKE CALL ─────────────────────────────────
async function deleteFakeCall(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const success = await FakeCall.delete(id, userId);
    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Fake call not found or unauthorized.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Fake call deleted successfully.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete fake call.' });
  }
}

module.exports = {
  getVoiceTemplates,
  createFakeCall,
  getFakeCalls,
  getFakeCallById,
  updateFakeCall,
  updateFakeCallStatus,
  deleteFakeCall,
};
