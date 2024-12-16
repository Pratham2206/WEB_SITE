require('dotenv').config();
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const Employee = require('../models/employee');
const Token = require('../models/token'); 
const { sendEmail, createEmailTemplate} = require('../services/emailConformations'); // Adjust the path as needed
const { logWithTracker } = require('../services/loggerService');



// Constants
const OTP_EXPIRATION_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds
const OTP_RESEND_TIME = 3 * 60 * 1000; // 3 minutes in milliseconds
const JWT_EXPIRATION = '1hr';


// Utility function to generate a token
const generateToken = (payload, trackerId) => {
  const secretKey = process.env.JWT_SECRET;
  if (!secretKey) {
    logWithTracker('error', 'JWT secret is not defined', trackerId,'pickup-drop-service');
    throw new Error('JWT secret is not defined');
  }

  logWithTracker('info', 'Generating JWT token', trackerId,'pickup-drop-service');
  return jwt.sign(payload, secretKey, { expiresIn: JWT_EXPIRATION });
};

// Define Joi schema for validation
const registerUserSchema = Joi.object({
  name: Joi.string()
  .trim() // Removes leading and trailing spaces
  .pattern(/^(?!\s*$)[a-zA-Z\s]+$/)
  .required()
  .messages({
    'string.pattern.base': 'Username must contain only letters and spaces, and cannot be empty or just spaces.',
    'any.required': 'Username is required.',
  }),

  email: Joi.string().email().trim().required().messages({
    'string.email': 'Invalid email format.',
    'any.required': 'Email is required.',
  }),
  phonenumber: Joi.string().pattern(/^\d{10}$/).trim().required().messages({
    'string.pattern.base': 'Phone number must be a valid 10-digit number.',
    'any.required': 'Phone number is required.',
  }),
  password: Joi.string()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/)
    .required()
    .messages({
      'string.pattern.base': 'Password must be at least 8 characters, include an uppercase letter, and a number.',
      'any.required': 'Password is required.',
    }),
  role: Joi.string().valid('caller', 'assigner', 'delivery boy').required().messages({
    'any.only': 'Role must be either "caller", "delivery boy", or "assigner".',
    'any.required': 'Role is required.',
  }),
});

const registerUser = async (req, res) => {
  const trackerId = req.trackerId;
  logWithTracker('info', 'Registering user', trackerId, 'pickup-drop-service');

  // Validate request body
  const { error, value } = registerUserSchema.validate(req.body, { abortEarly: false });
  if (error) {
    logWithTracker('warn', 'Validation failed', trackerId, 'pickup-drop-service');
    return res.status(400).json({
      message: 'Validation failed',
      errors: error.details.map((err) => err.message),
      trackerId,
    });
  }

  const { name, email, phonenumber, password, role } = value;

  try {
    const existingUserByEmail = await Employee.findOne({ where: { email } });
    if (existingUserByEmail) {
      logWithTracker('warn', `Email ${email} is already in use.`, trackerId, 'pickup-drop-service');
      return res.status(400).json({ message: 'Email is already in use.', trackerId });
    }

    // Hash password
    logWithTracker('info', `Hashing password for ${email}`, trackerId, 'pickup-drop-service');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP and expiration time
    const otp = crypto.randomInt(100000, 999999);
    const otpExpires = new Date(Date.now() + OTP_EXPIRATION_TIME);

    // Create new user in the database
    logWithTracker('info', `Creating new user in the database for ${email}`, trackerId, 'pickup-drop-service');
    const newUser = await Employee.create({
      name,
      email,
      password: hashedPassword,
      role,
      phonenumber,
      otp,
      otpExpires,
    });

    logWithTracker('info', `User created with ID: ${newUser.id}`, trackerId, 'pickup-drop-service');

    // Send OTP email
    const otpMessage = createEmailTemplate(
      'Your OTP Code',
      `Dear ${name},<br><br>Your OTP code is : <strong style="font-size: 24px; color: #007bff;">${otp}</strong><br> Please use this code to verify your account.`
    );
    await sendEmail(email, 'Your OTP Code', otpMessage);

    // Respond with success
    logWithTracker('info', `Registration successful for user: ${email}`, trackerId, 'pickup-drop-service');
    return res.status(201).json({
      message: 'User registered successfully. Please check your email for OTP.',
      user: {
        id: newUser.id,
        name,
        email,
        role,
        phonenumber,
      },
      trackerId,
    });
  } catch (error) {
    logWithTracker('error', `Error during registration: ${error.message}`, trackerId, 'pickup-drop-service');

    if (error.name === 'SequelizeUniqueConstraintError') {
      logWithTracker('warn', 'Email or phone number already in use.', trackerId, 'pickup-drop-service');
      return res.status(400).json({ message: 'Email or phone number already in use.', trackerId });
    }

    logWithTracker('error', 'Internal server error during registration process.', trackerId, 'pickup-drop-service');
    return res.status(500).json({ message: 'Internal server error. Please try again later.', trackerId });
  }
};

// Controller function to verify OTP
const verifyOtp = async (req, res) => {
  const trackerId = req.trackerId;
  const { email, otp } = req.body;

  logWithTracker('info', `Verifying OTP for email: ${email}`, trackerId,'pickup-drop-service');

  try {
    const user = await Employee.findOne({ where: { email } });

    if (user && user.otp === otp && new Date() < user.otpExpires) {
      // Clear OTP after verification
      await user.update({ otp: null, otpExpires: null, isVerified: true });

      logWithTracker('info', `OTP verified successfully for ${email}`, trackerId,'pickup-drop-service');
      return res.status(200).json({ message: 'OTP verified successfully', trackerId });
    } else {
      logWithTracker('warn', `Invalid or expired OTP for ${email}`, trackerId,'pickup-drop-service');
      return res.status(400).json({ error: 'Invalid or expired OTP', trackerId });
    }
  } catch (error) {
    logWithTracker('error', `Error verifying OTP for ${email}: ${error.message}`, trackerId,'pickup-drop-service');
    return res.status(500).json({ error: 'Internal server error. Please try again later.', trackerId });
  }
};

