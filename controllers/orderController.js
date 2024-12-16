const Order = require('../models/order');
const Customer = require('../models/customer');
require('dotenv').config();
const Razorpay = require('razorpay');
const RazorpayGateway = require('../geteways/razorpayGateway'); // Razorpay-specific logic
const PaymentService = require('../services/paymentService');  // Abstraction layer
const {sendEmail, createEmailTemplate} = require('../services/emailConformations');
const { logWithTracker } = require('../services/loggerService');

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Initialize PaymentService with RazorpayGateway
const paymentService = new PaymentService(new RazorpayGateway(razorpayInstance));


// Function to handle order submission
const submitOrder = async (req, res) => {
    const {
        serviceType,
        name,
        phoneNumber,
        email,
        weight,
        pickupAddress,
        dropAddress,
        content,
        deliveryInstructions,
        receiverPhonenumber,
        receiverName,
        senderAddress,
        receiverAddress,
        pickupDate,
        pickupTime,
        amount // Extract amount here
    } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request

    try {
        logWithTracker('info', `Received order submission request for serviceType: ${serviceType}, email: ${email}`, trackerId,'pickup-drop-service');

        let customer = await Customer.findOne({ where: { email } });
        if (!customer) {
            logWithTracker('info', `Creating new customer with email: ${email}`, trackerId,'pickup-drop-service');
            customer = await Customer.create({
                name,
                phoneNumber,
                email,
                pickupAddress,
                dropAddress,
                receiverPhonenumber,
                receiverName,
                content,
                weight,
                senderAddress,
                receiverAddress,
            });
            logWithTracker('info', `New customer created with email: ${email}`, trackerId,'pickup-drop-service');
        }
        const orderData = {
            phoneNumber,
            name,
            email,
            weight,
            pickupAddress,
            dropAddress,
            content,
            deliveryInstructions,
            receiverPhonenumber,
            senderAddress,
            receiverAddress,
            receiverName,
            amount,
            status: 'pending',
        };
        if (serviceType === "Delivery Now") {
            logWithTracker('info', `Creating "Delivery Now" order for ${name}`, trackerId,'pickup-drop-service');
            await Order.create(orderData);
            res.status(200).send('Immediate delivery order created successfully', trackerId);
        } else if (serviceType === "Schedule for Later") {
            if (!pickupDate || !pickupTime) {
                logWithTracker('warn', `Pickup date or time missing for scheduled delivery`, trackerId,'pickup-drop-service');
                return res.status(400).send('Pickup date and time are required for scheduled deliveries', trackerId,'pickup-drop-service');
            }
            orderData.pickupDate = pickupDate;
            orderData.pickupTime = pickupTime;
            logWithTracker('info', `Creating "Schedule for Later" order for ${name}`, trackerId,'pickup-drop-service');
            await Order.create(orderData);
            res.status(200).send('Scheduled delivery order created successfully', trackerId,'pickup-drop-service');
        } else {
            logWithTracker('warn', `Invalid service type: ${serviceType}`, trackerId,'pickup-drop-service');
            res.status(400).send('Invalid service type', trackerId);
        }
    } catch (err) {
        logWithTracker('error', `Error processing order: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).send('Error creating the order', trackerId);
    }
};

// Create Razorpay Order
const createOrderHandler = async (req, res) => {
    const { amount, currency, receipt } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    try {
        logWithTracker('info', `Received request to create Razorpay order with amount, currency`, trackerId,'pickup-drop-service');

        if (!amount || !currency) {
            logWithTracker('warn', `Amount or currency missing in request`, trackerId,'pickup-drop-service');
            return res.status(400).json({ error: 'Amount and currency are required', trackerId });
        }
        const options = {
            amount: Math.round(amount),
            currency: currency,
            receipt: receipt || `receipt#${Date.now()}`,
        };
        const order = await paymentService.createOrder(options);
        logWithTracker('info', `Razorpay order created successfully with receipt`, trackerId,'pickup-drop-service');
        res.json({order, trackerId});
    } catch (error) {
        logWithTracker('error', `Error creating Razorpay order: ${error.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Failed to create order', message: error.message, trackerId });
    }
};


// Handle User Order Submission
const userSubmitOrder = async (req, res) => {
    const {
        serviceType,
        name,
        phoneNumber,
        email,
        weight,
        pickupAddress,
        dropAddress,
        content,
        deliveryInstructions,
        receiverPhonenumber,
        receiverName,
        senderAddress,
        receiverAddress,
        pickupDate,
        pickupTime,
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
        amount,
    } = req.body;

    const trackerId = req.trackerId;
    logWithTracker('info', `Received user order submission for service type: ${serviceType}`, trackerId,'pickup-drop-service');
    try {
        const isVerified = paymentService.verifySignature({
            order_id: razorpay_order_id,
            payment_id: razorpay_payment_id,
            signature: razorpay_signature,
        });
        if (!isVerified) {
            logWithTracker('warn', 'Payment verification failed', trackerId,'pickup-drop-service');
            return res.status(400).json({ status: 'failed', message: 'Invalid payment signature', trackerId });
        }
        logWithTracker('info', 'Payment verified successfully', trackerId,'pickup-drop-service');
        let customer = await Customer.findOne({ where: { email } });
        if (!customer) {
            logWithTracker('info', `Customer not found, creating new customer for email: ${email}`, trackerId,'pickup-drop-service');
            customer = await Customer.create({
                name,
                phoneNumber,
                email,
                pickupAddress,
                dropAddress,
                receiverPhonenumber,
                receiverName,
                content,
                weight,
                senderAddress,
                receiverAddress,
            });
            logWithTracker('info', 'New customer created', trackerId,'pickup-drop-service');
        }

        const amountInRupees = (amount / 100).toFixed(2);
        const orderData = {
            phoneNumber,
            name,
            email,
            weight,
            pickupAddress,
            dropAddress,
            content,
            deliveryInstructions,
            receiverPhonenumber,
            receiverName,
            senderAddress,
            receiverAddress,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            amount: amountInRupees,
            status: 'pending',
        };
        logWithTracker('info', 'Order data prepared for submission', trackerId,'pickup-drop-service');
        let order;
        if (serviceType === "Delivery Now") {
            order = await Order.create(orderData);
            logWithTracker('info', 'Order created for "Delivery Now"', trackerId,'pickup-drop-service');
        } else if (serviceType === "Schedule for Later") {
            if (!pickupDate || !pickupTime) {
                logWithTracker('warn', 'Pickup date or time missing for scheduled delivery', trackerId,'pickup-drop-service');
                return res.status(400).json({ error: 'Pickup date and time are required for scheduled deliveries', trackerId });
            }
            orderData.pickupDate = pickupDate;
            orderData.pickupTime = pickupTime;
            order = await Order.create(orderData);
            logWithTracker('info', 'Order created for "Schedule for Later"', trackerId,'pickup-drop-service');
        } else {
            logWithTracker('warn', `Invalid service type: ${serviceType}`, trackerId,'pickup-drop-service');
            return res.status(400).json({ error: 'Invalid service type', trackerId });
        }
        const orderId = order.id;
        logWithTracker('info', `Order ID: ${orderId}`, trackerId,'pickup-drop-service');
        const customerMessage = createEmailTemplate(
            'Order Confirmation',
            `Dear ${name},<br><br>
            Thank you for placing your order. Here are the details:<br>
            - Order ID: ${orderId}<br>
            - Service Type: ${serviceType}<br>
            - Pickup Address: ${pickupAddress}<br>
            - Drop Address: ${dropAddress}<br>
            - Weight: ${weight} kg<br>
            - Amount: ₹${amountInRupees}<br><br>
            We will keep you updated on the status of your delivery.<br><br>
            Thank you for choosing TURTU.`
        );
        try {
            await sendEmail(email, 'Order Confirmation', customerMessage);
            logWithTracker('info', `Order confirmation email sent successfully to ${email}`, trackerId,'pickup-drop-service');
        } catch (error) {
            logWithTracker('error', `Error sending confirmation email: ${error.message}`, trackerId,'pickup-drop-service');
        }
        return res.status(200).json({ message: 'Order created successfully' });
    } catch (error) {
        logWithTracker('error', `Error processing user order: ${error.message}`, trackerId,'pickup-drop-service');
        return res.status(500).json({ error: 'Internal Server Error', message: error.message, trackerId });
    }
};

// Function to get all customer data
const getUserData = async (req, res) => {
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    try {
        logWithTracker('info', 'Fetching user data', trackerId,'pickup-drop-service');
        // Fetch all users (customers)
        const users = await Customer.findAll();
        logWithTracker('info', 'Fetched user data successfully', trackerId,'pickup-drop-service');
        // Return the user data
        res.json({users, trackerId});
    } catch (err) {
        logWithTracker('error', `Error fetching data: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Error fetching data', trackerId });
    }
};

module.exports = {
    submitOrder,
    createOrderHandler,
    userSubmitOrder,
    getUserData,
    
};
