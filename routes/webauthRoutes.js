const express = require('express');
const webauthController = require('../controllers/webauthController');
const performanceMetrics = require('../middlewares/performanceMetrics');
const router = express.Router();

router.post('/register', performanceMetrics, webauthController.register);
router.post('/resend-otp', performanceMetrics, performanceMetrics, webauthController.resendOtp);
router.post('/verify-otp', performanceMetrics, webauthController.verifyOtp);
router.post('/login', performanceMetrics, webauthController.login);
// router.post('/request-password-reset', webauthController.requestPasswordReset);
// router.post('/reset-password/:token', webauthController.resetPassword);
// router.post('/change-password', webauthController.changePassword);

router.post('/request-password-reset', performanceMetrics, webauthController.requestPasswordReset);
router.post('/verify-reset-otp', performanceMetrics, webauthController.verifyResetOtp);
router.post('/reset-password', performanceMetrics, webauthController.resetPassword);
module.exports = router;
