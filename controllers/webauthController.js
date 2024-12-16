require('dotenv').config();
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const moment = require('moment-timezone');
const randomize = require('randomatic');
const {sendOtpEmail, sendPasswordResetEmail } = require('../services/webemails');
const User = require('../models/user');
const { Op } = require('sequelize');
const { logWithTracker } = require('../services/loggerService');

const JWT_SECRET = process.env.JWT_SECRET; // Ensure you have this in your config file

const userSchema = Joi.object({
    username: Joi.string()
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
    phone_number: Joi.string().pattern(/^\d{10}$/).trim().required().messages({
        'string.pattern.base': 'Phone number must be 10 digits.',
        'any.required': 'Phone number is required.',
    }),
    password: Joi.string()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/)
        .required()
        .messages({
            'string.pattern.base': 'Password must be at least 8 characters long, include one uppercase letter and one number.',
            'any.required': 'Password is required.',
        }),
    confirm_password: Joi.string().valid(Joi.ref('password')).required().messages({
        'any.only': 'Passwords do not match.',
        'any.required': 'Confirm password is required.',
    }),
});

exports.register = async (req, res) => {
    const trackerId = req.trackerId; // Assuming trackerId is passed with the request
    logWithTracker('info', 'Registration request received', trackerId, 'website-service');
    // Validate request data using Joi
    const { error, value } = userSchema.validate(req.body, { abortEarly: false });
    if (error) {
        logWithTracker('warn', 'Validation failed', trackerId, 'website-service');
        return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors: error.details.map((err) => err.message),
            trackerId,
        });
    }
    const { username, email, phone_number, password } = value;
    try {
        logWithTracker('info', 'Checking for existing user with email or phone_number...', trackerId, 'website-service');
        const existingUser = await User.findOne({
            where: {
                [Op.or]: [{ email }, { phone_number }],
            },
        });
        if (existingUser) {
            logWithTracker('warn', 'User already exists with email or phone_number', trackerId, 'website-service');
            return res.status(400).json({ status: 'error', message: 'Email or phone number already exists.', trackerId });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = randomize('0', 6); // Generate a 6-digit OTP
        const otpExpiry = moment().add(5, 'minutes').toDate();
        const role = 'user';
        const newUser = await User.create({
            username,
            email,
            phone_number,
            password: hashedPassword,
            otp,
            otp_expiry: otpExpiry,
            is_verified: false,
            registration_date: new Date(),
            role,
        });
        logWithTracker('info', 'New user created successfully', trackerId, 'website-service');
        await sendOtpEmail(email, otp);

        res.status(201).json({ status: 'success', message: 'User registered successfully! Check your email for the OTP.', trackerId });
    } catch (error) {
        logWithTracker('error', `Error during registration process: ${error.message}`, trackerId, 'website-service');
        res.status(500).json({ status: 'error', message: 'Server error.', trackerId });
    }
};

// Resend OTP
exports.resendOtp = async (req, res) => {
    const { email } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Attempting to resend OTP for email: ${email}`, trackerId,'website-service');

    try {
        const user = await User.findOne({ where: { email } });

        if (!user) {
            logWithTracker('warn', `User not found with email: ${email}`, trackerId,'website-service');
            return res.status(404).json({ status: 'error', message: 'User not found.' , trackerId});
        }

        const otpExpiry = moment(user.otp_expiry).toDate();
        if (moment().isBefore(otpExpiry)) {
            logWithTracker('warn', `OTP is still valid for email: ${email}`, trackerId,'website-service');
            return res.status(400).json({ status: 'error', message: 'OTP is still valid. Please check your email.', trackerId });
        }

        const newOtp = randomize('0', 6);
        const newOtpExpiry = moment().add(10, 'minutes').toDate();

        user.otp = newOtp;
        user.otp_expiry = newOtpExpiry;
        await user.save(); // Update user with new OTP
        logWithTracker('info', `New OTP generated for email: ${email}`, trackerId,'website-service');
        await sendOtpEmail(email, newOtp);

        res.status(200).json({ status: 'success', message: 'New OTP has been sent to your email.', trackerId });
    } catch (error) {
        logWithTracker('error', `Error resending OTP for email: ${email} - ${error.message}`, trackerId,'website-service');
        res.status(500).json({ status: 'error', message: 'Server error.', trackerId });
    }
};

// Verify OTP
exports.verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Attempting to verify OTP for email: ${email}`, trackerId,'website-service');

    try {
        const user = await User.findOne({ where: { email } });

        if (!user) {
            logWithTracker('warn', `User not found with email: ${email}`, trackerId,'website-service');
            return res.status(404).json({ status: 'error', message: 'User not found.', trackerId });
        }

        if (user.otp !== otp) {
            logWithTracker('warn', `Invalid OTP provided for user: ${email}`, trackerId,'website-service');
            return res.status(400).json({ status: 'error', message: 'Invalid OTP.', trackerId });
        }

        if (moment().isAfter(user.otp_expiry)) {
            logWithTracker('warn', `OTP has expired for user: ${email}`, trackerId,'website-service');
            return res.status(400).json({ status: 'error', message: 'OTP has expired.' , trackerId});
        }

        user.is_verified = true; // Mark user as verified
        user.otp = null; // Clear OTP
        user.otp_expiry = null; // Clear OTP expiry
        await user.save(); // Update user
        logWithTracker('info', `OTP verified successfully for ${email}. User marked as verified.`, trackerId,'website-service');
        res.status(200).json({ status: 'success', message: 'User has been successfully verified.', trackerId });
    } catch (error) {
        logWithTracker('error', `Error verifying OTP for email: ${email} - ${error.message}`, trackerId,'website-service');
        res.status(500).json({ status: 'error', message: 'Server error.', trackerId });
    }
};

