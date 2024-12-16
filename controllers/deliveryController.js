require('dotenv').config();
const {sendEmail, createEmailTemplate} = require('../services/emailConformations');
const { generateOTP } = require('../services/genarateOtp');
const Order = require('../models/order');
const AssignedOrder = require('../models/assignedOrder');
const DeliveryBoy = require('../models/deliveryBoy');
const { Op } = require('sequelize');
const { logWithTracker } = require('../services/loggerService');

// Controller function to fetch pending orders
exports.fetchPendingOrders = async (req, res) => {
  const trackerId = req.trackerId; // Assuming the trackerId is passed along with the request
  try {
    logWithTracker('info', 'Fetching pending orders...', trackerId,'pickup-drop-service');

    const orders = await Order.findAll({
      where: {
        status: 'pending',
        pickupTime: {
          [Op.is]: null // Fetch orders where pickupTime is null
        }
      }
    });

    logWithTracker('info', 'Fetched pending orders', trackerId,'pickup-drop-service');
    res.json({orders,trackerId});
  } catch (err) {
    logWithTracker('error', `Error fetching pending orders: ${err.message}`, trackerId,'pickup-drop-service');
    res.status(500).json({ error: 'Error fetching orders', trackerId });
  }
};

// Controller function to fetch scheduled orders
exports.fetchScheduledOrders = async (req, res) => {
  const trackerId = req.trackerId; // Assuming the trackerId is passed along with the request
  try {
    logWithTracker('info', 'Fetching scheduled orders...', trackerId,'pickup-drop-service');

    const orders = await Order.findAll({
      where: {
        status: 'pending',
        pickupTime: {
          [Op.not]: null // Check that pickupTime is not null
        }
      }
    });

    logWithTracker('info', 'Fetched scheduled orders', trackerId,'pickup-drop-service');
    res.json({orders,trackerId});
  } catch (err) {
    logWithTracker('error', `Error fetching scheduled orders: ${err.message}`, trackerId,'pickup-drop-service');
    res.status(500).json({ error: 'Error fetching orders', trackerId });
  }
};

// Controller function to fetch assigned orders
exports.fetchAssignedOrders = async (req, res) => {
  const trackerId = req.trackerId; // Assuming the trackerId is passed along with the request
  try {
    logWithTracker('info', 'Fetching assigned orders...', trackerId,'pickup-drop-service');

    const orders = await AssignedOrder.findAll({ 
      where: { 
        status: ['active', 'picked', 'delivered'] 
      } 
    });

    logWithTracker('info', 'Fetched assigned orders', trackerId,'pickup-drop-service');
    res.json({orders,trackerId});
  } catch (err) {
    logWithTracker('error', `Error fetching assigned orders: ${err.message}`, trackerId,'pickup-drop-service');
    res.status(500).json({ error: 'Error fetching assigned orders', trackerId });
  }
};

// Controller function to assign an order
// exports.assignOrder = async (req, res) => {
//   const { orderId, driverPhoneNumber, driverName, userId } = req.body;
//   const trackerId = req.trackerId; // Assuming the trackerId is passed along with the request

//   try {
//     logWithTracker('info', `Assigning order (ID: ${orderId})...`, trackerId,'pickup-drop-service');

//     const order = await Order.findOne({ where: { id: orderId } });
//     logWithTracker('info', `Order fetched (ID: ${orderId})`, trackerId,'pickup-drop-service');

//     if (!order) {
//       logWithTracker('error', `Order with ID ${orderId} not found.`, trackerId,'pickup-drop-service');
//       return res.status(404).json({ error: 'Order not found', trackerId });
//     }

//     const otp = generateOTP();
//     logWithTracker('info', 'Generated OTP...', trackerId,'pickup-drop-service');

