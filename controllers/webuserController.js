const Joi = require('joi');
const Contact = require('../models/contact');
require('dotenv').config();
const CareerApplication = require('../models/careerApplication');
const { sendCareerEmail, sendQueryContactEmail } = require('../services/webemails');
const multer = require('multer');
const crypto = require('crypto');
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } }); // Set limit to 5 MB
const { tokenRequired, allowedFile } = require('../middlewares/webMiddleware'); // Import your middleware
const { logWithTracker } = require('../services/loggerService');
const AWS = require('aws-sdk');
const { PDFDocument } = require('pdf-lib');


// Define Joi schema for validating email and phone number
const careerApplicationSchema = Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Invalid email format.',
      'any.required': 'Email is required.',
    }),
    phone_number: Joi.string()
      .pattern(/^\d{10}$/)
      .required()
      .messages({
        'string.pattern.base': 'Phone number must be a valid 10-digit number.',
        'any.required': 'Phone number is required.',
      }),
    profile: Joi.string().required().messages({
      'any.required': 'Profile is required.',
    }),
  });
  
  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
  });
  
  // Helper function to compress PDF
const compressPdf = async (pdfBuffer) => {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const compressedPdf = await pdfDoc.save();
  return compressedPdf;
};

// Encryption Setup
const algorithm = 'aes-256-cbc';
const secretKey = process.env.ENCRYPTION_KEY; // A 32-character key stored in .env
const iv = crypto.randomBytes(16);

