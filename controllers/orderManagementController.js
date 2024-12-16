require('dotenv').config();
const Customer = require('../models/customer');
const Employee = require('../models/employee');
const DeliveryBoy = require('../models/deliveryBoy');
const Pricing = require('../models/pricing');
const DistanceCache = require('../models/distanceCache');
const AutocompleteCache = require('../models/autocompleteCache');
const axios = require('axios');
const { logWithTracker } = require('../services/loggerService');

// Fetch customer data by phone number
exports.getCustomerData = async (req, res) => {
    const { phoneNumber } = req.params;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Fetching customer data for phone number...`, trackerId,'pickup-drop-service');

    try {
        const customer = await Customer.findOne({
            where: { phoneNumber },
            attributes: ['phoneNumber', 'name', 'email', 'pickupAddress'],
        });

        if (customer) {
            logWithTracker('info', `Customer data found for phone number.....`, trackerId,'pickup-drop-service');
            res.json({customer,trackerId});
        } else {
            logWithTracker('warn', `Customer not found for phone number....`, trackerId,'pickup-drop-service');
            res.status(404).json({ message: 'Customer not found', trackerId });
        }
    } catch (err) {
        logWithTracker('error', `Error fetching customer data for phone number...... ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ message: 'Internal Server Error', trackerId });
    }
};

// Fetch user data by user ID
exports.getUserData = async (req, res) => {
    const { userId } = req.params;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Fetching user data for userId......`, trackerId,'pickup-drop-service');

    try {
        const user = await Employee.findByPk(userId, {
            attributes: ['name', 'phonenumber', 'email', 'role'],
        });

        if (user) {
            logWithTracker('info', `User data found for userId.....`, trackerId,'pickup-drop-service');
            res.json({user,trackerId});
        } else {
            logWithTracker('warn', `User not found for userId......`, trackerId,'pickup-drop-service');
            res.status(404).json({ message: 'User not found', trackerId });
        }
    } catch (err) {
        logWithTracker('error', `Error fetching user data for userId... ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ message: 'Internal Server Error', trackerId });
    }
};


// Fetch available drivers
exports.getAvailableDrivers = async (req, res) => {
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', 'Fetching available drivers', trackerId,'pickup-drop-service');

    try {
        const drivers = await DeliveryBoy.findAll({
            where: {
                role: 'delivery boy',
                available: 'available',
            },
        });

        if (drivers.length > 0) {
            logWithTracker('info', `Available drivers found: ${drivers.length}`, trackerId,'pickup-drop-service');
            res.json({drivers,trackerId});
        } else {
            logWithTracker('warn', 'No available drivers found', trackerId,'pickup-drop-service');
            res.status(404).json({ message: 'No available drivers found', trackerId });
        }
    } catch (err) {
        logWithTracker('error', `Error fetching available drivers: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ message: 'Internal Server Error', trackerId });
    }
};

// Fetch all pricing records
async function getPricing() {
    console.log('Fetching pricing data');
    try {
        const pricingData = await Pricing.findAll();
        return pricingData;
    } catch (err) {
        console.error('Error fetching pricing data:', err);
        throw new Error('Error fetching pricing data');
    }
}

// Calculate distance fare based on distance
async function calculateDistanceFare(distance) {
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Calculating distance fare for distance: ${distance}`, trackerId);

    const pricing = await getPricing();
    const distancePricing = pricing.find(p => p.weight_bracket_start === 0);

    const baseFare = distancePricing.base_fare;
    const extraFarePerKm = distancePricing.extra_fare_per_km;
    const baseDistance = distancePricing.base_distance;

    let distanceFare;
    let additionalCharge = 0;

    // Base fare for the initial distance
    if (distance <= baseDistance) {
        distanceFare = baseFare;
    } else {
        // Calculate extra fare for the distance exceeding the base distance
        const extraDistance = distance - baseDistance;
        const regularExtraFare = extraDistance * extraFarePerKm;

        // Apply 60% additional charge only if the distance is more than 10 km
        if (distance > 10) {
            additionalCharge = regularExtraFare * 0.60;
        }

        // Calculate total distance fare including the additional charge
        distanceFare = baseFare + regularExtraFare + additionalCharge;
    }

    logWithTracker('info', `Distance fare details: baseFare: ₹${baseFare}, extraFarePerKm: ₹${extraFarePerKm}, distanceFare: ₹${distanceFare}, additionalCharge: ₹${additionalCharge}`, trackerId);
    return { baseFare, extraFarePerKm, distanceFare, additionalCharge };
}


// Calculate weight fare based on weight
async function calculateWeightFare(weight) {
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Calculating weight fare for weight: ${weight}`, trackerId,'pickup-drop-service');

    const pricing = await getPricing();
    const weightPricing = pricing.find(p => weight > p.weight_bracket_start && weight <= p.weight_bracket_end);

    const weightFare = weightPricing ? weightPricing.weight_fare : 0;

    logWithTracker('info', `Weight fare for weight ${weight} is ₹${weightFare}`, trackerId,'pickup-drop-service');
    return weightFare;
}

// Calculate total fare based on distance and weight
async function calculateTotalFare(distance, weight) {
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Calculating total fare for distance: ${distance} and weight: ${weight}`, trackerId,'pickup-drop-service');

    const { baseFare, extraFarePerKm, distanceFare, additionalCharge } = await calculateDistanceFare(distance);
    const weightFare = await calculateWeightFare(weight);
    const totalFare = Math.ceil(distanceFare + weightFare); // Round up total fare

    logWithTracker('info', `Total fare details: totalFare: ₹${totalFare}, baseFare: ₹${baseFare}, extraFarePerKm: ₹${extraFarePerKm}, weightFare: ₹${weightFare}, additionalCharge: ₹${additionalCharge}`, trackerId);
    return { totalFare, baseFare, extraFarePerKm, weightFare, additionalCharge };
}

