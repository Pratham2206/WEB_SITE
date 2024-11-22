require('dotenv').config();
const Customer = require('../models/customer');
const Employee = require('../models/employee');
const DeliveryBoy = require('../models/deliveryBoy');
const Pricing = require('../models/pricing');
const DistanceCache = require('../models/distanceCache');
const AutocompleteCache = require('../models/autocompleteCache');
const axios = require('axios');

// Fetch customer data by phone number
exports.getCustomerData = async (req, res) => {
    const { phoneNumber } = req.params;
    console.log('Fetching customer data for phone number:', phoneNumber);

    try {
        const customer = await Customer.findOne({
            where: { phoneNumber },
            attributes: ['phoneNumber', 'name', 'email', 'pickupAddress'],
        });

        if (customer) {
            console.log('Customer data found');
            res.json(customer);
        } else {
            console.log('Customer not found for phone number:', phoneNumber);
            res.status(404).json({ message: 'Customer not found' });
        }
    } catch (err) {
        console.error('Error fetching customer data:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Fetch user data by user ID
exports.getUserData = async (req, res) => {
    const { userId } = req.params;
    console.log('Fetching user data for userId:', userId);

    try {
        const user = await Employee.findByPk(userId, {
            attributes: ['name', 'phonenumber', 'email', 'role'],
        });

        if (user) {
            console.log('User data found:', user);
            res.json(user);
        } else {
            console.log('User not found for userId:', userId);
            res.status(404).json({ message: 'User not found' });
        }
    } catch (err) {
        console.error('Error fetching user data:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Fetch available drivers
exports.getAvailableDrivers = async (req, res) => {
    console.log('Fetching available drivers');
    try {
        const drivers = await DeliveryBoy.findAll({
            where: {
                role: 'delivery boy',
                available: 'available'
            },
        });

        if (drivers.length > 0) {
            console.log('Available drivers found:', drivers);
            res.json(drivers);
        } else {
            console.log('No available drivers found');
            res.status(404).json({ message: 'No available drivers found' });
        }
    } catch (err) {
        console.error('Error fetching drivers:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Fetch all pricing records
async function getPricing() {
    console.log('Fetching pricing data');
    return await Pricing.findAll();
}

async function calculateDistanceFare(distance) {
    console.log('Calculating distance fare for distance:', distance);
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
    console.log('Distance fare details:', { baseFare, extraFarePerKm, distanceFare, additionalCharge });
    return { baseFare, extraFarePerKm, distanceFare, additionalCharge };
}

async function calculateWeightFare(weight) {
    console.log('Calculating weight fare for weight:', weight);
    const pricing = await getPricing();
    const weightPricing = pricing.find(p => weight > p.weight_bracket_start && weight <= p.weight_bracket_end);

    return weightPricing ? weightPricing.weight_fare : 0;
   
}

async function calculateTotalFare(distance, weight) {
    console.log('Calculating total fare for distance:', distance, 'and weight:', weight);
    const { baseFare, extraFarePerKm, distanceFare, additionalCharge } = await calculateDistanceFare(distance);
    const weightFare = await calculateWeightFare(weight);
    const totalFare = Math.ceil(distanceFare + weightFare); // Round up total fare

    console.log('Total fare details:', { totalFare, baseFare, extraFarePerKm, weightFare, additionalCharge });
    return { totalFare, baseFare, extraFarePerKm, weightFare, additionalCharge };
}

exports.calculateFare = async (req, res) => {
    const { distance, weight } = req.body;
    console.log('Calculating fare with input:', { distance, weight });

    if (typeof distance !== 'number' || distance < 0) {
        console.log('Invalid distance provided');
        return res.status(400).json({ message: 'Invalid distance provided.' });
    }

    if (typeof weight !== 'number' || weight < 0) {
        console.log('Invalid weight provided');
        return res.status(400).json({ message: 'Invalid weight provided.' });
    }

    try {
        const { totalFare, baseFare, extraFarePerKm, weightFare, additionalCharge } = await calculateTotalFare(distance, weight);

        res.json({
            totalAmount: `₹${totalFare}`,
            baseFare: `₹${baseFare}`,
            extraFarePerKm: `₹${extraFarePerKm}`,
            weightFare: `₹${weightFare}`,
            additionalCharge: `₹${additionalCharge}`, // Return additional charge
            distance,
            weight,
        });
    } catch (err) {
        console.error('Error calculating fare:', err);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

exports.getUserById = async (req, res) => {
    const { userId } = req.params;
    console.log('Fetching user data for userId:', userId);
    try {
      const user = await Employee.findByPk(userId, {
        attributes: ['name', 'phonenumber', 'email', 'role'],
      });
  
      if (user) {
        console.log('User data found:', user);
        res.json(user);
      } else {
        console.log('User not found for userId:', userId);
        res.status(404).json({ message: 'User not found' });
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  };
  // Get distance matrix using Google Places API with caching
  exports.getDistanceMatrix = async (req, res) => {
      const { origins, destinations } = req.query;
      console.log('Request received for getDistanceMatrix:', { origins, destinations });

      // Check if the result is cached
      const cachedResult = await DistanceCache.findOne({
          where: { origin: origins, destination: destinations },
      });
  
      if (cachedResult) {
        console.log('Using cached result for distance matrix:', cachedResult);
          return res.json({
            distance_value: cachedResult.distance_value,
          });
      }
      // If not cached, call Google Distance Matrix API
      const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
      console.log('Fetching distance matrix from Google API...');
      try {
          const response = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', {
              params: {
                  origins,
                  destinations,
                  key: googlePlacesKey,
              },
          });
          const distance = response.data.rows[0].elements[0].distance.value;
          const distanceInKm = (distance / 1000).toFixed(1);  // Convert meters to kilometers
          console.log('Distance fetched from Google API:', distanceInKm, 'km');
          // Store result in cache
          await DistanceCache.create({
              origin: origins,
              destination: destinations,
              distance_value: distanceInKm,  
          });
          console.log('Result cached successfully.');
          res.json({ distance_value: distanceInKm });
      } catch (error) {
          console.error('Error calculating distance:', error);
          res.status(500).send('Error calculating distance');
      }
  };
exports.getAutocomplete = async (req, res) => {
    const { input } = req.query;
    console.log('Request received for getAutocomplete:', { input });
    try {
        // Check cache for autocomplete data
        const cachedAutocomplete = await AutocompleteCache.findOne({
            where: { input }
        });

        if (cachedAutocomplete) {
            console.log('Using cached autocomplete from database.',cachedAutocomplete.response);
            return res.json({
                predictions: cachedAutocomplete.response,
                source: 'cache'
            });
        }

        // If not cached, fetch from Google API
        const googlePlacesKey = process.env.GOOGLE_PLACES_API_KEY;
        const location = '15.8497,74.4977'; // Latitude and Longitude of Belagavi, Karnataka
        const radius = 30000; // 10 kilometers radius

        console.log('Fetching autocomplete data from Google API...');
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
        console.log('Autocomplete data fetched from Google API:', response.data.predictions);
        // Save to cache
        await AutocompleteCache.create({
            input,
            response: response.data.predictions
        });  
        console.log('Autocomplete data cached successfully.');
        res.json({
            predictions: response.data.predictions,
            source: 'api'
        });
    } catch (error) {
        console.error('Error fetching from Google Places API:', error);
        res.status(500).json({ error: 'Error fetching data from Google Places API' });
    }
};
