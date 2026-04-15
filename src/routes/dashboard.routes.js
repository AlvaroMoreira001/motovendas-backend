/**
 * src/routes/dashboard.routes.js
 */
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const auth = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');

// Dashboard é exclusivo para admin
router.use(auth, requireRole('admin'));

router.get('/summary', dashboardController.summary);
router.get('/by-seller', dashboardController.bySeller);
router.get('/stock-alert', dashboardController.stockAlert);
router.get('/by-category', dashboardController.byCategory);

module.exports = router;
