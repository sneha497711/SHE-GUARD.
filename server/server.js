/**
 * server/server.js — SHE-GUARD Backend Server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const emergencyContactRoutes = require('./routes/emergencyContactRoutes');
const sosRoutes = require('./routes/sosRoutes');
const locationRoutes = require('./routes/locationRoutes');
const safeRouteRoutes = require('./routes/safeRouteRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger for development
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production' && !req.path.startsWith('/js') && !req.path.endsWith('.css') && !req.path.endsWith('.png')) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.url}`);
  }
  next();
});

// Health check
app.get(['/api/health', '/health'], (req, res) => {
  res.status(200).json({
    status: 'healthy',
    app: 'SHE-GUARD API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount Routes (supporting both /api/* and root /* conventions)
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/profile', profileRoutes);
app.use('/profile', profileRoutes);

app.use('/api/emergency-contacts', emergencyContactRoutes);
app.use('/emergency-contacts', emergencyContactRoutes);

app.use('/api/sos', sosRoutes);
app.use('/sos', sosRoutes);

app.use('/api/location', locationRoutes);
app.use('/location', locationRoutes);

app.use('/api/geofences', locationRoutes);
app.use('/geofences', locationRoutes);

// Module 10: Safe Route Recommendation
app.use('/api/routes', safeRouteRoutes);
app.use('/routes', safeRouteRoutes);

// Module 8: Fake Call Generator
const fakeCallRoutes = require('./routes/fakeCallRoutes');
app.use('/api/fake-calls', fakeCallRoutes);
app.use('/fake-calls', fakeCallRoutes);

// Module 9: AI Chatbot Assistant
const chatbotRoutes = require('./routes/chatbotRoutes');
app.use('/api/chat', chatbotRoutes);
app.use('/chat', chatbotRoutes);

// Static frontend serving
// Check possible directory locations for sg_final
const possibleFrontendPaths = [
  path.join(__dirname, '..', 'sheguard_v4_evidence (1)', 'sg_final'),
  path.join(__dirname, '..', 'sg_final'),
  path.join(__dirname, '..', 'public'),
];

const staticDir = possibleFrontendPaths.find(p => fs.existsSync(p)) || possibleFrontendPaths[0];

if (fs.existsSync(staticDir)) {
  console.log('[Server] Serving frontend from:', staticDir);
  app.use(express.static(staticDir));

  // SPA fallback to index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.path.startsWith('/profile/')) {
      return next();
    }
    const indexPath = path.join(staticDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

// 404 handler for API routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server Uncaught Error]:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🛡️  SHE-GUARD API Server running on port ${PORT}`);
  console.log(`🔗 Local URL: http://localhost:${PORT}`);
  console.log(`📊 Mode:      ${process.env.NODE_ENV || 'development'}`);
  console.log(`=================================================\n`);
});

module.exports = app;
