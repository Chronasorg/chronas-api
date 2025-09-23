/**
 * MongoDB Memory Server Helper
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
        port: 27018, // Use different port to avoid conflicts
        dbName: 'chronas-test-memory'
      }
    });
    
    const uri = mongod.getUri();
    console.log(`📦 In-memory MongoDB started at: ${uri}`);
    
    // Connect mongoose to the in-memory database
    await mongoose.connect(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ Connected to in-memory MongoDB');
    return uri;
  } catch (error) {
    console.error('❌ Failed to setup test database:', error);
    throw error;
  }
}

export async function teardownTestDatabase() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('✅ Disconnected from MongoDB');
    }
    
    if (mongod) {
      await mongod.stop();
      console.log('✅ In-memory MongoDB stopped');
    }
  } catch (error) {
    console.error('❌ Failed to teardown test database:', error);
    throw error;
  }
}

export async function clearTestDatabase() {
  try {
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
    
    console.log('🧹 Test database cleared');
  } catch (error) {
    console.error('❌ Failed to clear test database:', error);
    throw error;
  }
}

export default {
  setupTestDatabase,
  teardownTestDatabase,
  clearTestDatabase
};