// User/Admin Login (Hardcoded admin email and password)
exports.login = async (req, res) => {
    const { email, password } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Attempting login for email: ${email}`, trackerId,'website-service');

    // Hardcoded admin credentials
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
    const ADMIN_PASS = process.env.ADMIN_PASS;

        // Validate input
        if (!email || !password) {
            logWithTracker('warn', 'Email or password not provided.', trackerId, 'website-service');
            return res.status(400).json({ 
                status: 'error', 
                message: 'Email and password are required.', 
                trackerId 
            });
        }
    try {
        // Check if it's the admin logging in
        if (email === ADMIN_EMAIL && password === ADMIN_PASS) {
            const adminToken = jwt.sign(
                { role: 'admin', email: ADMIN_EMAIL, username: 'Admin' },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            logWithTracker('info', `Admin login successful for email: ${email}`, trackerId,'website-service');
            return res.status(200).json({
                status: 'success',
                message: 'Admin login successful!',
                data: {
                    username: 'Admin',
                    email: ADMIN_EMAIL,
                    token: adminToken,
                },
                trackerId,
            });
        }

        // For regular users
        const user = await User.findOne({ where: { email } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            logWithTracker('warn', `Invalid email or password for ${email}`, trackerId,'website-service');
            return res.status(401).json({ status: 'error', message: 'Invalid email or password.', trackerId });
        }

        if (!user.is_verified) {
            logWithTracker('warn', `User ${email} is not verified.`, trackerId,'website-service');
            return res.status(403).json({ status: 'error', message: 'Email not verified. Please verify your email.' , trackerId});
        }

        const token = jwt.sign(
            { user_id: user.id, email: user.email, username: user.username, phone_number: user.phone_number },
            JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        logWithTracker('info', `Login successful for ${email}. Token generated.`, trackerId,'website-service');
        res.status(200).json({
            status: 'success',
            message: 'Login successful!',
             trackerId,
            data: {
                user_id: user.id,
                username: user.username,
                email: user.email,
                phone_number: user.phone_number,
                token,
            },
        });
    } catch (error) {
        logWithTracker('error', `Error during login for ${email}: ${error.message}`, trackerId,'website-service');
        res.status(500).json({ status: 'error', message: 'Server error.' , trackerId});
    }
};

// Request Password Reset (Send OTP)
exports.requestPasswordReset = async (req, res) => {
    const { email } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Requesting password reset for email: ${email}`, trackerId,'website-service');

    if (!email) {
        logWithTracker('warn', 'No email provided in the request.', trackerId,'website-service');
        return res.status(400).json({ status: 'error', message: 'Please provide an email address.' , trackerId});
    }

    try {
        const user = await User.findOne({ where: { email } });

        if (!user) {
            logWithTracker('warn', `No user found with email: ${email}`, trackerId,'website-service');
            return res.status(404).json({ status: 'error', message: 'Email not found.', trackerId });
        }

        // Generate OTP and set expiry
        const otp = randomize('0', 6); // Generates a 6-digit numeric OTP
        const otpExpiry = moment().add(5, 'minutes').toDate();

        logWithTracker('info', `Generated OTP for ${email} and expires at ${otpExpiry}`, trackerId,'website-service');

        // Save OTP and expiry in the database
        user.reset_otp = otp;
        user.reset_otp_expiry = otpExpiry;
        await user.save();

        // Send OTP to user's email
        await sendOtpEmail(email, otp);
        logWithTracker('info', `OTP sent to email: ${email}`, trackerId,'website-service');

        res.status(200).json({ status: 'success', message: 'An OTP has been sent to your email.', trackerId });
    } catch (error) {
        logWithTracker('error', `Error in requestPasswordReset for ${email}: ${error.message}`, trackerId,'website-service');
        console.error('Error in requestPasswordReset:', error);
        res.status(500).json({ status: 'error', message: 'Server error.', trackerId });
    }
};