// Encrypt Function
function encrypt(text) {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

// Decrypt Function
function decrypt(text) {
  const [ivHex, encryptedText] = text.split(':');
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(Buffer.from(encryptedText, 'hex'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

exports.careerApplication = [
  tokenRequired,
  upload.single('resume'), // Middleware to handle the file upload
  async (req, res) => {
    const { email, phone_number, profile } = req.body;
    const resume = req.file;
    const trackerId = req.trackerId;

    try {
      logWithTracker('info', 'Validating form data', trackerId, 'website-service');

      // Validate form data
      const { error } = careerApplicationSchema.validate({ email, phone_number, profile });
      if (error) {
        logWithTracker('warn', `Validation failed: ${error.message}`, trackerId, 'website-service');
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.details.map((err) => err.message),
          trackerId,
        });
      }

      // Check for file
      if (!resume) {
        logWithTracker('warn', 'Resume file is missing', trackerId, 'website-service');
        return res.status(400).json({
          status: 'error',
          message: 'Resume file is required.',
          trackerId,
        });
      }

      // Validate file type and size
      if (resume.mimetype !== 'application/pdf' || resume.size > 5 * 1024 * 1024) { // Example: Max 5MB
        logWithTracker('warn', 'Invalid file type or size', trackerId, 'website-service');
        return res.status(400).json({
          status: 'error',
          message: 'Only PDF files under 5MB are allowed.',
          trackerId,
        });
      }

      // Compress the PDF before uploading
      const compressedBuffer = await compressPdf(resume.buffer);

      // Upload to S3
      const userId = req.user.user_id;
      const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${userId}-${Date.now()}-${resume.originalname}`,
        Body: compressedBuffer,
        ContentType: 'application/pdf',
      };
      const uploadResult = await s3.upload(uploadParams).promise();

      // Encrypt S3 URL
      const encryptedResumeUrl = encrypt(uploadResult.Location);
      logWithTracker('info', `Encrypted S3 URL generated`, trackerId, 'website-service');

      // Save application data
      const applicationData = {
        user_id: userId,
        email,
        phone_number,
        profile,
        resume_url: encryptedResumeUrl, // Encrypted URL
        resume_filename: resume.originalname,
      };
      await CareerApplication.create(applicationData);
      logWithTracker('info', `Application data saved to database`, trackerId, 'website-service');

      // Send confirmation email
      await sendCareerEmail(email, req.user.username, profile, resume.originalname, uploadResult.Location);

      return res.status(201).json({
        status: 'success',
        message: 'Application submitted successfully!',
        trackerId,
      });
    } catch (error) {
      logWithTracker('error', `Error occurred: ${error.message}`, trackerId, 'website-service');
      return res.status(500).json({
        status: 'error',
        message: 'An error occurred while submitting your application.',
        trackerId,
      });
    }
  },
];

// exports.getCareerApplications = async (req, res) => {
//   const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
//   logWithTracker('info', 'Fetching all career applications', trackerId, 'website-service');

//   try {
//     // Fetch all career applications from the database
//     const applications = await CareerApplication.findAll();

//     // If you store resume URL and filename, include them in the response
//     const applicationsWithResume = applications.map(async (application) => {
//       if (!application.resume_url) {
//         logWithTracker('warn', `Resume URL missing for application ID: ${application.id}`, trackerId, 'website-service');
//         return null; // Skip this application if no resume URL
//       }

//       const decryptedUrl = decrypt(application.resume_url);
//       if (!decryptedUrl) {
//         logWithTracker('warn', `Failed to decrypt resume URL for application ID: ${application.id}`, trackerId, 'website-service');
//         return null; // Skip this application if decryption fails
//       }

//       logWithTracker('info', `Decrypted S3 URL: ${decryptedUrl}`, trackerId, 'website-service');

//       try {
//         // Ensure decrypted URL is in the expected format before splitting
//         const urlParts = decryptedUrl.split('/');
//         const bucketName = process.env.AWS_BUCKET_NAME; // Assuming bucket name is static
//         const key = urlParts.slice(3).join('/'); // Extract the Key (after bucket name)

//         logWithTracker('info', `Fetching resume from S3: ${bucketName}/${key}`, trackerId, 'website-service');

//         // Get the object from S3
//         const params = {
//           Bucket: bucketName,
//           Key: key,
//         };

//         // Stream the S3 file
//         const s3Stream = s3.getObject(params).createReadStream();

//         // Set the headers for PDF download
//         const resumeFilename = application.resume_filename || 'resume.pdf';

//         return {
//           ...application.toJSON(), // Convert Sequelize instance to plain object
//           resume_stream: s3Stream, // S3 file stream
//           resume_filename: resumeFilename, // Original file name
//         };
//       } catch (splitError) {
//         logWithTracker('error', `Error processing resume URL for application ID: ${application.id} - ${splitError.message}`, trackerId, 'website-service');
//         return null; // Skip this application if there's an error processing the URL
//       }
//     });

//     // Filter out any applications that returned null due to errors
//     const validApplications = (await Promise.all(applicationsWithResume)).filter((application) => application !== null);

//     logWithTracker('info', 'Fetched all career applications', trackerId, 'website-service');
//     return res.json({ status: 'success', data: validApplications, trackerId });
//   } catch (error) {
//     logWithTracker('error', `Error fetching career applications: ${error.message}`, trackerId, 'website-service');
//     return res.status(500).json({ status: 'error', message: 'An error occurred while fetching applications.', trackerId });
//   }
// };

exports.getCareerApplications = async (req, res) => {
  const trackerId = req.trackerId;

  logWithTracker('info', 'Fetching all career applications', trackerId, 'website-service');

  try {
    // Fetch all career applications
    const applications = await CareerApplication.findAll();
    if (!applications.length) {
      logWithTracker('warn', 'No career applications found', trackerId, 'website-service');
      return res.json({ status: 'success', data: [], trackerId });
    }

    // Process each application
    const applicationsWithResume = await Promise.all(
      applications.map(async (application) => {
        if (!application.resume_url) {
          logWithTracker('warn', `Resume URL missing for application ID: ${application.id}`, trackerId, 'website-service');
          return null;
        }

        try {
          const decryptedUrl = decrypt(application.resume_url);
          if (!decryptedUrl) {
            logWithTracker('warn', `Failed to decrypt resume URL for application ID: ${application.id}`, trackerId, 'website-service');
            return null;
          }

          return {
            ...application.toJSON(),
            decrypted_resume_url: decryptedUrl,
            resume_filename: application.resume_filename,
          };
        } catch (error) {
          logWithTracker('error', `Error decrypting resume URL for application ID: ${application.id} - ${error.message}`, trackerId, 'website-service');
          return null;
        }
      })
    );

    // Filter out invalid applications
    const validApplications = applicationsWithResume.filter((app) => app !== null);

    logWithTracker('info', 'Fetched all valid career applications', trackerId, 'website-service');
    return res.json({ status: 'success', data: validApplications, trackerId });
  } catch (error) {
    logWithTracker('error', `Error fetching career applications: ${error.message}`, trackerId, 'website-service');
    return res.status(500).json({ status: 'error', message: 'An error occurred while fetching applications.', trackerId });
  }
};

// Controller Function for Downloading Resume
exports.downloadResume = async (req, res) => {
  const { applicationId } = req.params;
  const trackerId = req.trackerId; // Assuming trackerId is passed with the request

  logWithTracker('info', `Fetching resume for application ID: ${applicationId}`, trackerId, 'website-service');

  try {
    // Fetch the application from the database
    const application = await CareerApplication.findByPk(applicationId);
    if (!application) {
      logWithTracker('warn', `Application with ID ${applicationId} not found`, trackerId, 'website-service');
      return res.status(404).json({ status: 'error', message: 'Application not found.', trackerId });
    }

    // Decrypt the S3 URL
    const decryptedUrl = decrypt(application.resume_url);
    const decodedUrl = decodeURIComponent(decryptedUrl); // Decode URL to handle any special characters
    logWithTracker('info', `Decoded Decrypted S3 URL: ${decodedUrl}`, trackerId, 'website-service');

    // Extract S3 Bucket and Key from the decoded URL
    const urlParts = decodedUrl.split('/');
    const bucketName = process.env.AWS_BUCKET_NAME; // Assuming bucket name is static
    const key = urlParts.slice(3).join('/'); // Extract the Key (after bucket name)

    logWithTracker('info', `Fetching resume from S3: ${bucketName}/${key}`, trackerId, 'website-service');

    // Get the object from S3
    const params = {
      Bucket: bucketName,
      Key: key,
    };

    const s3Stream = s3.getObject(params).createReadStream();

    // Set the headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${application.resume_filename}"`);

    // Pipe the S3 stream to the client
    s3Stream.on('error', (err) => {
      logWithTracker('error', `Error fetching file from S3: ${err.message}`, trackerId, 'website-service');
      return res.status(500).json({ status: 'error', message: 'Failed to fetch the file from S3.', trackerId });
    });

    s3Stream.pipe(res);
  } catch (error) {
    logWithTracker('error', `Error downloading resume for ID ${applicationId}: ${error.message}`, trackerId, 'website-service');
    return res.status(500).json({
      status: 'error',
      message: 'An error occurred while downloading the resume.',
      trackerId,
    });
  }
};

  // exports.careerApplication = [
  //   tokenRequired,
  //   upload.single('resume'), // Middleware to handle the single file upload with the field name 'resume'
  //   async (req, res) => {
  //     const { email, phone_number, profile } = req.body; // Extract form data
  //     const resume = req.file; // Extract the uploaded file
  //     const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
  
  //     logWithTracker('info', 'Received form data for career application', trackerId, 'website-service');
  
  //     // Validate email and phone number using Joi
  //     const { error } = careerApplicationSchema.validate({ email, phone_number, profile });
  //     if (error) {
  //       logWithTracker('warn', `Validation failed: ${error.message}`, trackerId, 'website-service');
  //       return res.status(400).json({
  //         status: 'error',
  //         message: 'Validation failed',
  //         errors: error.details.map((err) => err.message),
  //         trackerId,
  //       });
  //     }
  
  //     // Check if the resume file is provided
  //     if (!resume) {
  //       logWithTracker('warn', 'Resume file is missing', trackerId, 'website-service');
  //       return res.status(400).json({ status: 'error', message: 'Resume file is required.', trackerId });
  //     }
  
  //     // Check if the file type is allowed
  //     if (!allowedFile(resume.originalname)) {
  //       logWithTracker('warn', `Invalid file format for resume: ${resume.originalname}`, trackerId, 'website-service');
  //       return res.status(400).json({ status: 'error', message: 'Invalid file format for resume.', trackerId });
  //     }
  
  //     // Check for file size
  //     if (resume.size > 5 * 1024 * 1024) {
  //       logWithTracker('warn', `File too large: ${resume.size}`, trackerId, 'website-service');
  //       return res.status(400).json({ status: 'error', message: 'Resume file is too large. Max size is 5MB.', trackerId });
  //     }
  
  //     try {
  //       const userId = req.user.user_id; // Get user ID from token
  //       logWithTracker('info', `User ID from token: ${userId}`, trackerId, 'website-service'); // Log user ID to verify
  
  //       if (!userId) {
  //         logWithTracker('warn', 'User ID is missing from token', trackerId, 'website-service');
  //         return res.status(400).json({ status: 'error', message: 'User ID is missing from token.', trackerId });
  //       }
  
  //       const resumeData = resume.buffer; // Resume binary data
  //       logWithTracker('info', 'Resume data received, preparing to save to database', trackerId, 'website-service');
  
  //       // Save to database
  //       const application = await CareerApplication.create({
  //         user_id: userId,
  //         email,
  //         phone_number,
  //         profile,
  //         resume_filename: resume.originalname,
  //         resume_data: resumeData,
  //       });
  //       logWithTracker('info', 'Application saved to database', trackerId, 'website-service');
  
  //       // Send email notification
  //       await sendCareerEmail(email, req.user.username, profile, resume.originalname, resumeData);
  //       logWithTracker('info', `Career application email sent to: ${email}`, trackerId, 'website-service');
  
  //       return res.status(201).json({
  //         status: 'success',
  //         message: 'Application submitted successfully!',
  //         trackerId,
  //       });
  //     } catch (error) {
  //       logWithTracker('error', `Error occurred while submitting career application: ${error.message}`, trackerId, 'website-service');
  //       return res.status(500).json({
  //         status: 'error',
  //         message: 'An error occurred while saving your application.',
  //         trackerId,
  //       });
  //     }
  //   },
  // ];

// // Get all career applications
// exports.getCareerApplications = async (req, res) => {
//     const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
//     logWithTracker('info', 'Fetching all career applications', trackerId,'website-service');

//     try {
//         const applications = await CareerApplication.findAll();
//         logWithTracker('info', 'Fetched all career applications', trackerId,'website-service');
//         return res.json({ status: 'success', data: applications , trackerId});
//     } catch (error) {
//         logWithTracker('error', `Error fetching career applications: ${error.message}`, trackerId,'website-service');
//         return res.status(500).json({ status: 'error', message: 'An error occurred while fetching applications.', trackerId });
//     }
// };

// // Download resume
// exports.downloadResume = async (req, res) => {
//     const { applicationId } = req.params;
//     const { download } = req.query;  // Check if the 'download' query parameter is present
//     const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
//     logWithTracker('info', `Attempting to download resume for application ID: ${applicationId}`, trackerId,'website-service');

//     try {
//         const application = await CareerApplication.findByPk(applicationId);
//         if (!application) {
//             logWithTracker('warn', `Application with ID ${applicationId} not found`, trackerId,'website-service');
//             return res.status(404).json({ status: 'error', message: 'Application not found.', trackerId });
//         }

//         const resumeData = application.resume_data;
//         const resumeFilename = `${application.resume_filename.split('.').slice(0, -1).join('.')}.pdf`; // Force PDF extension
//         logWithTracker('info', `Preparing to send resume: ${resumeFilename}`, trackerId,'website-service');

//         // Set the response headers to indicate PDF content type
//         res.set('Content-Type', 'application/pdf');

//         if (download === 'true') {
//             logWithTracker('info', 'Forcing download of the resume', trackerId,'website-service');
//             res.set('Content-Disposition', `attachment; filename="${resumeFilename}"`);
//         } else {
//             logWithTracker('info', 'Displaying the resume in the browser', trackerId,'website-service');
//             res.set('Content-Disposition', `inline; filename="${resumeFilename}"`);
//         }

//         // Send the resume data (PDF) to the client
//         return res.send(resumeData, trackerId);
//     } catch (error) {
//         logWithTracker('error', `Error downloading/viewing resume for application ID: ${applicationId}: ${error.message}`, trackerId,'website-service');
//         return res.status(500).json({ status: 'error', message: 'An error occurred while downloading/viewing the resume.', trackerId });
//     }
// };


// Define validation schema
const contactSchema = Joi.object({
    username: Joi.string()
      .pattern(/^[a-zA-Z\s]+$/)
      .required()
      .messages({
        'string.pattern.base': 'Username must contain only letters and spaces.',
        'any.required': 'Username is required.',
      }),
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.email': 'Invalid email format.',
        'any.required': 'Email is required.',
      }),
    phone_number: Joi.string()
      .pattern(/^\d{10}$/)
      .required()
      .messages({
        'string.pattern.base': 'Phone number must be a valid 10-digit number.',
        'any.required': 'Phone number is required.',
      }),
    queries: Joi.string()
      .min(10)
      .required()
      .messages({
        'string.min': 'Queries must be at least 10 characters long.',
        'any.required': 'Queries are required.',
      }),
  });
  
  exports.contact = async (req, res) => {
    const { username, email, phone_number, queries } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
  
    // Validate request body
    const { error } = contactSchema.validate(req.body, { abortEarly: false });
    if (error) {
      logWithTracker('warn', 'Validation failed for contact form submission', trackerId, 'website-service');
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed.',
        errors: error.details.map((err) => err.message),
        trackerId,
      });
    }
  
    try {
      logWithTracker('info', 'Creating new contact entry....', trackerId, 'website-service');
      const contactEntry = await Contact.create({ username, email, phone_number, queries });
      logWithTracker('info', `Contact entry created successfully with ID: ${contactEntry.id}`, trackerId, 'website-service'); // Log successful entry creation
  
      // Send email notification
      await sendQueryContactEmail(email, username, queries);
      logWithTracker('info', `Query contact email sent to: ${email}`, trackerId, 'website-service'); // Log email sent action
  
      return res.status(201).json({
        status: 'success',
        trackerId,
        message: 'Your message has been sent!',
      });
    } catch (error) {
      logWithTracker('error', `Error during contact creation: ${error.message}`, trackerId, 'website-service');
      return res.status(500).json({ status: 'error', message: 'An error occurred while creating contact.', trackerId });
    }
  };

// Get contact queries
exports.getContactQueries = async (req, res) => {
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', 'Fetching all contact queries...', trackerId,'website-service');

    try {
        const contacts = await Contact.findAll();
        logWithTracker('info', 'Fetched contact queries...', trackerId,'website-service'); 
        return res.json({ status: 'success', data: contacts, trackerId });
    } catch (error) {
        logWithTracker('error', `Error fetching contacts: ${error.message}`, trackerId,'website-service');
        return res.status(500).json({ status: 'error', message: 'An error occurred while fetching contacts.', trackerId });
    }
};
