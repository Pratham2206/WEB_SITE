// routes/user.js
const express = require('express');
const { tokenRequired } = require('../middlewares/webMiddleware');
const webuserController = require('../controllers/webuserController');
const router = express.Router();
const performanceMetrics = require('../middlewares/performanceMetrics');

// Verify token
router.get('/verify', tokenRequired, (req, res) => {
    return res.json({
        message: 'Token is valid!',
        user: req.user // user info from middleware
    });
});

// Career application
router.post('/career', performanceMetrics, tokenRequired, webuserController.careerApplication);

// Get career applications
router.get('/career-applications', performanceMetrics, webuserController.getCareerApplications);

// Download resume
router.get('/career-applications/:applicationId/resume', performanceMetrics, webuserController.downloadResume);

// Contact submission
router.post('/contact', performanceMetrics, webuserController.contact);

// Get contact queries
router.get('/contact-queries', performanceMetrics, webuserController.getContactQueries);

module.exports = router;