//     const assignedOrder = await AssignedOrder.create({
//       order_id: orderId,
//       driver_id: userId,
//       driver_name: driverName,
//       driver_phone_number: driverPhoneNumber,
//       status: 'active',
//       phoneNumber: order.phoneNumber,
//       name: order.name,
//       email: order.email,
//       pickupAddress: order.pickupAddress,
//       dropAddress: order.dropAddress,
//       content: order.content,
//       weight: order.weight,
//       pickupDate: order.pickupDate,
//       pickupTime: order.pickupTime,
//       dropTime: order.dropTime,
//       createdAt: order.createdAt,
//       receiverPhonenumber: order.receiverPhonenumber,
//       receiverName: order.receiverName,
//       senderAddress: order.senderAddress,
//       receiverAddress: order.receiverAddress,
//       deliveryInstructions: order.deliveryInstructions,
//       otp: otp,
//     });
//     logWithTracker('info', `Assigned order created (ID: ${assignedOrder.id})`, trackerId,'pickup-drop-service');

//     await Order.update({ status: 'active', assignedDriver: driverName }, { where: { id: orderId } });
//     logWithTracker('info', `Order status updated to 'active' for order ID ${orderId}`, trackerId,'pickup-drop-service');

//     await DeliveryBoy.update({ available: 'assigned' }, { where: { phonenumber: driverPhoneNumber } });
//     logWithTracker('info', `Driver availability updated to 'assigned' for phone number ${driverPhoneNumber}`, trackerId,'pickup-drop-service');

//     const driver = await DeliveryBoy.findOne({ where: { phonenumber: driverPhoneNumber } });
//     logWithTracker('info', `Driver fetched for phone number ${driverPhoneNumber}`, trackerId,'pickup-drop-service');

//     if (!driver) {
//       logWithTracker('error', `Driver with phone number ${driverPhoneNumber} not found.`, trackerId,'pickup-drop-service');
//       return res.status(404).json({ error: 'Driver not found', trackerId });
//     }

//     const driverEmail = driver.email;
    
//     // Send notification to the customer
//     const customerMessage = createEmailTemplate(
//       'Order Assigned',
//       `Dear ${order.name},<br><br>
//       Your order with (ID: ${orderId}) has been assigned to a driver. The driver details are as follows:<br><br>
//        - Name: ${driverName}<br><br>
//        - Phone Number: ${driverPhoneNumber}<br><br>
//       Thank you for choosing TURTU.`
//     );
//     await sendEmail(order.email, 'Order Assigned', customerMessage);
//     logWithTracker('info', `Customer email sent for order ID ${orderId}`, trackerId,'pickup-drop-service');

//     // Send email to the driver
//     const driverMessage = createEmailTemplate('New Order Assigned', `
//       Dear ${driverName},<br><br>
//       You have been assigned a new order with (ID: ${orderId}). The order details are as follows:<br><br>
//        - Pickup Address: ${order.pickupAddress}<br><br>
//        - Drop Address: ${order.dropAddress}<br><br>
//        - Content: ${order.content}<br><br>
//        - Weight: ${order.weight}<br><br>
//        - Pickup Date: ${order.pickupDate}<br><br>
//        - Pickup Time: ${order.pickupTime}<br><br>
//        - Customer Phone Number: ${order.phoneNumber}<br><br>
//        - Please contact the customer if necessary.<br><br>
//       Thank you for choosing TURTU.
//     `);
//     await sendEmail(driverEmail, 'New Order Assigned to you', driverMessage);
//     logWithTracker('info', `Driver email sent to ${driverEmail} for order ID ${orderId}`, trackerId,'pickup-drop-service');

//     res.status(201).json({ message: 'Driver assigned successfully and emails sent!', assignedOrder, trackerId });
//   } catch (err) {
//     logWithTracker('error', `Error assigning order: ${err.message}`, trackerId,'pickup-drop-service');
//     res.status(500).json({ error: 'Error assigning order', trackerId });
//   }
// };