// Controller function to login a user
const loginUser = async (req, res) => {
  const trackerId = req.trackerId;
  const { email, password } = req.body;

  logWithTracker('info', `Attempting login for: ${email}`, trackerId,'pickup-drop-service');

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const ADMIN_PASS = process.env.ADMIN_PASS;

    // Validate input
    if (!email || !password) {
      logWithTracker('warn', 'Missing email or password.', trackerId, 'pickup-drop-service');
      return res.status(400).json({
        error: 'Email and password are required.',
        trackerId,
      });
    }
  try {
    // Admin login
    if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
      const token = generateToken({ email: ADMIN_EMAIL, role: 'admin' }, trackerId);
      logWithTracker('info', 'Admin login successful', trackerId,'pickup-drop-service');

      return res.json({
        token,
        trackerId,
        user: {
          id: '001',
          name: 'Admin',
          email: ADMIN_EMAIL,
          role: 'admin',
          isApproved: true,
        },
      });
    }

    // Regular user login
    const user = await Employee.findOne({ where: { email } });
    if (user && await bcrypt.compare(password, user.password)) {
      const token = generateToken({
        id: user.id,
        email: user.email,
        role: user.role,
        phonenumber: user.phonenumber,
      }, trackerId);

      logWithTracker('info', `User login successful for: ${email}`, trackerId,'pickup-drop-service');
      return res.json({
        token,
        trackerId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isApproved: user.isApproved,
          phonenumber: user.phonenumber,
        },
      });
    }

    // Invalid login or unapproved user
    logWithTracker('warn', `Invalid credentials or unapproved user: ${email}`, trackerId,'pickup-drop-service');
    return res.status(400).json({ error: 'Invalid credentials / wait for admin approval',trackerId });

  } catch (error) {
    logWithTracker('error', `Error during login for ${email}: ${error.message}`, trackerId,'pickup-drop-service');
    return res.status(500).json({ error: 'Internal server error. Please try again later.',trackerId });
  }
};

// Controller function to logout a user
const logoutUser = async (req, res) => {
  const trackerId = req.trackerId;
  const token = req.headers['authorization']?.split(' ')[1];
  const userId = req.user.id;

  logWithTracker('info', `Logging out user with ID: ${userId}`, trackerId,'pickup-drop-service');

  if (token) {
    try {
      const tokenRecord = await Token.findOne({ where: { token } });

      if (!tokenRecord) {
        await Token.create({
          token,
          userId: userId,
          expiresAt: new Date(Date.now() + 3600000), // 1 hour expiry
          isBlacklisted: true,
        });
        logWithTracker('info', 'Logged out and token blacklisted successfully', trackerId,'pickup-drop-service');
        return res.json({ message: 'Logged out and token blacklisted successfully', trackerId });
      }

      logWithTracker('warn', 'Token already blacklisted', trackerId,'pickup-drop-service');
      return res.json({ message: 'Token already blacklisted', trackerId });
    } catch (error) {
      logWithTracker('error', `Error logging out user with ID: ${userId} - ${error.message}`, trackerId,'pickup-drop-service');
      return res.status(500).json({ error: 'Internal server error. Please try again later.', trackerId });
    }
  } else {
    logWithTracker('warn', 'Token not provided for logout', trackerId,'pickup-drop-service');
    return res.status(400).json({ error: 'Token not provided', trackerId });
  }
};

// Function to delete unverified users
const deleteUnverifiedUsers = async () => {
  const trackerId = 'deleteUnverifiedUsersProcess'; // Use a constant ID or generate dynamically
  const now = new Date();

  logWithTracker('info', 'Checking for unverified users...', trackerId,'pickup-drop-service');

  try {
    const expiredUsers = await Employee.findAll({
      where: {
        isVerified: false,
        createdAt: { [Op.lt]: new Date(now - OTP_RESEND_TIME) },
      },
      limit: 100,
    });

    if (expiredUsers.length > 0) {
      await Promise.all(expiredUsers.map(user => user.destroy()));
      logWithTracker('info', `Deleted ${expiredUsers.length} unverified users`, trackerId,'pickup-drop-service');
    } else {
      logWithTracker('info', 'No unverified users to delete', trackerId,'pickup-drop-service');
    }
  } catch (error) {
    logWithTracker('error', `Error deleting unverified users: ${error.message}`, trackerId,'pickup-drop-service');
  }
};

// Function to clean up blacklisted tokens
const cleanupAllBlacklistedTokens = async () => {
  const trackerId = 'cleanupBlacklistedTokensProcess'; // Use a constant ID or generate dynamically
  try {
    const result = await Token.destroy({
      where: {
        isBlacklisted: 1,
      },
    });

    logWithTracker('info', `Deleted ${result} blacklisted tokens`, trackerId,'pickup-drop-service');
  } catch (err) {
    logWithTracker('error', `Error cleaning up blacklisted tokens: ${err.message}`, trackerId,'pickup-drop-service');
  }
};


setInterval(deleteUnverifiedUsers, OTP_RESEND_TIME);
setInterval(cleanupAllBlacklistedTokens, 3600 * 1000);

module.exports = {
  registerUser,
  verifyOtp,
  loginUser,
  logoutUser,
};
