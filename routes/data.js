const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { tokenRequired } = require('../middlewares/webMiddleware');
const performanceMetrics = require('../middlewares/performanceMetrics');

router.post('/submit', performanceMetrics, orderController.submitOrder);
router.post('/create-order', performanceMetrics, orderController.createOrderHandler);
router.post('/usersubmit', performanceMetrics,tokenRequired,orderController.userSubmitOrder );
router.get('/userData', performanceMetrics, orderController.getUserData);


module.exports = router;
