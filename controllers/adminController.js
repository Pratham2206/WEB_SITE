require('dotenv').config();
const Employee = require('./../models/employee');
const Order = require('../models/order');
const DeliveryBoy = require('../models/deliveryBoy');
const AssignedOrder = require('../models/assignedOrder');
const {sendEmail, createEmailTemplate} = require('../services/emailConformations');
const sequelize = require('../config/sequelize');
const { Op } = require('sequelize');

// Fetch unapproved users
exports.getUnapprovedUsers = async (req, res) => {
    try {
        console.log('Fetching unapproved users...');
        const unapprovedUsers = await Employee.findAll({ where: { isApproved: false } });
        console.log('Unapproved users found:', unapprovedUsers);
        res.json(unapprovedUsers);
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).json({ error: 'Error fetching data' });
    }
};

// Accept a user
exports.acceptUser = async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`Accepting user with ID: ${id}`);
        const employee = await Employee.findByPk(id);
        if (!employee) {
            console.log(`User with ID ${id} not found`);
            return res.status(404).json({ error: 'User not found' });
        }
        console.log(`Found employee: ${employee.name}, Role: ${employee.role}`);
        if (employee.role === 'delivery boy') {
            try {
                console.log('Moving data to delivery_boys table...');
                await DeliveryBoy.create({
                    name: employee.name,
                    email: employee.email,
                    password: employee.password,
                    phonenumber: employee.phonenumber,
                    role: employee.role,
                    created_at: new Date(),
                    employee_id: employee.id,
                });
                console.log('Delivery boy data moved successfully');
            } catch (insertError) {
                console.error('Error moving data to delivery_boys table:', insertError);
                return res.status(500).json({ error: 'Failed to move data to delivery_boys table' });
            }
        }
        console.log(`Approving user with ID: ${id}`);
        employee.isApproved = true;
        await employee.save();

        console.log('User approved successfully');
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
        console.log(`Approval email sent to: ${employee.email}`);
    } catch (err) {
        console.error('Error updating request:', err);
        res.status(500).json({ error: 'Error updating request' });
    }
};
// Reject a user
exports.rejectUser = async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`Rejecting user with ID: ${id}`);
        const user = await Employee.findByPk(id);
        if (!user) {
            console.log(`User with ID ${id} not found`);
            return res.status(404).json({ error: 'User not found' });
        }
        console.log(`Found user: ${user.name}, Role: ${user.role}`);
        await Employee.destroy({ where: { id } });
        console.log(`User with ID ${id} has been rejected and removed`);
        res.status(200).json({ message: 'Request rejected' });
   
        const RejectMessage = createEmailTemplate(
            'Your Account Application Status',
            `Dear ${user.name},<br><br>
            We regret to inform you that your application for the role of <strong>${user.role.toUpperCase()}</strong> has not been approved at this time.<br><br>
            We appreciate your interest in joining TURTU and encourage you to reapply in the future if the opportunity arises.<br><br>
            If you have any questions or need further assistance, please feel free to reach out.<br><br>
            Thank you for choosing TURTU.`
        );
        await sendEmail(user.email, 'Your Account Application Status', RejectMessage);
        console.log(`Rejection email sent to: ${user.email}`);
    } catch (err) {
        console.error('Error deleting request:', err);
        res.status(500).json({ error: 'Error deleting request' });
    }
};

// Fetch active or picked orders
exports.getAdminOrders = async (req, res) => {
    try {
        console.log('Fetching assigned orders with status "active" or "picked"...');
        const orders = await AssignedOrder.findAll({ where: { status: ['active', 'picked'] } });
        console.log(`Found ${orders.length} orders with status "active" or "picked"`);
        res.json(orders);
    } catch (err) {
        console.error('Error fetching assigned orders:', err);
        res.status(500).json({ error: 'Error fetching assigned orders' });
    }
};

