/**
 * Test Database Setup
 * Sets up in-memory MongoDB for integration tests
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod;

export async function setupTestDatabase() {
  try {
    // Start in-memory MongoDB instance
    mongod = await MongoMemoryServer.create({
      instance: {
        port: 27017, // Use the same port as configured in tests
        dbName: 'chronas-test'
      }
    });
    
    const uri = mongod.getUri();
    console.log(`Test MongoDB started at: ${uri}`);
    
    // Connect mongoose to the in-memory database
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Test database connected successfully');
    return uri;
    
  } catch (error) {
    console.error('❌ Failed to setup test database:', error.message);
    throw error;
  }
}

export async function teardownTestDatabase() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    if (mongod) {
      await mongod.stop();
      console.log('✅ Test database stopped');
    }
  } catch (error) {
    console.error('❌ Failed to teardown test database:', error.message);
  }
}

export default {
  setupTestDatabase,
  teardownTestDatabase
};