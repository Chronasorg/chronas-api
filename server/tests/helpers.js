// Test environment setup
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-key'
process.env.APPINSIGHTS_INSTRUMENTATIONKEY = 'placeholder'
process.env.TWITTER_CONSUMER_KEY = 'placeholder'
process.env.TWITTER_CONSUMER_SECRET = 'placeholder'
process.env.TWITTER_CALLBACK_URL = 'placeholder'
process.env.MAILGUN_KEY = 'test-mailgun-key-placeholder'
process.env.MAILGUN_DOMAIN = 'test-domain.com'

// Import models to ensure they're registered with mongoose
import '../models/user.model.js';
import '../models/marker.model.js';
import '../models/area.model.js';
import '../models/metadata.model.js';

// Mock mongoose for integration tests
import { mockMongoose } from './helpers/mock-database.js';

// Replace mongoose.model with our mock
const originalModel = (await import('mongoose')).default.model;
(await import('mongoose')).default.model = mockMongoose.model;

console.log('📋 Test environment configured with mock database');
