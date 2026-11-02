const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'sheguard.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[DB] Failed to connect to SQLite database:', err.message);
  } else {
    console.log('[DB] Connected to SQLite database at:', dbPath);
    initTables();
  }
});

function initTables() {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullName TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        mobileNumber TEXT UNIQUE NOT NULL,
        mobileVerified INTEGER DEFAULT 0,
        passwordHash TEXT NOT NULL,
        age INTEGER,
        address TEXT,
        city TEXT,
        state TEXT,
        pin TEXT,
        bloodGroup TEXT DEFAULT 'Unknown',
        medicalConditions TEXT DEFAULT '',
        allergies TEXT DEFAULT '',
        currentMedication TEXT DEFAULT '',
        additionalMedicalInformation TEXT DEFAULT '',
        emergencyContactName TEXT DEFAULT '',
        emergencyContactNumber TEXT DEFAULT '',
        emergencyContactRelationship TEXT DEFAULT 'Family',
        emergencyInformation TEXT DEFAULT '',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating users table:', err.message);
      else console.log('[DB] Users table verified/created.');
    });

    // OTPs table
    db.run(`
      CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mobileNumber TEXT NOT NULL,
        otpCode TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        attempts INTEGER DEFAULT 0,
        maxAttempts INTEGER DEFAULT 5,
        verified INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating otps table:', err.message);
      else console.log('[DB] OTPs table verified/created.');
    });

    // Emergency Contacts table (Module 2)
    db.run(`
      CREATE TABLE IF NOT EXISTS emergency_contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        name TEXT NOT NULL,
        phoneNumber TEXT NOT NULL,
        relationship TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 1,
        contactGroup TEXT NOT NULL DEFAULT 'Family',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating emergency_contacts table:', err.message);
      else console.log('[DB] Emergency contacts table verified/created.');
    });

    // SOS Incidents table (Module 3: Smart SOS)
    db.run(`
      CREATE TABLE IF NOT EXISTS sos_incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        triggerSource TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        latitude REAL,
        longitude REAL,
        accuracy REAL,
        smsStatus TEXT DEFAULT 'PENDING',
        callStatus TEXT DEFAULT 'PENDING',
        pushNotificationStatus TEXT DEFAULT 'PENDING',
        liveLocationStatus TEXT DEFAULT 'ACTIVE',
        notes TEXT,
        triggeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolvedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating sos_incidents table:', err.message);
      else {
        console.log('[DB] SOS incidents table verified/created.');
        // Create indexes
        db.run(`CREATE INDEX IF NOT EXISTS idx_sos_user ON sos_incidents(userId);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_sos_status ON sos_incidents(userId, status);`);
      }
    });

    // User Live Locations table (Module 4: Live GPS Tracking)
    db.run(`
      CREATE TABLE IF NOT EXISTS user_live_locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL UNIQUE,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL DEFAULT 10,
        isTracking INTEGER DEFAULT 1,
        isSharing INTEGER DEFAULT 1,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating user_live_locations table:', err.message);
      else console.log('[DB] User live locations table verified/created.');
    });

    // Geofences / Safe Zones table (Module 4)
    db.run(`
      CREATE TABLE IF NOT EXISTS geofences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius INTEGER NOT NULL DEFAULT 500,
        isActive INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating geofences table:', err.message);
      else {
        console.log('[DB] Geofences table verified/created.');
        db.run(`CREATE INDEX IF NOT EXISTS idx_geofence_user ON geofences(userId);`);
      }
    });

    // Location Shares table (Module 4: Family Live Location Sharing)
    db.run(`
      CREATE TABLE IF NOT EXISTS location_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ownerUserId INTEGER NOT NULL,
        viewerPhone TEXT NOT NULL,
        isSharing INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ownerUserId) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating location_shares table:', err.message);
      else {
        console.log('[DB] Location shares table verified/created.');
        db.run(`CREATE INDEX IF NOT EXISTS idx_loc_share_owner ON location_shares(ownerUserId);`);
      }
    });

    // Safety Nodes table (Module 10: Safe Route Recommendation)
    db.run(`
      CREATE TABLE IF NOT EXISTS safety_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nodeType TEXT NOT NULL, /* 'CRIME_HOTSPOT', 'LIGHTING', 'CCTV', 'CROWD_HUB', 'POLICE_PATROL' */
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radiusMeters REAL DEFAULT 300,
        safetyRating REAL DEFAULT 80, /* 0 to 100 */
        description TEXT DEFAULT '',
        source TEXT DEFAULT 'VERIFIED_DATABASE',
        isActive INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating safety_nodes table:', err.message);
      else {
        console.log('[DB] Safety nodes table verified/created.');
        db.run(`CREATE INDEX IF NOT EXISTS idx_safety_nodes_type ON safety_nodes(nodeType);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_safety_nodes_loc ON safety_nodes(latitude, longitude);`);
      }
    });

    // Fake Calls table (Module 8: Fake Call Generator)
    db.run(`
      CREATE TABLE IF NOT EXISTS fake_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        callerName TEXT NOT NULL DEFAULT 'Mom',
        callerNumber TEXT DEFAULT '+91 98765 43210',
        callerAvatar TEXT DEFAULT '👩',
        ringtone TEXT DEFAULT 'marimba',
        voiceType TEXT DEFAULT 'mom_checkin',
        customVoiceData TEXT DEFAULT '',
        delaySeconds INTEGER DEFAULT 0,
        status TEXT DEFAULT 'SCHEDULED', /* 'SCHEDULED', 'RINGING', 'ANSWERED', 'REJECTED', 'MISSED', 'CANCELLED', 'COMPLETED' */
        scheduledAt DATETIME,
        triggeredAt DATETIME,
        completedAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating fake_calls table:', err.message);
      else {
        console.log('[DB] Fake calls table verified/created.');
        db.run(`CREATE INDEX IF NOT EXISTS idx_fake_calls_user ON fake_calls(userId, status);`);
      }
    });

    // Chat Conversations table (Module 9: AI Chatbot Assistant)
    db.run(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        title TEXT DEFAULT 'Safety Conversation',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating chat_conversations table:', err.message);
      else {
        console.log('[DB] Chat conversations table verified/created.');
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_conv_user ON chat_conversations(userId);`);
      }
    });

    // Chat Messages table (Module 9: AI Chatbot Assistant)
    db.run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversationId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        role TEXT NOT NULL, /* 'user', 'assistant', 'system' */
        content TEXT NOT NULL,
        intent TEXT DEFAULT 'GENERAL', /* 'SAFETY', 'EMERGENCY', 'FIRST_AID', 'POLICE', 'HOSPITAL', 'LEGAL', 'GENERAL' */
        structuredData TEXT DEFAULT '', /* JSON payload for interactive cards / places */
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversationId) REFERENCES chat_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating chat_messages table:', err.message);
      else {
        console.log('[DB] Chat messages table verified/created.');
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversationId);`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_msg_user ON chat_messages(userId);`);
      }
    });
  });
}

// Promise-based query helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  db,
  run,
  get,
  all,
};