// Get bar data
exports.getBarData = async (req, res) => {
    const view = req.query.view || 'weekly';
    let query;
  
    console.log(`Fetching bar data with view: ${view}`);

    if (view === 'monthly') {
        query = `
            SELECT DATE_FORMAT(createdAt, '%Y-%m') as date, COUNT(*) as count
            FROM orderManage.Orders
            WHERE createdAt >= NOW() - INTERVAL 12 MONTH
            GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
            ORDER BY DATE_FORMAT(createdAt, '%Y-%m') DESC;
        `;
        console.log('Query for monthly view:', query);
    } else if (view === 'yearly') {
        query = `
            SELECT YEAR(createdAt) as date, COUNT(*) as count
            FROM orderManage.Orders
            WHERE createdAt >= NOW() - INTERVAL 5 YEAR
            GROUP BY YEAR(createdAt)
            ORDER BY YEAR(createdAt) DESC;
        `;
        console.log('Query for yearly view:', query);
    } else {
        query = `
          SELECT DATE(createdAt) as date, COUNT(*) as count
          FROM orderManage.Orders
          WHERE createdAt >= NOW() - INTERVAL 6 DAY
          GROUP BY DATE(createdAt)
          ORDER BY DATE(createdAt) DESC;
        `;
        console.log('Query for weekly view:', query);
    }
    try {
        const [results] = await sequelize.query(query);
        console.log('Fetched results:', results);
        res.json(results);
    } catch (err) {
        console.error(err); 
        res.status(500).json({ error: 'An error occurred while fetching data' });
    }
};

// Order history with counts
exports.getOrderHistory = async (req, res) => {
    try {
        console.log('Fetching order count with status active, picked, pending, delivered...');
        const orderCount = await Order.count({ where: { status: ['active', 'picked', 'pending', 'delivered'] } });
        console.log('Fetching assigned orders with status delivered...');  
        const orders = await AssignedOrder.findAll({ where: { status: 'delivered' } });
        res.json({ orderCount, orders });
    } catch (err) {
        console.error('Error fetching assigned orders:', err);
        res.status(500).json({ error: 'Error fetching assigned orders' });
    }
};

// Fetch a specific order
exports.getOrderById = async (req, res) => {
    const { orderId } = req.params;
    try {
        console.log(`Fetching order with ID: ${orderId}`);
        const order = await AssignedOrder.findOne({ where: { order_id: orderId } });
        if (!order) {
            console.log(`Order with ID: ${orderId} not found`);
            return res.status(404).json({ message: 'Order not found' });
        }
        console.log(`Order with ID: ${orderId} found`);
        res.json(order);
    } catch (error) {
        console.error('Error fetching assigned orders:', error);
        res.status(500).json({ message: 'Error fetching assigned orders' });
    }
};

// Filter orders by date
exports.filterOrdersByDate = async (req, res) => {
    const { startDate, endDate } = req.query;
    const filter = {};
  
    try {
        console.log(`Filtering orders between ${startDate} and ${endDate}`);
        const start = new Date(startDate);
        const end = new Date(endDate);
  
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            console.log('Invalid date format');
            return res.status(400).json({ error: 'Invalid date format' });
        }
  
        if (start > end) {
            console.log('End date must be greater than start date');
            return res.status(400).json({ error: 'End date must be greater than start date' });
        }
  
        filter.createdAt = { [Op.between]: [start, end] };
  
        const orders = await AssignedOrder.findAll({ where: filter });
        res.json(orders);
    } catch (err) {
        console.error('Error fetching filtered orders:', err);
        res.status(500).json({ error: 'Error fetching filtered orders' });
    }
};

// Fetch registered users
exports.getRegisteredUsers = async (req, res) => {
    try {
        console.log('Fetching registered users...');
        const userCount = await Employee.count();
        console.log(`User count fetched: ${userCount}`);

        const users = await Employee.findAll();
        console.log(`Found ${users.length} registered users`);
        res.json({ userCount, users });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Error fetching users' });
    }
};
