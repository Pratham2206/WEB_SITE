const { websiteLogger, pickupDropLogger, foodDeliveryLogger, cakeDeliveryLogger } = require('../config/logger');

// Log function that takes level, message, and optional trackerId
const logWithTracker = (level, message, trackerId, serviceName) => {
    const logger = getLoggerForService(serviceName);

    if (trackerId) {
        // Include the tracker ID in all logs if available
        logger.log({
            level: level,
            message: message,
            trackerId: trackerId,
        });
    } else {
        // Log without trackerId if not provided
        logger.log({
            level: level,
            message: message,
        });
    }
    return trackerId; // Return the trackerId in case we want to continue using it later
};

// Function to dynamically get the logger for the specific service
const getLoggerForService = (serviceName) => {
    switch(serviceName) {
        case 'website-service':
            return websiteLogger;
        case 'pickup-drop-service':
            return pickupDropLogger;
        case 'food-delivery-service':
            return foodDeliveryLogger;
        case 'cake-delivery-service':
            return cakeDeliveryLogger;
        default:
            return websiteLogger;  // Default to website service if no match
    }
};

module.exports = { logWithTracker };
