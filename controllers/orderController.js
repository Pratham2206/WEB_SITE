const Order = require('../models/order');
const Customer = require('../models/customer');
const Razorpay = require("razorpay");
const crypto = require('crypto');
require('dotenv').config();
const {sendEmail, createEmailTemplate} = require('../services/emailConformations');


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

    try {
        let customer = await Customer.findOne({ where: { email } });
        if (!customer) {
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
        }
        if (serviceType === "Delivery Now") {
            await Order.create({
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
                amount, // Extract amount here
                status: 'pending',
            });
            res.status(200).send('Immediate delivery order created successfully');
        } else if (serviceType === "Schedule for Later") {
            if (!pickupDate || !pickupTime) {
                return res.status(400).send('Pickup date and time are required for scheduled deliveries');
            }

            await Order.create({
                customerId: customer.id,
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
                pickupDate,
                pickupTime,
                amount,// Extract amount here
                status: 'pending',
            });
            res.status(200).send('Scheduled delivery order created successfully');
        } else {
            res.status(400).send('Invalid service type');
        }
    } catch (err) {
        console.error('Error processing order:', err);
        res.status(500).send('Error creating the order');
    }
};

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID , // Replace with your actual key_id
    key_secret: process.env.RAZORPAY_KEY_SECRET , // Replace with your actual key_secret
});

// Razorpay order creation function
const createRazorpayOrder = async (req, res) => {
    try {
        // Log the request body to inspect incoming data
        console.log('Request received to create Razorpay order with data:', req.body);

        const { amount, currency, receipt } = req.body;

        // Check if amount and currency are provided
        if (!amount || !currency) {
            console.error('Amount or currency is missing in request body');
            return res.status(400).json({ error: 'Amount and currency are required' });
        }

        // Prepare Razorpay order options
        const options = {
            amount: Math.round(amount), // Ensure it's an integer
            currency: currency,
            receipt: receipt || `receipt#${Date.now()}`, // Default receipt if not provided
        };

        // Log options before making the Razorpay API call
        console.log('Razorpay order options:', options);

        // Check if Razorpay instance is initialized properly
        console.log('Razorpay instance:', razorpay);

        // Log environment variables (only for debugging, remove in production)
        console.log('Environment variables:', {
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        // Create the Razorpay order
        const razorpayOrder = await razorpay.orders.create(options);

        // Log the successful response from Razorpay
        console.log('Razorpay order created successfully:', razorpayOrder);

        // Respond with the Razorpay order details
        res.json(razorpayOrder);
    } catch (error) {
        // Log any errors that occur during the Razorpay order creation
        console.error(
            'Error creating Razorpay order:',
            error.response ? error.response.data : error.message
        );

        // Return error response to the client
        res.status(500).json({ 
            error: 'Internal Server Error',
            message: error.message, // Include more detailed error message for debugging
        });
    }
};
// Function to handle user order submission
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
    console.log('Received Order Request'); // Log request body
    try {
        // Verify Razorpay payment
        const shasum = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
        shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const digest = shasum.digest('hex');

        if (digest !== razorpay_signature) {
            console.error('Razorpay signature verification failed');
            return res.status(400).json({ status: 'failed', message: 'Invalid Razorpay signature' });
        }
        console.log('Razorpay payment verified successfully');
        let customer = await Customer.findOne({ where: { email } });
        if (!customer) {
            console.log('Customer not found, creating a new one');
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
            console.log('New Customer Created');
        } else {
            console.log('Customer Found');
        }
        const amountInRupees = (amount / 100).toFixed(2);
        console.log('Amount in Rupees');
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

        console.log('Order Data Prepared');

        let order;
        if (serviceType === "Delivery Now") {
            order = await Order.create(orderData);
            console.log('Order Created for "Delivery Now"');
             // Fetch the created order to verify it's stored correctly
    const createdOrder = await Order.findByPk(order.id);
    console.log('Created Order:', createdOrder);
        } else if (serviceType === "Schedule for Later") {
            if (!pickupDate || !pickupTime) {
                console.error('Pickup date and time are missing for scheduled delivery');
                return res.status(400).json({ error: 'Pickup date and time are required for scheduled deliveries' });
            }
            orderData.pickupDate = pickupDate;
            orderData.pickupTime = pickupTime;
            order = await Order.create(orderData);
            console.log('Order Created for "Schedule for Later"');

              // Fetch the created order to verify it's stored correctly
    const createdOrder = await Order.findByPk(order.id);
    console.log('Created Order:', createdOrder);
        } else {
            console.error('Invalid service type:', serviceType);
            return res.status(400).json({ error: 'Invalid service type' });
        }

        const orderId = order.id;
        console.log('Order ID:', orderId);

        // Send notification to the customer
        const customerMessage = createEmailTemplate(
            'Order Confirmation',
            `Dear ${name},<br><br>
                Thank you for placing your order. Here are the details:<br>
                - Order ID: ${orderId}<br>
                - Service Type: ${serviceType}<br>
                - Pickup Address: ${pickupAddress}<br>
                - Drop Address: ${dropAddress}<br>
                - Weight: ${weight} kg<br>
                - Amount: Online Payment ₹${amountInRupees}<br><br>
                We will keep you updated on the status of your delivery.<br><br>
                Thank you for choosing TURTU.`
        );

        try {
            await sendEmail(email, 'Order Confirmation', customerMessage);
            console.log('Order confirmation email sent successfully to', email);
        } catch (error) {
            console.error('Error sending order confirmation email:', error);
        }

        return res.status(200).json({ message: 'Order created successfully' });
    } catch (err) {
        console.error('Error processing order:', err.message, err.stack);
        return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
};


// Function to get all customer data
const getUserData = async (req, res) => {
    console.log('Fetching user data');
    try {
        const users = await Customer.findAll();
        console.log('Fetched user data');
        res.json(users);
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).json({ error: 'Error fetching data' });
    }
};

module.exports = {
    submitOrder,
    createRazorpayOrder,
    userSubmitOrder,
    getUserData,
};
