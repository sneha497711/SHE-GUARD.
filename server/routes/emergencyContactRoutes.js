/**
 * server/routes/emergencyContactRoutes.js — Emergency Contacts Routing
 */

const express = require('express');
const router = express.Router();
const emergencyContactController = require('../controllers/emergencyContactController');
const authMiddleware = require('../middleware/authMiddleware');

// Public helpline configuration
router.get('/helplines', emergencyContactController.getHelplines);

// Protected user contact routes
router.use(authMiddleware);

router.get('/', emergencyContactController.getContacts);
router.post('/', emergencyContactController.createContact);
router.get('/:id', emergencyContactController.getContactById);
router.put('/:id', emergencyContactController.updateContact);
router.delete('/:id', emergencyContactController.deleteContact);
router.patch('/:id/priority', emergencyContactController.updatePriority);

module.exports = router;
