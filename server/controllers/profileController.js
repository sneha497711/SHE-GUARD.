/**
 * server/controllers/profileController.js — User Profile, Medical, and Emergency Controller
 */

const User = require('../models/User');

const VALID_BLOOD_GROUPS = [
  'A+', 'A−', 'A-',
  'B+', 'B−', 'B-',
  'AB+', 'AB−', 'AB-',
  'O+', 'O−', 'O-',
  'Unknown', ''
];

// ── 1. GET PERSONAL PROFILE ──────────────────────────
async function getProfile(req, res) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const safeUser = User.sanitize(user);
    return res.status(200).json({
      success: true,
      profile: {
        id: safeUser.id,
        fullName: safeUser.fullName,
        email: safeUser.email,
        mobileNumber: safeUser.mobileNumber,
        mobileVerified: safeUser.mobileVerified,
        age: safeUser.age,
        address: safeUser.address,
        city: safeUser.city,
        state: safeUser.state,
        pin: safeUser.pin,
      },
      user: safeUser,
    });
  } catch (error) {
    console.error('[Get Profile Error]:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving profile.' });
  }
}

// ── 2. UPDATE PERSONAL PROFILE ───────────────────────
async function updateProfile(req, res) {
  try {
    const { fullName, email, age, address, city, state, pin } = req.body;

    if (fullName !== undefined && !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name cannot be empty.' });
    }

    if (email !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
      }

      const existingByEmail = await User.findByEmail(email);
      if (existingByEmail && existingByEmail.id !== req.userId) {
        return res.status(400).json({
          success: false,
          message: 'Email address is already in use by another account.',
        });
      }
    }

    const updatedUser = await User.updateProfile(req.userId, {
      fullName,
      email,
      age: age ? parseInt(age) : null,
      address,
      city,
      state,
      pin,
    });

    const safeUser = User.sanitize(updatedUser);
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      profile: safeUser,
      user: safeUser,
    });
  } catch (error) {
    console.error('[Update Profile Error]:', error);
    return res.status(500).json({ success: false, message: 'Error updating profile.' });
  }
}

// ── 3. GET MEDICAL INFORMATION ───────────────────────
async function getMedical(req, res) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      medical: {
        bloodGroup: user.bloodGroup || 'Unknown',
        medicalConditions: user.medicalConditions || '',
        allergies: user.allergies || '',
        currentMedication: user.currentMedication || '',
        additionalMedicalInformation: user.additionalMedicalInformation || '',
      },
    });
  } catch (error) {
    console.error('[Get Medical Error]:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving medical information.' });
  }
}

// ── 4. UPDATE MEDICAL INFORMATION ────────────────────
async function updateMedical(req, res) {
  try {
    const {
      bloodGroup,
      medicalConditions,
      allergies,
      currentMedication,
      additionalMedicalInformation,
    } = req.body;

    if (bloodGroup !== undefined && bloodGroup !== null && !VALID_BLOOD_GROUPS.includes(bloodGroup.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid blood group selected.',
      });
    }

    const updatedUser = await User.updateMedical(req.userId, {
      bloodGroup: bloodGroup || 'Unknown',
      medicalConditions: medicalConditions || '',
      allergies: allergies || '',
      currentMedication: currentMedication || '',
      additionalMedicalInformation: additionalMedicalInformation || '',
    });

    return res.status(200).json({
      success: true,
      message: 'Medical information updated successfully.',
      medical: {
        bloodGroup: updatedUser.bloodGroup,
        medicalConditions: updatedUser.medicalConditions,
        allergies: updatedUser.allergies,
        currentMedication: updatedUser.currentMedication,
        additionalMedicalInformation: updatedUser.additionalMedicalInformation,
      },
      user: User.sanitize(updatedUser),
    });
  } catch (error) {
    console.error('[Update Medical Error]:', error);
    return res.status(500).json({ success: false, message: 'Error updating medical information.' });
  }
}

// ── 5. GET EMERGENCY DETAILS ─────────────────────────
async function getEmergency(req, res) {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      emergency: {
        emergencyContactName: user.emergencyContactName || '',
        emergencyContactNumber: user.emergencyContactNumber || '',
        emergencyContactRelationship: user.emergencyContactRelationship || 'Family',
        emergencyInformation: user.emergencyInformation || '',
      },
    });
  } catch (error) {
    console.error('[Get Emergency Error]:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving emergency details.' });
  }
}

// ── 6. UPDATE EMERGENCY DETAILS ──────────────────────
async function updateEmergency(req, res) {
  try {
    const {
      emergencyContactName,
      emergencyContactNumber,
      emergencyContactRelationship,
      emergencyInformation,
    } = req.body;

    if (emergencyContactName !== undefined && !emergencyContactName.trim()) {
      return res.status(400).json({ success: false, message: 'Emergency contact name is required.' });
    }

    if (emergencyContactNumber !== undefined && emergencyContactNumber.trim()) {
      const cleanPhone = emergencyContactNumber.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid emergency contact phone number.',
        });
      }
    }

    const updatedUser = await User.updateEmergency(req.userId, {
      emergencyContactName: emergencyContactName || '',
      emergencyContactNumber: emergencyContactNumber || '',
      emergencyContactRelationship: emergencyContactRelationship || 'Family',
      emergencyInformation: emergencyInformation || '',
    });

    return res.status(200).json({
      success: true,
      message: 'Emergency details updated successfully.',
      emergency: {
        emergencyContactName: updatedUser.emergencyContactName,
        emergencyContactNumber: updatedUser.emergencyContactNumber,
        emergencyContactRelationship: updatedUser.emergencyContactRelationship,
        emergencyInformation: updatedUser.emergencyInformation,
      },
      user: User.sanitize(updatedUser),
    });
  } catch (error) {
    console.error('[Update Emergency Error]:', error);
    return res.status(500).json({ success: false, message: 'Error updating emergency details.' });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getMedical,
  updateMedical,
  getEmergency,
  updateEmergency,
};
