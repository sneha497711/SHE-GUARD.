/**
 * server/controllers/emergencyContactController.js — Emergency Contact Management Controller
 */

const EmergencyContact = require('../models/EmergencyContact');

const VALID_GROUPS = ['Family', 'Friends', 'Relatives', 'Colleagues', 'Neighbors', 'Other'];
const VALID_RELATIONSHIPS = [
  'Mother', 'Father', 'Sibling', 'Brother', 'Sister',
  'Partner', 'Spouse', 'Husband', 'Wife',
  'Friend', 'Best Friend',
  'Relative', 'Uncle', 'Aunt', 'Cousin',
  'Colleague', 'Manager', 'Neighbor', 'Family', 'Other'
];

// ── 1. GET HELPLINE CONFIGURATION (PUBLIC) ─────────────
function getHelplines(req, res) {
  const police = process.env.POLICE_HELPLINE_NUMBER || '112';
  const womenHelpline = process.env.WOMEN_HELPLINE_NUMBER || '1091';

  return res.status(200).json({
    success: true,
    helplines: {
      police: {
        name: 'Police Emergency',
        number: police,
        description: 'National Emergency & Police Services',
        icon: 'fa-shield-halved',
      },
      womenHelpline: {
        name: 'Women Helpline',
        number: womenHelpline,
        description: 'Women in Distress 24/7 Helpline',
        icon: 'fa-person-dress',
      },
    },
  });
}

// ── 2. GET ALL CONTACTS FOR LOGGED IN USER ───────────
async function getContacts(req, res) {
  try {
    const group = req.query.group || req.query.contactGroup || req.query.groupCategory;
    const contacts = await EmergencyContact.findByUserId(req.userId, group);

    return res.status(200).json({
      success: true,
      count: contacts.length,
      contacts,
    });
  } catch (error) {
    console.error('[Get Contacts Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve emergency contacts.',
    });
  }
}

// ── 3. GET SINGLE CONTACT ──────────────────────────────
async function getContactById(req, res) {
  try {
    const { id } = req.params;
    const contact = await EmergencyContact.findByIdAndUserId(id, req.userId);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found or access denied.',
      });
    }

    return res.status(200).json({
      success: true,
      contact,
    });
  } catch (error) {
    console.error('[Get Contact Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching emergency contact details.',
    });
  }
}

// ── 4. CREATE EMERGENCY CONTACT ────────────────────────
async function createContact(req, res) {
  try {
    const name = req.body.name;
    const phoneNumber = req.body.phoneNumber || req.body.phone || req.body.mobileNumber;
    const relationship = req.body.relationship;
    const priority = req.body.priority;
    const contactGroup = req.body.contactGroup || req.body.groupCategory || req.body.group;

    // Validation
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Please enter contact name.' });
    }

    if (!phoneNumber || !String(phoneNumber).trim()) {
      return res.status(400).json({ success: false, message: 'Please enter mobile number.' });
    }

    const cleanPhone = String(phoneNumber).replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number.',
      });
    }

    if (!relationship || !relationship.trim()) {
      return res.status(400).json({ success: false, message: 'Please select a relationship.' });
    }

    // Check duplicate phone number for this user
    const isDuplicate = await EmergencyContact.checkDuplicatePhone(req.userId, cleanPhone);
    if (isDuplicate) {
      return res.status(400).json({
        success: false,
        message: 'This phone number is already saved as an emergency contact.',
      });
    }

    const newContact = await EmergencyContact.create({
      userId: req.userId,
      name: name.trim(),
      phoneNumber: cleanPhone,
      relationship: relationship.trim(),
      priority: priority ? parseInt(priority) : null,
      contactGroup: contactGroup ? contactGroup.trim() : 'Family',
    });

    return res.status(201).json({
      success: true,
      message: 'Emergency contact added successfully.',
      contact: newContact,
    });
  } catch (error) {
    console.error('[Create Contact Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create emergency contact.',
    });
  }
}

// ── 5. UPDATE EMERGENCY CONTACT (ONE-CLICK UPDATE) ─────
async function updateContact(req, res) {
  try {
    const { id } = req.params;
    const name = req.body.name;
    const rawPhone = req.body.phoneNumber !== undefined ? req.body.phoneNumber : (req.body.phone !== undefined ? req.body.phone : req.body.mobileNumber);
    const relationship = req.body.relationship;
    const priority = req.body.priority;
    const rawGroup = req.body.contactGroup !== undefined ? req.body.contactGroup : (req.body.groupCategory !== undefined ? req.body.groupCategory : req.body.group);

    const existing = await EmergencyContact.findByIdAndUserId(id, req.userId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found or access denied.',
      });
    }

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ success: false, message: 'Contact name cannot be empty.' });
    }

    let cleanPhone = undefined;
    if (rawPhone !== undefined) {
      cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);
      if (cleanPhone.length !== 10) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid 10-digit mobile number.',
        });
      }

      // Check duplicate phone number excluding this contact
      const isDuplicate = await EmergencyContact.checkDuplicatePhone(req.userId, cleanPhone, id);
      if (isDuplicate) {
        return res.status(400).json({
          success: false,
          message: 'This phone number is already saved for another emergency contact.',
        });
      }
    }

    const updated = await EmergencyContact.update(id, req.userId, {
      name,
      phoneNumber: cleanPhone,
      relationship,
      priority,
      contactGroup: rawGroup,
    });

    return res.status(200).json({
      success: true,
      message: 'Contact updated successfully.',
      contact: updated,
    });
  } catch (error) {
    console.error('[Update Contact Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update emergency contact.',
    });
  }
}

// ── 6. DELETE EMERGENCY CONTACT ────────────────────────
async function deleteContact(req, res) {
  try {
    const { id } = req.params;
    const success = await EmergencyContact.delete(id, req.userId);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found or access denied.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Emergency contact deleted successfully.',
    });
  } catch (error) {
    console.error('[Delete Contact Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete emergency contact.',
    });
  }
}

// ── 7. UPDATE PRIORITY ─────────────────────────────────
async function updatePriority(req, res) {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (!priority || isNaN(parseInt(priority))) {
      return res.status(400).json({ success: false, message: 'Valid priority value is required.' });
    }

    const updated = await EmergencyContact.update(id, req.userId, {
      priority: parseInt(priority),
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Emergency contact not found or access denied.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Priority updated successfully.',
      contact: updated,
    });
  } catch (error) {
    console.error('[Update Priority Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update priority.',
    });
  }
}

module.exports = {
  getHelplines,
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  updatePriority,
};
