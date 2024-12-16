const express = require('express');
const router = express.Router();
const orderManagementController = require('../controllers/orderManagementController');
const performanceMetrics = require('../middlewares/performanceMetrics');

// Route to fetch customer data by phone number
router.get('/customers/:phoneNumber', performanceMetrics, orderManagementController.getCustomerData);

// Route to fetch user data by user ID
router.get('/users/:userId', performanceMetrics, orderManagementController.getUserData);

// Route to fetch available drivers
router.get('/drivers/available', performanceMetrics, orderManagementController.getAvailableDrivers);

// Route to calculate fare based on distance and weight
router.post('/calculate_fare', performanceMetrics, orderManagementController.calculateFare);

// Route to get distance matrix
router.get('/distance-matrix', performanceMetrics, orderManagementController.getDistanceMatrix);

// Route to get autocomplete suggestions
router.get('/autocomplete', performanceMetrics, orderManagementController.getAutocomplete);

//User info or profile
router.get('/testusers/:userId', performanceMetrics, orderManagementController.getUserById);


module.exports = router;
