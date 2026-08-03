// Backend/config/db.js
//
// MongoDB connection manager using Mongoose.
// Supports both MongoDB Atlas and local MongoDB via MONGO_URI.
//
// Lifecycle:
//   - connectDB(): establishes connection on server startup
//   - Mongoose emits 'disconnected' events which are logged for monitoring
//   - process SIGINT / SIGTERM: gracefully closes the Mongoose connection

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(`[MongoDB] Connected: ${conn.connection.host}`);

    // Log reconnection events for monitoring
    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected from database.');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Reconnected to database.');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] Connection error:', err.message);
    });
  } catch (error) {
    console.error(`[MongoDB] Initial connection failed: ${error.message}`);
    process.exit(1);
  }
};

// Graceful shutdown — ensures in-flight operations complete before closing
const gracefulShutdown = async (signal) => {
  console.log(`[Server] ${signal} received. Closing MongoDB connection...`);
  await mongoose.connection.close();
  console.log('[MongoDB] Connection closed gracefully.');
  process.exit(0);
};

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = connectDB;