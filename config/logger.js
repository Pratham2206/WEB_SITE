const fs = require('fs');
const path = require('path'); // Ensure this is also imported
const winston = require('winston');
const TransportStream = require('winston-transport');
const DailyRotateFile = require('winston-daily-rotate-file'); // Import explicitly
const Log = require('../models/log'); // Adjust path as needed
const schedule = require('node-schedule');
const { Op } = require('sequelize');



// Retention period for logs in days
const LOG_RETENTION_DAYS = 30;

// Custom Transport for Database Logging
class DbTransport extends TransportStream {
    log(info, callback) {
        setImmediate(() => this.emit('logged', info));

        // Save log to the database
        Log.create({
            // trackerId: info.trackerId,
            trackerId: typeof info.trackerId === 'string' ? info.trackerId : String(info.trackerId || 'N/A'),
            level: info.level,
            message: info.message,
            service: info.service,
            timestamp: new Date(),
        }).catch((err) => console.error('Error saving log to DB:', err));

        callback();
    }
}

// // Function to create a logger dynamically based on the service
// const createLoggerForService = (serviceName) => {
//     const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

//     return winston.createLogger({
//         level: logLevel,  // Use the environment-specific log level
//         format: winston.format.combine(
//             winston.format.timestamp(),
//             winston.format.json()
//         ),
//         defaultMeta: { service: serviceName },  // Dynamic service name
//         transports: [
//             new winston.transports.Console(),
//             new DailyRotateFile({
//                 filename: `logs/${serviceName}-%DATE%.log`,  // Dynamic log file name based on service
//                 datePattern: 'YYYY-MM-DD',
//                 maxSize: '20m',
//                 maxFiles: '14d',
//             }),
//             new DbTransport(), // Use the custom transport
//         ],
//     });
// };


const createLoggerForService = (serviceName) => {
    const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

    return winston.createLogger({
        level: logLevel, // Use the environment-specific log level
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss', // Add readable timestamp format
            }),
            winston.format.printf((info) => {
                // Customize log output structure
                return `[${info.timestamp}] [${info.service}] [Tracker: ${info.trackerId || 'N/A'}] [Level: ${info.level.toUpperCase()}]: ${info.message}`;
            })
        ),
        defaultMeta: { service: serviceName }, // Dynamic service name
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(), // Adds colors to the console log output
                    winston.format.printf((info) => {
                        return `[${info.timestamp}] [${info.service}] [Tracker: ${info.trackerId || 'N/A'}] [Level: ${info.level.toUpperCase()}]: ${info.message}`;
                    })
                ),
            }),
            new DailyRotateFile({
                filename: `logs/${serviceName}-%DATE%.log`, // Dynamic log file name based on service
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: winston.format.printf((info) => {
                    return `[${info.timestamp}] [${info.service}] [Tracker: ${info.trackerId || 'N/A'}] [Level: ${info.level.toUpperCase()}]: ${info.message}`;
                }),
            }),
            new DbTransport(), // Use the custom transport
        ],
    });
};


const LOG_DIRECTORY = './logs';

const deleteOldLogsFromDB = async () => {
    const { logWithTracker } = require('../services/loggerService');
    const trackerId = 'deleteOldLogs';
    
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);

        console.log('Cutoff Date:', cutoffDate); // Log cutoffDate to check its value

        const result = await Log.destroy({
            where: {
                timestamp: { [Op.lt]: cutoffDate },
            },
        });

        if (result === 0) {
            logWithTracker('info', `No logs older than ${LOG_RETENTION_DAYS} days found to delete.`, trackerId, 'website-service');
        } else {
            logWithTracker('info', `Old logs older than ${LOG_RETENTION_DAYS} days deleted successfully from the database.`, trackerId, 'website-service');
        }
    } catch (error) {
        logWithTracker('error', 'Error deleting old logs from the database:', error, trackerId, 'website-service');
    }
};

const deleteOldLogFiles = () => {
    const { logWithTracker } = require('../services/loggerService');
    const trackerId = 'deleteOldLogFiles';
    try {
        const cutoffTime = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        fs.readdir(LOG_DIRECTORY, (err, files) => {
            if (err) {
                logWithTracker('error', 'Error reading log directory:', err, trackerId, 'website-service');
                return;
            }

            files.forEach(file => {
                const filePath = path.join(LOG_DIRECTORY, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) {
                        logWithTracker('error', `Error getting stats for file: ${file}`, err, trackerId, 'website-service');
                        return;
                    }

                    if (stats.mtime.getTime() < cutoffTime) {
                        fs.unlink(filePath, err => {
                            if (err) {
                                logWithTracker('error', `Error deleting file: ${file}`, err, trackerId, 'website-service');
                            } else {
                                logWithTracker('info', `Deleted old log file: ${file}`, trackerId, 'website-service');
                            }
                        });
                    }
                });
            });
        });
    } catch (error) {
        logWithTracker('error', 'Error deleting old log files:', error, trackerId, 'website-service');
    }
};

const combinedLogCleanup = async () => {
    const trackerId = 'deleteOldLogFiles';
    const { logWithTracker } = require('../services/loggerService');
    logWithTracker('info', 'Running log cleanup...',trackerId, 'website-service');
    await deleteOldLogsFromDB();
    deleteOldLogFiles();
};

// schedule.scheduleJob('* * * * *', combinedLogCleanup);
schedule.scheduleJob('0 0 * * *', combinedLogCleanup);


// Export loggers for each service
module.exports = {
    websiteLogger: createLoggerForService('website-service'),
    pickupDropLogger: createLoggerForService('pickup-drop-service'),
    foodDeliveryLogger: createLoggerForService('food-delivery-service'),
    cakeDeliveryLogger: createLoggerForService('cake-delivery-service'),
    combinedLogCleanup,
};




