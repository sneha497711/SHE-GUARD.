/**
 * server/models/EmergencyContact.js — Emergency Contact Model & Priority Manager
 */

const { run, get, all } = require('../config/db');

class EmergencyContact {
  static cleanPhone(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10);
  }

  static async findByUserId(userId, groupFilter = null) {
    if (groupFilter && groupFilter.toLowerCase() !== 'all') {
      return all(
        `SELECT * FROM emergency_contacts 
         WHERE userId = ? AND LOWER(contactGroup) = LOWER(?) 
         ORDER BY priority ASC, id ASC`,
        [userId, groupFilter.trim()]
      );
    }
    return all(
      'SELECT * FROM emergency_contacts WHERE userId = ? ORDER BY priority ASC, id ASC',
      [userId]
    );
  }

  static async findByIdAndUserId(id, userId) {
    return get(
      'SELECT * FROM emergency_contacts WHERE id = ? AND userId = ?',
      [id, userId]
    );
  }

  static async checkDuplicatePhone(userId, phoneNumber, excludeId = null) {
    const cleanNumber = this.cleanPhone(phoneNumber);
    if (!cleanNumber) return false;

    let sql = `SELECT * FROM emergency_contacts WHERE userId = ? AND 
               (phoneNumber = ? OR phoneNumber = ? OR phoneNumber = ?)`;
    const params = [userId, cleanNumber, cleanNumber.slice(-10), '+91' + cleanNumber.slice(-10)];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const existing = await get(sql, params);
    return !!existing;
  }

  static async getNextPriority(userId) {
    const row = await get(
      'SELECT MAX(priority) as maxPriority FROM emergency_contacts WHERE userId = ?',
      [userId]
    );
    return (row && row.maxPriority) ? row.maxPriority + 1 : 1;
  }

  static async create({
    userId,
    name,
    phoneNumber,
    relationship = 'Family',
    priority = null,
    contactGroup = 'Family',
  }) {
    const cleanNumber = this.cleanPhone(phoneNumber);
    const assignedPriority = priority ? parseInt(priority) : await this.getNextPriority(userId);

    // If an existing contact has this priority or higher, shift them down
    await run(
      'UPDATE emergency_contacts SET priority = priority + 1 WHERE userId = ? AND priority >= ?',
      [userId, assignedPriority]
    );

    const result = await run(
      `INSERT INTO emergency_contacts (
        userId, name, phoneNumber, relationship, priority, contactGroup, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        userId,
        name.trim(),
        cleanNumber,
        relationship.trim(),
        assignedPriority,
        contactGroup.trim() || 'Family',
      ]
    );

    // Normalize priorities so they form a continuous 1..N sequence
    await this.normalizePriorities(userId);

    return this.findByIdAndUserId(result.lastID, userId);
  }

  static async update(id, userId, {
    name,
    phoneNumber,
    relationship,
    priority,
    contactGroup,
  }) {
    const contact = await this.findByIdAndUserId(id, userId);
    if (!contact) return null;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (phoneNumber !== undefined) {
      updates.push('phoneNumber = ?');
      params.push(this.cleanPhone(phoneNumber));
    }
    if (relationship !== undefined) {
      updates.push('relationship = ?');
      params.push(relationship.trim());
    }
    if (contactGroup !== undefined) {
      updates.push('contactGroup = ?');
      params.push(contactGroup.trim() || 'Family');
    }

    const newPriority = priority !== undefined ? parseInt(priority) : contact.priority;
    if (newPriority !== contact.priority) {
      await this.shiftPriority(userId, id, contact.priority, newPriority);
      updates.push('priority = ?');
      params.push(newPriority);
    }

    updates.push('updatedAt = CURRENT_TIMESTAMP');
    params.push(id, userId);

    await run(
      `UPDATE emergency_contacts SET ${updates.join(', ')} WHERE id = ? AND userId = ?`,
      params
    );

    await this.normalizePriorities(userId);
    return this.findByIdAndUserId(id, userId);
  }

  static async delete(id, userId) {
    const contact = await this.findByIdAndUserId(id, userId);
    if (!contact) return false;

    await run('DELETE FROM emergency_contacts WHERE id = ? AND userId = ?', [id, userId]);
    await this.normalizePriorities(userId);
    return true;
  }

  static async shiftPriority(userId, contactId, oldPriority, newPriority) {
    if (oldPriority === newPriority) return;

    if (newPriority < oldPriority) {
      // Shifting up: increment intermediate contacts
      await run(
        `UPDATE emergency_contacts 
         SET priority = priority + 1 
         WHERE userId = ? AND id != ? AND priority >= ? AND priority < ?`,
        [userId, contactId, newPriority, oldPriority]
      );
    } else {
      // Shifting down: decrement intermediate contacts
      await run(
        `UPDATE emergency_contacts 
         SET priority = priority - 1 
         WHERE userId = ? AND id != ? AND priority <= ? AND priority > ?`,
        [userId, contactId, newPriority, oldPriority]
      );
    }
  }

  static async normalizePriorities(userId) {
    const contacts = await all(
      'SELECT id FROM emergency_contacts WHERE userId = ? ORDER BY priority ASC, id ASC',
      [userId]
    );

    for (let i = 0; i < contacts.length; i++) {
      const properPriority = i + 1;
      await run(
        'UPDATE emergency_contacts SET priority = ? WHERE id = ?',
        [properPriority, contacts[i].id]
      );
    }
  }
}

module.exports = EmergencyContact;
