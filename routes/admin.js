const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const performanceMetrics = require('../middlewares/performanceMetrics');

// Route to fetch unapproved users
router.get('/nonapproval',performanceMetrics, adminController.getUnapprovedUsers);

// Route to accept a user
router.post('/accept/:id',performanceMetrics, adminController.acceptUser);

// Route to reject a user
router.delete('/reject/:id',performanceMetrics, adminController.rejectUser);

// Route to fetch orders for admin
router.get('/admin/orders',performanceMetrics, adminController.getAdminOrders);

// Route to get bar data (weekly, monthly, yearly)
router.get('/bar',performanceMetrics, adminController.getBarData);

// Route to fetch order history with counts and details
router.get('/orderHistory',performanceMetrics, adminController.getOrderHistory);

// Route to fetch a specific order by ID
router.get('/:orderId',performanceMetrics, adminController.getOrderById);

// Route to filter orders by date range
router.get('/orders/filter',performanceMetrics, adminController.filterOrdersByDate);

// Route to fetch registered users and their count
router.get('/reg/users',performanceMetrics, adminController.getRegisteredUsers);

module.exports = router;
