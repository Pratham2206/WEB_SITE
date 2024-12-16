require('dotenv').config();
const Employee = require('./../models/employee');
const Order = require('../models/order');
const DeliveryBoy = require('../models/deliveryBoy');
const AssignedOrder = require('../models/assignedOrder');
const {sendEmail, createEmailTemplate} = require('../services/emailConformations');
const sequelize = require('../config/sequelize');
const { Op } = require('sequelize');
const { logWithTracker } = require('../services/loggerService');

// Fetch unapproved users
exports.getUnapprovedUsers = async (req, res) => {
    const trackerId = req.trackerId;
    try {
        const unapprovedUsers = await Employee.findAll({ where: { isApproved: false } });
        logWithTracker('info', `Unapproved users found......`, trackerId,'pickup-drop-service');
        res.json({unapprovedUsers,trackerId});
    } catch (err) {
        logWithTracker('error', `Error fetching data: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Error fetching data',trackerId });
    }
};

// Accept a user
exports.acceptUser = async (req, res) => {
    const { id } = req.params;
    const trackerId = req.trackerId;
    try {
        logWithTracker('info', `Accepting user with ID: ${id}`, trackerId,'pickup-drop-service');
        const employee = await Employee.findByPk(id);
        if (!employee) {
            logWithTracker('warn', `User with ID ${id} not found`, trackerId,'pickup-drop-service');
            return res.status(404).json({ error: 'User not found' , trackerId});
        }
        logWithTracker('info', `Found employee: ${employee.name}, Role: ${employee.role}`, trackerId,'pickup-drop-service');
        if (employee.role === 'delivery boy') {
            try {
                logWithTracker('info', 'Moving data to delivery_boys table...', trackerId,'pickup-drop-service');
                await DeliveryBoy.create({
                    name: employee.name,
                    email: employee.email,
                    password: employee.password,
                    phonenumber: employee.phonenumber,
                    role: employee.role,
                    created_at: new Date(),
                    employee_id: employee.id,
                });
                logWithTracker('info', 'Delivery boy data moved successfully', trackerId,'pickup-drop-service');
            } catch (insertError) {
                logWithTracker('error', `Error moving data to delivery_boys table: ${insertError.message}`, trackerId,'pickup-drop-service');
                return res.status(500).json({ error: 'Failed to move data to delivery_boys table', trackerId });
            }
        }
        logWithTracker('info', `Approving user with ID: ${id}`, trackerId,'pickup-drop-service');
        employee.isApproved = true;
        await employee.save();

        logWithTracker('info', 'User approved successfully', trackerId,'pickup-drop-service');
        res.status(200).json({ message: 'Request accepted' });

        // Send approval email
        const ApprovedMessage = createEmailTemplate(
            'Your Account Has Been Approved',
            `Dear ${employee.name},<br><br>
            We’re thrilled to inform you that your application for the role of <strong>${employee.role.toUpperCase()}</strong> has been accepted by our admin!<br><br>
            You can now log in to your account and start engaging with our platform.<br><br>
            Welcome to the TURTU family!<br><br>`
        );
        await sendEmail (employee.email, 'Your Account Has Been Approved', ApprovedMessage);
        logWithTracker('info', `Approval email sent to: ${employee.email}`, trackerId,'pickup-drop-service');
    } catch (err) {
        logWithTracker('error', `Error updating request for user with ID: ${id} - ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Error updating request', trackerId });
    }
};
// Reject a user
exports.rejectUser = async (req, res) => {
    const { id } = req.params;
    const trackerId = req.trackerId;
    try {
        logWithTracker('info', `Rejecting user with ID: ${id}`, trackerId,'pickup-drop-service');
        const user = await Employee.findByPk(id);
        if (!user) {
            logWithTracker('warn', `User with ID ${id} not found`, trackerId,'pickup-drop-service');
            return res.status(404).json({ error: 'User not found' , trackerId});
        }
        logWithTracker('info', `Found user: ${user.name}, Role: ${user.role}`, trackerId,'pickup-drop-service');
        await Employee.destroy({ where: { id } });
        logWithTracker('info', `User with ID ${id} has been rejected and removed`, trackerId,'pickup-drop-service');
        res.status(200).json({ message: 'Request rejected' , trackerId});
   
        const RejectMessage = createEmailTemplate(
            'Your Account Application Status',
            `Dear ${user.name},<br><br>
            We regret to inform you that your application for the role of <strong>${user.role.toUpperCase()}</strong> has not been approved at this time.<br><br>
            We appreciate your interest in joining TURTU and encourage you to reapply in the future if the opportunity arises.<br><br>
            If you have any questions or need further assistance, please feel free to reach out.<br><br>
            Thank you for choosing TURTU.`
        );
        await sendEmail(user.email, 'Your Account Application Status', RejectMessage);
        logWithTracker('info', `Rejection email sent to: ${user.email}`, trackerId,'pickup-drop-service');
    } catch (err) {
        logWithTracker('error', `Error deleting request for user with ID: ${id} - ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Error deleting request', trackerId });
    }
};

// Fetch active or picked orders
exports.getAdminOrders = async (req, res) => {
    const trackerId = req.trackerId;
    logWithTracker('info', 'Fetching assigned orders with status "active" or "picked"...', trackerId,'pickup-drop-service');

    try {
        const orders = await AssignedOrder.findAll({ where: { status: ['active', 'picked'] } });
        logWithTracker('info', `Found ${orders.length} orders with status "active" or "picked"`, trackerId,'pickup-drop-service');
        res.json({orders, trackerId});
    } catch (err) {
        logWithTracker('error', `Error fetching assigned orders: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Error fetching assigned orders', trackerId });
    }
};


// Get bar data
exports.getBarData = async (req, res) => {
    const trackerId = req.trackerId;
    const view = req.query.view || 'weekly';
    let query;
    logWithTracker('info', `Fetching bar data with view: ${view}`, trackerId,'pickup-drop-service');
    if (view === 'monthly') {
        query = `
            SELECT DATE_FORMAT(createdAt, '%Y-%m') as date, COUNT(*) as count
            FROM orderManage.Orders
            WHERE createdAt >= NOW() - INTERVAL 12 MONTH
            GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
            ORDER BY DATE_FORMAT(createdAt, '%Y-%m') DESC;
        `;
        logWithTracker('info', `Query for monthly view: ${query}`, trackerId,'pickup-drop-service');
    } else if (view === 'yearly') {
        query = `
            SELECT YEAR(createdAt) as date, COUNT(*) as count
            FROM orderManage.Orders
            WHERE createdAt >= NOW() - INTERVAL 5 YEAR
            GROUP BY YEAR(createdAt)
            ORDER BY YEAR(createdAt) DESC;
        `;
        logWithTracker('info', `Query for yearly view: ${query}`, trackerId,'pickup-drop-service');
    } else {
        query = `
          SELECT DATE(createdAt) as date, COUNT(*) as count
          FROM orderManage.Orders
          WHERE createdAt >= NOW() - INTERVAL 6 DAY
          GROUP BY DATE(createdAt)
          ORDER BY DATE(createdAt) DESC;
        `;
        logWithTracker('info', `Query for weekly view: ${query}`, trackerId,'pickup-drop-service');
    }
    try {
        const [results] = await sequelize.query(query);
        logWithTracker('info', `Fetched results: ${JSON.stringify(results)}`, trackerId,'pickup-drop-service');
        res.json({results, trackerId});
    } catch (err) {
        logWithTracker('error', `Error fetching bar data: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'An error occurred while fetching data', trackerId });
    }
};

// Order history with counts
exports.getOrderHistory = async (req, res) => {
    const trackerId = req.trackerId;
    try {
        logWithTracker('info', 'Fetching order count with status active, picked, pending, delivered...', trackerId,'pickup-drop-service');
        const orderCount = await Order.count({ where: { status: ['active', 'picked', 'pending', 'delivered'] } });
        
        logWithTracker('info', 'Fetching assigned orders with status delivered...', trackerId,'pickup-drop-service');
        const orders = await AssignedOrder.findAll({ where: { status: 'delivered' } });
        
        logWithTracker('info', `Fetched order count: ${orderCount}, Fetched orders: ${orders.length}`, trackerId,'pickup-drop-service');
        res.json({ orderCount, orders , trackerId});
    } catch (err) {
        logWithTracker('error', `Error fetching assigned orders: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Error fetching assigned orders', trackerId });
    }
};

// Fetch a specific order by ID
exports.getOrderById = async (req, res) => {
    const trackerId = req.trackerId;
    const { orderId } = req.params;
    try {
        logWithTracker('info', `Fetching order with ID: ${orderId}`, trackerId,'pickup-drop-service');
        const order = await AssignedOrder.findOne({ where: { order_id: orderId } });
        
        if (!order) {
            logWithTracker('info', `Order with ID: ${orderId} not found`, trackerId,'pickup-drop-service');
            return res.status(404).json({ message: 'Order not found', trackerId });
        }

        logWithTracker('info', `Order with ID: ${orderId} found`, trackerId,'pickup-drop-service');
        res.json({order,trackerId});
    } catch (error) {
        logWithTracker('error', `Error fetching assigned orders: ${error.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ message: 'Error fetching assigned orders', trackerId });
    }
};

// Filter orders by date
exports.filterOrdersByDate = async (req, res) => {
    const trackerId = req.trackerId;
    const { startDate, endDate } = req.query;
    const filter = {};
  
    try {
        logWithTracker('info', `Filtering orders between ${startDate} and ${endDate}`, trackerId,'pickup-drop-service');
        const start = new Date(startDate);
        const end = new Date(endDate);
  
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            logWithTracker('warn', 'Invalid date format', trackerId,'pickup-drop-service');
            return res.status(400).json({ error: 'Invalid date format', trackerId });
        }
  
        if (start > end) {
            logWithTracker('warn', 'End date must be greater than start date', trackerId,'pickup-drop-service');
            return res.status(400).json({ error: 'End date must be greater than start date', trackerId });
        }
  
        filter.createdAt = { [Op.between]: [start, end] };
  
        const orders = await AssignedOrder.findAll({ where: filter });
        logWithTracker('info', `Fetched ${orders.length} filtered orders`, trackerId,'pickup-drop-service');
        res.json({orders,trackerId});
    } catch (err) {
        logWithTracker('error', `Error fetching filtered orders: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Error fetching filtered orders', trackerId });
    }
};


// Fetch registered users
exports.getRegisteredUsers = async (req, res) => {
    const trackerId = req.trackerId;
    try {
        logWithTracker('info', 'Fetching registered users...', trackerId,'pickup-drop-service');
        const userCount = await Employee.count();
        logWithTracker('info', `User count fetched: ${userCount}`, trackerId,'pickup-drop-service');

        const users = await Employee.findAll();
        logWithTracker('info', `Found ${users.length} registered users`, trackerId,'pickup-drop-service');
        res.json({ userCount, users ,trackerId});
    } catch (err) {
        logWithTracker('error', `Error fetching users: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Error fetching users', trackerId });
    }
};