exports.assignOrder = async (req, res) => {
  const { orderId, driverPhoneNumber, driverName, userId } = req.body;
  const trackerId = req.trackerId;
  try {
    logWithTracker('info', `Assigning order (ID: ${orderId})...`, trackerId, 'pickup-drop-service');
    // Fetch the order and driver information in parallel
    const [order, driver] = await Promise.all([
      Order.findOne({ where: { id: orderId } }),
      DeliveryBoy.findOne({ where: { phonenumber: driverPhoneNumber } }),
    ]);
    if (!order) {
      logWithTracker('error', `Order with ID ${orderId} not found.`, trackerId, 'pickup-drop-service');
      return res.status(404).json({ error: 'Order not found', trackerId });
    }
    if (!driver) {
      logWithTracker('error', `Driver with phone number ${driverPhoneNumber} not found.`, trackerId, 'pickup-drop-service');
      return res.status(404).json({ error: 'Driver not found', trackerId });
    }
    // Generate OTP
    const otp = generateOTP();
    logWithTracker('info', 'Generated OTP...', trackerId, 'pickup-drop-service');
    // Create assigned order and update statuses in parallel
    const [assignedOrder] = await Promise.all([
      AssignedOrder.create({
        order_id: orderId,
        driver_id: userId,
        driver_name: driverName,
        driver_phone_number: driverPhoneNumber,
        status: 'active',
        phoneNumber: order.phoneNumber,
        name: order.name,
        email: order.email,
        pickupAddress: order.pickupAddress,
        dropAddress: order.dropAddress,
        content: order.content,
        weight: order.weight,
        pickupDate: order.pickupDate,
        pickupTime: order.pickupTime,
        dropTime: order.dropTime,
        createdAt: order.createdAt,
        receiverPhonenumber: order.receiverPhonenumber,
        receiverName: order.receiverName,
        senderAddress: order.senderAddress,
        receiverAddress: order.receiverAddress,
        deliveryInstructions: order.deliveryInstructions,
        otp,
      }),
      Order.update(
        { status: 'active', assignedDriver: driverName },
        { where: { id: orderId } }
      ),
      DeliveryBoy.update(
        { available: 'assigned' },
        { where: { phonenumber: driverPhoneNumber } }
      ),
    ]);
    logWithTracker('info', `Assigned order created and statuses updated for order ID ${orderId}`, trackerId, 'pickup-drop-service');
    // Send notifications (use a background job or queue for better performance)
    const [customerEmailSent, driverEmailSent] = await Promise.all([
      sendEmail(
        order.email,
        'Order Assigned',
        createEmailTemplate(
          'Order Assigned',
          `Dear ${order.name},<br><br>Your order with (ID: ${orderId}) has been assigned to a driver. Driver details:<br><br>- Name: ${driverName}<br>- Phone Number: ${driverPhoneNumber}<br><br>Thank you for choosing TURTU.`
        )
      ),
      sendEmail(
        driver.email,
        'New Order Assigned to you',
        createEmailTemplate(
          'New Order Assigned',
          `Dear ${driverName},<br><br>You have been assigned a new order (ID: ${orderId}). Details:<br>- Pickup Address: ${order.pickupAddress}<br>- Drop Address: ${order.dropAddress}<br>- Content: ${order.content}<br>- Weight: ${order.weight}<br>- Pickup Date: ${order.pickupDate}<br>- Pickup Time: ${order.pickupTime}<br>- Customer Phone: ${order.phoneNumber}<br><br>Please contact the customer if necessary.<br><br>Thank you for choosing TURTU.`
        )
      ),
    ]);
    logWithTracker('info', `Emails sent for order ID ${orderId}`, trackerId, 'pickup-drop-service');
    res.status(201).json({
      message: 'Driver assigned successfully and emails sent!',
      assignedOrder,
      trackerId,
    });
  } catch (err) {
    logWithTracker('error', `Error assigning order: ${err.message}`, trackerId, 'pickup-drop-service');
    res.status(500).json({ error: 'Error assigning order', trackerId });
  }
};


exports.fetchAssignedOrdersByDriver = async (req, res) => {
  const { driver_id } = req.params;
  const trackerId = req.trackerId; 
  try {
    logWithTracker('info', `Fetching assigned orders for driver...`, trackerId,'pickup-drop-service');
    const assignedOrders = await AssignedOrder.findAll({
      where: { driver_id },
    });
    
    if (assignedOrders.length > 0) {
      logWithTracker('info', `Found assigned orders for driver `, trackerId,'pickup-drop-service');
      res.status(200).json({assignedOrders,trackerId});
    } else {
      logWithTracker('warn', `No assigned orders found for driver .....`, trackerId,'pickup-drop-service');
      res.status(404).json({ message: 'No assigned orders found for this driver', trackerId });
    }
  } catch (error) {
    logWithTracker('error', `Error retrieving assigned orders for driver.. ${error.message}`, trackerId,'pickup-drop-service');
    res.status(500).json({ error: 'Failed to retrieve assigned orders', trackerId });
  }
};

