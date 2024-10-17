require('dotenv').config({ path: './backend/.env' });  // Load environment variables
const { Sequelize } = require('sequelize');


const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  dialect: 'mysql',
});

// Export the Sequelize instance
module.exports = sequelize;  
