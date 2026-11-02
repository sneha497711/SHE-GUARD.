const { run, get, all } = require('../config/db');

class User {
  static sanitize(user) {
    if (!user) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  static async findById(id) {
    const user = await get('SELECT * FROM users WHERE id = ?', [id]);
    return user;
  }

  static async findByEmail(email) {
    if (!email) return null;
    const user = await get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
    return user;
  }

  static async findByMobile(mobileNumber) {
    if (!mobileNumber) return null;
    const cleanMobile = mobileNumber.replace(/\D/g, '');
    const user = await get(
      `SELECT * FROM users WHERE 
       mobileNumber = ? OR 
       mobileNumber = ? OR 
       mobileNumber = ?`,
      [cleanMobile, cleanMobile.slice(-10), '+91' + cleanMobile.slice(-10)]
    );
    return user;
  }

  static async findByEmailOrMobile(identifier) {
    if (!identifier) return null;
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) {
      return this.findByEmail(trimmed);
    }
    const clean = trimmed.replace(/\D/g, '');
    if (clean.length >= 10) {
      return this.findByMobile(clean);
    }
    return this.findByEmail(trimmed);
  }

  static async create({
    fullName,
    email,
    mobileNumber,
    passwordHash,
    mobileVerified = 1,
    age = null,
    address = '',
    city = '',
    state = '',
    pin = '',
    bloodGroup = 'Unknown',
    medicalConditions = '',
    allergies = '',
    currentMedication = '',
    additionalMedicalInformation = '',
    emergencyContactName = '',
    emergencyContactNumber = '',
    emergencyContactRelationship = 'Family',
    emergencyInformation = '',
  }) {
    const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
    const result = await run(
      `INSERT INTO users (
        fullName, email, mobileNumber, mobileVerified, passwordHash,
        age, address, city, state, pin, bloodGroup,
        medicalConditions, allergies, currentMedication, additionalMedicalInformation,
        emergencyContactName, emergencyContactNumber, emergencyContactRelationship, emergencyInformation,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        fullName.trim(),
        email.trim().toLowerCase(),
        cleanMobile,
        mobileVerified ? 1 : 0,
        passwordHash,
        age || null,
        address || '',
        city || '',
        state || '',
        pin || '',
        bloodGroup || 'Unknown',
        medicalConditions || '',
        allergies || '',
        currentMedication || '',
        additionalMedicalInformation || '',
        emergencyContactName || '',
        emergencyContactNumber || '',
        emergencyContactRelationship || 'Family',
        emergencyInformation || '',
      ]
    );

    return this.findById(result.lastID);
  }

  static async updateProfile(id, { fullName, email, age, address, city, state, pin }) {
    const updates = [];
    const params = [];

    if (fullName !== undefined) { updates.push('fullName = ?'); params.push(fullName.trim()); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email.trim().toLowerCase()); }
    if (age !== undefined) { updates.push('age = ?'); params.push(age || null); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address.trim()); }
    if (city !== undefined) { updates.push('city = ?'); params.push(city.trim()); }
    if (state !== undefined) { updates.push('state = ?'); params.push(state.trim()); }
    if (pin !== undefined) { updates.push('pin = ?'); params.push(pin.trim()); }

    updates.push('updatedAt = CURRENT_TIMESTAMP');
    params.push(id);

    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async updateMedical(id, {
    bloodGroup,
    medicalConditions,
    allergies,
    currentMedication,
    additionalMedicalInformation,
  }) {
    const updates = [];
    const params = [];

    if (bloodGroup !== undefined) { updates.push('bloodGroup = ?'); params.push(bloodGroup); }
    if (medicalConditions !== undefined) { updates.push('medicalConditions = ?'); params.push(medicalConditions.trim()); }
    if (allergies !== undefined) { updates.push('allergies = ?'); params.push(allergies.trim()); }
    if (currentMedication !== undefined) { updates.push('currentMedication = ?'); params.push(currentMedication.trim()); }
    if (additionalMedicalInformation !== undefined) { updates.push('additionalMedicalInformation = ?'); params.push(additionalMedicalInformation.trim()); }

    updates.push('updatedAt = CURRENT_TIMESTAMP');
    params.push(id);

    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async updateEmergency(id, {
    emergencyContactName,
    emergencyContactNumber,
    emergencyContactRelationship,
    emergencyInformation,
  }) {
    const updates = [];
    const params = [];

    if (emergencyContactName !== undefined) { updates.push('emergencyContactName = ?'); params.push(emergencyContactName.trim()); }
    if (emergencyContactNumber !== undefined) { updates.push('emergencyContactNumber = ?'); params.push(emergencyContactNumber.trim()); }
    if (emergencyContactRelationship !== undefined) { updates.push('emergencyContactRelationship = ?'); params.push(emergencyContactRelationship); }
    if (emergencyInformation !== undefined) { updates.push('emergencyInformation = ?'); params.push(emergencyInformation.trim()); }

    updates.push('updatedAt = CURRENT_TIMESTAMP');
    params.push(id);

    await run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async setMobileVerified(id, status = true) {
    await run('UPDATE users SET mobileVerified = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', [
      status ? 1 : 0,
      id,
    ]);
    return this.findById(id);
  }
}

module.exports = User;
