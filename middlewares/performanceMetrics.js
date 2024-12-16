const fs = require('fs');
const { metricsFile } = require('../config/config');


// Middleware to log performance metrics
function performanceMetrics(req, res, next) {
    const startTime = process.hrtime();  // Start the timer
   

    res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const elapsedTime = (seconds * 1e3 + nanoseconds / 1e6).toFixed(2); // Convert to milliseconds
        const trackerId = req.trackerId 
        // Metric data
        const metric = {
            trackerId,
            endpoint: req.originalUrl,
            method: req.method,
            status: res.statusCode,
            responseTime: `${elapsedTime} ms`,
            timestamp: new Date().toISOString(),
            
        };

        // Read the current content of the metrics file
        fs.readFile(metricsFile, 'utf8', (err, data) => {
            if (err && err.code !== 'ENOENT') {
                console.error('Error reading metrics file:', err);
                return;
            }

            let metrics = [];
            if (data) {
                try {
                    metrics = JSON.parse(data);  // Parse existing metrics data
                } catch (parseError) {
                    console.error('Error parsing metrics data:', parseError);
                    metrics = [];
                }
            }

            // Add the new metric to the array
            metrics.push(metric);

            // Write the updated metrics back to the file
            fs.writeFile(metricsFile, JSON.stringify(metrics, null, 2), 'utf8', (err) => {
                if (err) {
                    console.error('Error writing metrics:', err);
                }
            });
        });
    });

    next();
}

module.exports = performanceMetrics;


