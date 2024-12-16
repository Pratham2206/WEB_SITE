// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const performanceMetrics = require('../middlewares/performanceMetrics');

// Define routes
router.get('/pending-orders', performanceMetrics, deliveryController .fetchPendingOrders);
router.get('/scheduled-orders', performanceMetrics, deliveryController .fetchScheduledOrders);
router.get('/assigned-orders', performanceMetrics, deliveryController .fetchAssignedOrders);
router.post('/assign-order', performanceMetrics, deliveryController .assignOrder);
router.get('/assigned-orders/:driver_id', performanceMetrics, deliveryController .fetchAssignedOrdersByDriver);
router.get('/assigned-order/:orderId', performanceMetrics, deliveryController .fetchOrderById);
router.put('/update-order-status', performanceMetrics, deliveryController .updateOrderStatus);
router.post('/verify-delivery-otp', performanceMetrics, deliveryController .verifyDeliveryOtp);

module.exports = router;
