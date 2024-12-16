const express = require('express');
const router = express.Router();
const checkTokenBlacklist = require('../middlewares/tokenMiddleware');
const authController= require('../controllers/authController');
const performanceMetrics = require('../middlewares/performanceMetrics');

// Routes
router.post('/register', performanceMetrics,authController.registerUser);
router.post('/verify-otp', performanceMetrics, authController.verifyOtp);
router.post('/login', performanceMetrics, authController.loginUser);
router.post('/logout', performanceMetrics, checkTokenBlacklist,authController.logoutUser);

module.exports = router;