// Controller function to fetch order by ID with logger
exports.fetchOrderById = async (req, res) => {
  const { orderId } = req.params;
  const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
  try {
    logWithTracker('info', `Fetching order by ID...`, trackerId,'pickup-drop-service');
    const order = await AssignedOrder.findOne({
      where: { order_id: orderId },
    });
    if (!order) {
      logWithTracker('warn', `Order not found for ID...`, trackerId,'pickup-drop-service');
      return res.status(404).json({ message: 'Order not found', trackerId });
    }
    logWithTracker('info', `Order details retrieved for ID..`, trackerId,'pickup-drop-service');
    res.json({order,trackerId});
  } catch (error) {
    logWithTracker('error', `Error fetching assigned order by ID  ${error.message}`, trackerId,'pickup-drop-service');
    res.status(500).json({ message: 'Error fetching assigned orders', trackerId });
  }
};

// exports.updateOrderStatus = async (req, res) => {
//   const { orderId, status, driverUserId } = req.body;
//   const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
//   logWithTracker('info', 'Update Order Status Request...', trackerId,'pickup-drop-service');
//   // Validate request parameters
//   if (!orderId || !status || !driverUserId) {
//     logWithTracker('warn', 'Missing required parameters:', { orderId, status, driverUserId }, trackerId,'pickup-drop-service');
//     return res.status(400).json({ message: 'Order ID, status, and driver user ID are required', trackerId });
//   }

//   // Validate the status field
//   if (!['active', 'picked', 'delivered'].includes(status)) {
//     logWithTracker('warn', `Invalid status value: ${status}`, trackerId,'pickup-drop-service');
//     return res.status(400).json({ message: 'Invalid status value', trackerId });
//   }

//   try {
//     logWithTracker('info', `Fetching current order and assigned order for orderId: ${orderId}`, trackerId,'pickup-drop-service');
//     // Fetch the current order and assigned order simultaneously
//     const [currentOrder, assignedOrder] = await Promise.all([
//       Order.findByPk(orderId),
//       AssignedOrder.findOne({ where: { order_id: orderId } })
//     ]);

//     // Check if the order or assigned order exists
//     if (!currentOrder || !assignedOrder) {
//       logWithTracker('warn', 'Order or assigned order not found for orderId....', trackerId,'pickup-drop-service');
//       return res.status(404).json({ message: 'Order or assigned order not found', trackerId });
//     }
//     // Extract customer details
//     const { email: customerEmail, name: customerName } = currentOrder;
//     const deliveryOtp = assignedOrder.otp;

//     // Ensure the order has not already been delivered
//     if (currentOrder.status === 'delivered') {
//       logWithTracker('warn', `Order already delivered for orderId.......`, trackerId,'pickup-drop-service');
//       return res.status(400).json({ message: 'Order is already delivered', trackerId });
//     }
//     // Prevent status reversal from 'picked' to 'active'
//     if (currentOrder.status === 'picked' && status === 'active') {
//       logWithTracker('warn', `Invalid status change: picked -> active for orderId: ${orderId}`, trackerId,'pickup-drop-service');
//       return res.status(400).json({ message: 'Cannot revert to active from picked', trackerId });
//     }
//     logWithTracker('info', `Updating order status to: ${status} for orderId...`, trackerId,'pickup-drop-service');

//     // Update the order status in both the Order and AssignedOrder tables
//     await Promise.all([
//       Order.update({ status }, { where: { id: orderId } }),
//       AssignedOrder.update({ status }, { where: { order_id: orderId } })
//     ]);

