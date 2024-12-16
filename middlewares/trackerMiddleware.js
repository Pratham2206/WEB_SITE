// middleware/trackerMiddleware.js

const { v4: uuidv4 } = require('uuid');

const trackerMiddleware = (req, res, next) => {
    // Generate a new unique tracker ID for each request
    req.trackerId = uuidv4(); // This will be unique for each request

    // Pass the tracker ID to the logger for later use
    res.locals.trackerId = req.trackerId; // Can be used by any controller/action in the same request
    next();
};

module.exports = trackerMiddleware;