// Main function to calculate fare and send response
exports.calculateFare = async (req, res) => {
    const { distance, weight } = req.body;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request

    logWithTracker('info', `Calculating fare with input: distance = ${distance}, weight = ${weight}`, trackerId,'pickup-drop-service');

    // Validate input
    if (typeof distance !== 'number' || distance < 0) {
        logWithTracker('warn', `Invalid distance provided: ${distance}`, trackerId,'pickup-drop-service');
        return res.status(400).json({ message: 'Invalid distance provided.', trackerId });
    }

    if (typeof weight !== 'number' || weight < 0) {
        logWithTracker('warn', `Invalid weight provided: ${weight}`, trackerId,'pickup-drop-service');
        return res.status(400).json({ message: 'Invalid weight provided.', trackerId });
    }

    try {
        const { totalFare, baseFare, extraFarePerKm, weightFare, additionalCharge } = await calculateTotalFare(distance, weight);

        logWithTracker('info', `Fare calculated successfully. Total: ₹${totalFare}, baseFare: ₹${baseFare}, extraFarePerKm: ₹${extraFarePerKm}, weightFare: ₹${weightFare}, additionalCharge: ₹${additionalCharge}`, trackerId,'pickup-drop-service');

        res.json({
            totalAmount: `₹${totalFare}`,
            baseFare: `₹${baseFare}`,
            extraFarePerKm: `₹${extraFarePerKm}`,
            weightFare: `₹${weightFare}`,
            additionalCharge: `₹${additionalCharge}`, // Return additional charge
            distance,
            weight,
             trackerId,
        });
    } catch (err) {
        logWithTracker('error', `Error calculating fare: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ message: 'Internal Server Error', trackerId });
    }
};

// Fetch user data by userId
exports.getUserById = async (req, res) => {
    const { userId } = req.params;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request
    logWithTracker('info', `Fetching user data for userId: ${userId}`, trackerId,'pickup-drop-service');

    try {
        const user = await Employee.findByPk(userId, {
            attributes: ['name', 'phonenumber', 'email', 'role'],
        });

        if (user) {
            logWithTracker('info', `User data found for userId: ${userId}`, trackerId,'pickup-drop-service');
            res.json({user,trackerId});
        } else {
            logWithTracker('warn', `User not found for userId: ${userId}`, trackerId,'pickup-drop-service');
            res.status(404).json({ message: 'User not found', trackerId });
        }
    } catch (err) {
        logWithTracker('error', `Error fetching user data for userId: ${userId}: ${err.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ message: 'Internal Server Error', trackerId });
    }
};

  // Get distance matrix using Google Places API with caching