//     // Handle the case when the status is 'delivered'
//     if (status === 'delivered') {
//       logWithTracker('info', `Order delivered, updating driver availability for driverUserId: ${driverUserId}`, trackerId,'pickup-drop-service');      
//       // Update driver availability
//       const driver = await DeliveryBoy.findOne({ where: { employee_id: driverUserId } });
//       if (driver) {
//         await driver.update({ available: 'available' });
//         logWithTracker('info', `Driver availability updated: ${driver}`, trackerId,'pickup-drop-service');
//       }
//       const customerDeliveredMessage =  createEmailTemplate(
//         'Order Successfully Delivered',
//         `Dear ${customerName},<br>
//          We are delighted to inform you that your order (ID: ${orderId}) has been successfully delivered.<br>
//          Thank you for choosing TURTU! We hope you enjoy your purchase.`
//     );
//     await sendEmail(customerEmail, 'Order Successfully Delivered', customerDeliveredMessage);
//     logWithTracker('info', `Delivery confirmation email sent to customer: ${customerEmail}`, trackerId,'pickup-drop-service');
//   }
//     // Handle the case when the status is 'picked'
//     if (status === 'picked') {
//       logWithTracker('info', `Order picked, sending OTP email to customer: ${customerEmail}`, trackerId,'pickup-drop-service');
// // Prepare the body content with HTML formatting
//     const customerOtpBody = `
//     Dear ${customerName},<br><br>
//     Your order with (ID :${orderId}) has been picked up and is on its way.<br>
//     Please provide the following OTP to the delivery driver upon arrival:<br>
//     <strong style="font-size: 24px; color: #007bff;">OTP: ${deliveryOtp}</strong><br><br>
//     Thank you for choosing TURTU.
// `;
// // Create the email message using the HTML template
// const customerOtpMessage =  createEmailTemplate('Your Delivery OTP', customerOtpBody);
// // Send the email
// await sendEmail(customerEmail, 'Your Delivery OTP', customerOtpMessage);
// logWithTracker('info', `OTP email sent to customer: ${customerEmail}`, trackerId,'pickup-drop-service');
// }
// logWithTracker('info', 'Order status updated successfully', trackerId,'pickup-drop-service');
//     // Return a success response
//     res.status(200).json({ message: 'Order status updated successfully' });
//   } catch (err) {
//     // Log any error and return a 500 response
//     logWithTracker('error', `Error updating order status for orderId: ${orderId}: ${err.message}`, trackerId,'pickup-drop-service');
//     res.status(500).json({ message: 'Error updating order status', trackerId });
//   }
// };

