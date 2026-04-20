#!/usr/bin/env node

/**
 * Test Server with In-Memory MongoDB
 *
 * Starts the Express app backed by MongoMemoryServer with seed data.
 * Used for running Postman/Newman tests locally without external MongoDB.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Set env before importing app modules
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.APPINSIGHTS_INSTRUMENTATIONKEY = 'placeholder';
process.env.MAILGUN_KEY = 'test-mailgun-key-placeholder';
process.env.MAILGUN_DOMAIN = 'test-domain.com';

const PORT = process.env.PORT || 3001;

async function seedDatabase() {
  const User = mongoose.model('User');
  const Metadata = mongoose.model('Metadata');
  const Marker = mongoose.model('Marker');
  const Area = mongoose.model('Area');

  // Seed the Postman test user (matches PostmanTests/chronas-local.postman_environment.json)
  const hashedPassword = await bcrypt.hash('postman123', 10);
  await User.create({
    _id: 'postman@aui.de',
    username: 'postman_test_user',
    email: 'postman@aui.de',
    password: hashedPassword,
    privilege: 99,
    authType: 'local',
    loginCount: 0,
    karma: 10
  });

  // Seed metadata (Postman tests expect religion, culture to exist)
  await Metadata.insertMany([
    {
      _id: 'religion',
      data: {
        protestant: ['Protestant', 'rgb(255,0,0)', 'Christianity', 'Christianity'],
        sunni: ['Sunni Islam', 'rgb(0,255,0)', 'Islam', 'Islam'],
        catholic: ['Catholic', 'rgb(0,0,255)', 'Christianity', 'Christianity'],
        chalcedonism: ['Chalcedonism', 'rgb(191,166,0)', 'Chalcedonian_Christianity', 'Christianity'],
        orthodox: ['Orthodox', 'rgb(178,128,0)', 'History_of_the_Orthodox_Church', 'Christianity']
      },
      type: 'g',
      score: 0,
      coo: []
    },
    {
      _id: 'culture',
      data: {
        sapmi: ['sapmi', 'rgb(157,51,167)', 'Sapmi'],
        samoyed: ['samoyed', 'rgb(220,220,103)', 'Samoyedic peoples'],
        yakut: ['yakut', 'rgb(100,94,155)', 'Yakuts']
      },
      type: 'g',
      score: 0,
      coo: []
    }
  ]);

  // Seed a marker (Postman tests do GET /v1/markers/?count=1)
  await Marker.create({
    _id: 'SeedMarker1',
    name: 'Seed Marker',
    wiki: 'Seed_Marker',
    type: 'e',
    year: 1945,
    coo: [13.4, 52.5],
    location: { type: 'Point', coordinates: [13.4, 52.5] }
  });

  // Seed areas for year-based lookups
  const creatorId = new mongoose.Types.ObjectId();
  const defaultGeometry = {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
  };
  await Area.insertMany([
    {
      _id: '2000',
      name: 'Test Area 2000',
      year: 2000,
      geometry: defaultGeometry,
      createdBy: creatorId,
      data: { TestProvince: ['TST', 'test', 'protestant', 'TestCapital', 1000] }
    },
    {
      _id: '1947',
      name: 'Test Area 1947',
      year: 1947,
      geometry: defaultGeometry,
      createdBy: creatorId,
      data: { TestProvince2: ['TST2', 'test2', 'sunni', 'TestCapital2', 500] }
    },
    {
      _id: '-2000',
      name: 'Test Area -2000',
      year: -2000,
      geometry: defaultGeometry,
      createdBy: creatorId,
      data: { AncientProv: ['ANC', 'ancient', 'catholic', 'AncientCity', 100] }
    },
    {
      _id: '1000',
      name: 'Area 1000 (pre-Schism)',
      year: 1000,
      geometry: defaultGeometry,
      createdBy: creatorId,
      data: {
        Kiev: ['KRU', 'ruthenian', 'chalcedonism', 'Kiev', 50000],
        Thrace: ['BYZ', 'greek', 'chalcedonism', 'Constantinople', 100000],
        London: ['ENG', 'english', 'chalcedonism', 'London', 80000],
        Novgorod: ['KRU', 'ruthenian', 'orthodox', 'Novgorod', 30000]
      }
    },
    {
      _id: '1100',
      name: 'Area 1100 (post-Schism)',
      year: 1100,
      geometry: defaultGeometry,
      createdBy: creatorId,
      data: {
        Kiev: ['KRU', 'ruthenian', 'chalcedonism', 'Kiev', 55000],
        Thrace: ['BYZ', 'greek', 'chalcedonism', 'Constantinople', 110000],
        London: ['ENG', 'english', 'catholic', 'London', 90000],
        Bulgaria: ['_First_Bulgarian_Empire', 'bulgarian', 'chalcedonism', 'Preslav', 60000],
        Serbia: ['SRB', 'serbian', 'chalcedonism', 'Belgrade', 40000],
        Novgorod: ['KRU', 'ruthenian', 'orthodox', 'Novgorod', 35000]
      }
    }
  ]);

  console.log('📋 Database seeded with test data');
}

async function start() {
  console.log('🚀 Starting test server with in-memory MongoDB...');

  // Start in-memory MongoDB (random port to avoid conflicts)
  const mongod = await MongoMemoryServer.create({
    instance: { dbName: 'chronas-test' }
  });
  const uri = mongod.getUri();
  console.log(`📦 In-memory MongoDB started at: ${uri}`);

  // Connect mongoose
  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000
  });
  console.log('✅ Connected to in-memory MongoDB');

  // Import models (registers them with mongoose)
  await import('../server/models/user.model.js');
  await import('../server/models/marker.model.js');
  await import('../server/models/area.model.js');
  await import('../server/models/metadata.model.js');
  await import('../server/models/revision.model.js');
  await import('../server/models/collection.model.js');
  await import('../server/models/flag.model.js');
  await import('../server/models/game.model.js');

  // Seed data
  await seedDatabase();

  // Import the test app (Express without X-Ray/AppInsights)
  const { default: app } = await import('../server/tests/helpers/test-app.js');

  // Start listening
  const server = app.listen(PORT, () => {
    console.log(`✅ Test server running on http://localhost:${PORT}`);
    console.log('   Ready for Postman/Newman tests');
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n🛑 ${signal} received, shutting down...`);
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    console.log('✅ Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { server, mongod };
}

start().catch((err) => {
  console.error('❌ Failed to start test server:', err);
  process.exit(1);
});

export { start };