exports.getDistanceMatrix = async (req, res) => {
    const { origins, destinations } = req.query;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request

    logWithTracker('info', `Request received for getDistanceMatrix with origins: ${origins}, destinations: ${destinations}`, trackerId,'pickup-drop-service');

    // Check if the result is cached
    try {
        const cachedResult = await DistanceCache.findOne({
            where: { origin: origins, destination: destinations },
        });

        if (cachedResult) {
            logWithTracker('info', `Using cached result for distance matrix: ${cachedResult.distance_value} km`, trackerId,'pickup-drop-service');
            return res.json({
                 trackerId,
                distance_value: cachedResult.distance_value,
            });
        }

        // If not cached, call Google Distance Matrix API
        const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
        logWithTracker('info', 'Fetching distance matrix from Google API...', trackerId,'pickup-drop-service');

        const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
            params: {
                origins,
                destinations,
                key: googlePlacesKey,
            },
        });

        const distance = response.data.rows[0].elements[0].distance.value;
        const distanceInKm = (distance / 1000).toFixed(1);  // Convert meters to kilometers

        logWithTracker('info', `Distance fetched from Google API: ${distanceInKm} km`, trackerId,'pickup-drop-service');

        // Store result in cache
        await DistanceCache.create({
            origin: origins,
            destination: destinations,
            distance_value: distanceInKm,
        });

        logWithTracker('info', 'Result cached successfully.', trackerId,'pickup-drop-service');

        res.json({ distance_value: distanceInKm, trackerId });
    } catch (error) {
        logWithTracker('error', `Error calculating distance: ${error.message}`, trackerId,'pickup-drop-service');
        res.status(500).send('Error calculating distance', trackerId);
    }
};

exports.getAutocomplete = async (req, res) => {
    const { input } = req.query;
    const trackerId = req.trackerId; // Assuming trackerId is passed along with the request

    logWithTracker('info', `Request received for getAutocomplete with input: ${input}`, trackerId,'pickup-drop-service');

    try {
        // Check cache for autocomplete data
        const cachedAutocomplete = await AutocompleteCache.findOne({
            where: { input }
        });

        if (cachedAutocomplete) {
            logWithTracker('info', `Using cached autocomplete from database.`, trackerId,'pickup-drop-service');
            return res.json({
                 trackerId,
                predictions: cachedAutocomplete.response,
                source: 'cache'
            });
        }

        // If not cached, fetch from Google API
        const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
        const location = '15.8497,74.4977'; // Latitude and Longitude of Belagavi, Karnataka
        const radius = 30000; // 30 kilometers radius

        logWithTracker('info', `Fetching autocomplete data from Google API...`, trackerId,'pickup-drop-service');

        const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
            params: {
                input,
                key: googlePlacesKey,
                location,
                radius,
                components: 'country:in',
                strictbounds: true,
            },
        });

        logWithTracker('info', `Autocomplete data fetched from Google API: ${response.data.predictions.length} results`, trackerId,'pickup-drop-service');

        // Save to cache
        await AutocompleteCache.create({
            input,
            response: response.data.predictions
        });

        logWithTracker('info', 'Autocomplete data cached successfully.', trackerId,'pickup-drop-service');

        res.json({
             trackerId,
            predictions: response.data.predictions,
            source: 'api'
        });

    } catch (error) {
        logWithTracker('error', `Error fetching from Google Places API: ${error.message}`, trackerId,'pickup-drop-service');
        res.status(500).json({ error: 'Error fetching data from Google Places API' , trackerId});
    }
};