exports.updateOrderStatus = async (req, res) => {
  const { orderId, status, driverUserId } = req.body;
  const trackerId = req.trackerId;
  logWithTracker('info', 'Update Order Status Request...', trackerId, 'pickup-drop-service');
  if (!orderId || !status || !driverUserId) {
    logWithTracker('warn', 'Missing required parameters', { orderId, status, driverUserId }, trackerId, 'pickup-drop-service');
    return res.status(400).json({ message: 'Order ID, status, and driver user ID are required', trackerId });
  }
  if (!['active', 'picked', 'delivered'].includes(status)) {
    logWithTracker('warn', `Invalid status value: ${status}`, trackerId, 'pickup-drop-service');
    return res.status(400).json({ message: 'Invalid status value', trackerId });
  }
  try {
    logWithTracker('info', `Fetching order and assigned order for orderId: ${orderId}`, trackerId, 'pickup-drop-service');
    // Fetch order and assigned order in parallel
    const [currentOrder, assignedOrder] = await Promise.all([
      Order.findByPk(orderId, { attributes: ['id', 'status', 'email', 'name'] }),
      AssignedOrder.findOne({ where: { order_id: orderId }, attributes: ['id', 'otp'] }),
    ]);
    if (!currentOrder || !assignedOrder) {
      logWithTracker('warn', 'Order or assigned order not found', trackerId, 'pickup-drop-service');
      return res.status(404).json({ message: 'Order or assigned order not found', trackerId });
    }
    if (currentOrder.status === 'delivered') {
      logWithTracker('warn', 'Order already delivered', trackerId, 'pickup-drop-service');
      return res.status(400).json({ message: 'Order is already delivered', trackerId });
    }
    if (currentOrder.status === 'picked' && status === 'active') {
      logWithTracker('warn', 'Cannot revert status to active from picked', trackerId, 'pickup-drop-service');
      return res.status(400).json({ message: 'Invalid status transition', trackerId });
    }
    logWithTracker('info', `Updating order and assigned order status to: ${status}`, trackerId, 'pickup-drop-service');
    // Update order and assigned order status in parallel
    await Promise.all([
      Order.update({ status }, { where: { id: orderId } }),
      AssignedOrder.update({ status }, { where: { order_id: orderId } }),
    ]);
    // Handle 'delivered' status
    if (status === 'delivered') {
      logWithTracker('info', 'Order delivered, updating driver availability', trackerId, 'pickup-drop-service');
      await DeliveryBoy.update({ available: 'available' }, { where: { employee_id: driverUserId } });

      logWithTracker('info', 'Sending delivery confirmation email to customer', trackerId, 'pickup-drop-service');
      const customerMessage = createEmailTemplate(
        'Order Successfully Delivered',
        `Dear ${currentOrder.name},<br>
         Your order (ID: ${orderId}) has been delivered successfully.<br>
         Thank you for choosing TURTU!`
      );
      sendEmail(currentOrder.email, 'Order Successfully Delivered', customerMessage).catch(err =>
        logWithTracker('error', `Failed to send delivery confirmation email: ${err.message}`, trackerId, 'pickup-drop-service')
      );
    }
    // Handle 'picked' status
    if (status === 'picked') {
      logWithTracker('info', 'Order picked, sending OTP to customer', trackerId, 'pickup-drop-service');
      const otpMessage = createEmailTemplate(
        'Your Delivery OTP',
        `Dear ${currentOrder.name},<br><br>
        Your order (ID: ${orderId}) has been picked up. Please provide the following OTP:<br>
        <strong>${assignedOrder.otp}</strong><br><br>
        Thank you for choosing TURTU.`
      );
      sendEmail(currentOrder.email, 'Your Delivery OTP', otpMessage).catch(err =>
        logWithTracker('error', `Failed to send OTP email: ${err.message}`, trackerId, 'pickup-drop-service')
      );
    }
    logWithTracker('info', 'Order status updated successfully', trackerId, 'pickup-drop-service');
    res.status(200).json({ message: 'Order status updated successfully', trackerId });
  } catch (err) {
    logWithTracker('error', `Error updating order status: ${err.message}`, trackerId, 'pickup-drop-service');
    res.status(500).json({ message: 'Error updating order status', trackerId });
  }
};


exports.verifyDeliveryOtp = async (req, res) => {
  const { orderId, providedOtp } = req.body;
  const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
  try {
    logWithTracker('info', `Verify Delivery OTP Request for orderId: ${orderId}`, trackerId,'pickup-drop-service');
    // Validate input parameters
    if (!orderId || !providedOtp) {
      logWithTracker('warn', `Missing required parameters: orderId: ${orderId}, providedOtp: ${providedOtp}`, trackerId,'pickup-drop-service');
      return res.status(400).json({ message: 'Order ID and OTP are required', trackerId });
    }
    // Fetch the assigned order
    logWithTracker('info', `Fetching assigned order for orderId: ${orderId}`, trackerId,'pickup-drop-service');
    const assignedOrder = await AssignedOrder.findOne({ where: { order_id: orderId } });
    // Check if the assigned order exists
    if (!assignedOrder) {
      logWithTracker('warn', `Assigned order not found for orderId: ${orderId}`, trackerId,'pickup-drop-service');
      return res.status(404).json({ message: 'Assigned order not found', trackerId });
    }
    // Validate the OTP
    if (assignedOrder.otp !== providedOtp) {
      logWithTracker('warn', `Invalid OTP provided for orderId: ${orderId}`, trackerId,'pickup-drop-service');
      return res.status(400).json({ message: 'Invalid OTP', trackerId });
    }
    // Clear the OTP after successful verification
    await AssignedOrder.update({ otp: null }, { where: { order_id: orderId } });
    logWithTracker('info', `OTP cleared for orderId: ${orderId}`, trackerId,'pickup-drop-service');
    // Respond with a success message
    res.status(200).json({ message: 'OTP verified successfully', valid: true, trackerId });
  } catch (err) {
    logWithTracker('error', `Error verifying OTP for orderId: ${orderId}: ${err.message}`, trackerId,'pickup-drop-service');
    res.status(500).json({ message: 'Error verifying OTP', valid: false , trackerId});
  }
};