// Verify OTP
exports.verifyResetOtp = async (req, res) => {
    const { email, otp } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request

    if (!email || !otp) {
        logWithTracker('warn', 'Missing email or OTP in the request.', trackerId,'website-service');
        return res.status(400).json({ status: 'error', message: 'Email and OTP are required.' , trackerId});
    }

    try {
        const user = await User.findOne({ where: { email } });

        if (!user) {
            logWithTracker('warn', `No user found with email: ${email}`, trackerId,'website-service');
            return res.status(404).json({ status: 'error', message: 'User not found.' , trackerId});
        }

        logWithTracker('info', `Verifying OTP for ${email}: Provided OTP and Stored OTP`, trackerId,'website-service');

        // Check if OTP is valid and not expired
        if (user.reset_otp !== otp || moment().isAfter(user.reset_otp_expiry)) {
            logWithTracker('warn', 'Invalid or expired OTP.', trackerId);
            return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP.', trackerId });
        }

        // Mark OTP as verified by clearing it
        user.reset_otp = null;
        user.reset_otp_expiry = null;
        user.is_otp_verified = true; // Optional: Mark OTP as verified
        await user.save();

        logWithTracker('info', `OTP successfully verified for ${email}.`, trackerId,'website-service');

        res.status(200).json({ status: 'success', message: 'OTP verified successfully.', trackerId });
    } catch (error) {
        logWithTracker('error', `Error in verifyResetOtp for ${email}: ${error.message}`, trackerId,'website-service');
        res.status(500).json({ status: 'error', message: 'Server error.', trackerId });
    }
};

// Reset Password
exports.resetPassword = async (req, res) => {
    const { email, new_password, confirm_password } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request

    if (!email || !new_password || !confirm_password) {
        logWithTracker('warn', 'Missing email, new password, or confirm password in the request.', trackerId,'website-service');
        return res.status(400).json({ status: 'error', message: 'All fields are required.', trackerId });
    }

    if (new_password !== confirm_password) {
        logWithTracker('warn', 'New password and confirm password do not match.', trackerId,'website-service');
        return res.status(400).json({ status: 'error', message: 'Passwords do not match.', trackerId });
    }

    try {
        const user = await User.findOne({ where: { email } });

        if (!user) {
            logWithTracker('warn', `No user found with email: ${email}`, trackerId,'website-service');
            return res.status(404).json({ status: 'error', message: 'User not found.', trackerId });
        }

        // Ensure OTP verification has been completed
        if (!user.is_otp_verified) {
            logWithTracker('warn', 'OTP verification not completed for this user.', trackerId,'website-service');
            return res.status(400).json({ status: 'error', message: 'OTP verification is required before resetting the password.', trackerId });
        }

        // Hash and update the new password
        const hashedPassword = await bcrypt.hash(new_password, 10);
        user.password = hashedPassword;
        user.is_otp_verified = false; // Reset OTP verification status
        await user.save();

        logWithTracker('info', `Password successfully reset for ${email}.`, trackerId,'website-service');

        res.status(200).json({ status: 'success', message: 'Password reset successful. You can now log in.', trackerId });
    } catch (error) {
        logWithTracker('error', `Error in resetPassword for ${email}: ${error.message}`, trackerId,'website-service');
        res.status(500).json({ status: 'error', message: 'Server error.', trackerId });
    }
};
