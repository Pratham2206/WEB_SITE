const express = require('express');
const webauthController = require('../controllers/webauthController');
const router = express.Router();

router.post('/register', webauthController.register);
router.post('/resend-otp', webauthController.resendOtp);
router.post('/verify-otp', webauthController.verifyOtp);
router.post('/login', webauthController.login);
// router.post('/request-password-reset', webauthController.requestPasswordReset);
// router.post('/reset-password/:token', webauthController.resetPassword);
// router.post('/change-password', webauthController.changePassword);

router.post('/request-password-reset', webauthController.requestPasswordReset);
router.post('/verify-reset-otp', webauthController.verifyResetOtp);
router.post('/reset-password', webauthController.resetPassword);
module.exports = router;
