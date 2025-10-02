/**
 * Mock Database Helper
 * Simple in-memory mock for testing without MongoDB
 */

// Simple in-memory storage
const mockData = {
  users: new Map(),
  markers: new Map(),
  areas: new Map(),
  metadatas: new Map()
};

// Mock Mongoose model behavior
class MockModel {
  constructor(data) {
    Object.assign(this, data);
    if (!this._id) {
      this._id = Math.random().toString(36).substr(2, 9);
    }
    // Initialize default values for users
    if (this.constructor.collection.name === 'users') {
      this.loginCount = this.loginCount || 0;
      this.karma = this.karma || 1;
      this.privilege = this.privilege || 1;
    }
  }

  async save() {
    const collection = mockData[this.constructor.collection.name];
    if (collection) {
      collection.set(this._id || this.email, this);
    }
    return Promise.resolve(this);
  }

  static find(query = {}) {
    const collection = mockData[this.collection.name];
    if (!collection) return Promise.resolve([]);

    const results = Array.from(collection.values());

    // Simple query matching
    if (Object.keys(query).length === 0) {
      return Promise.resolve(results);
    }

    const filtered = results.filter(doc => {
      return Object.entries(query).every(([key, value]) => {
        return doc[key] === value;
      });
    });

    return Promise.resolve(filtered);
  }

  static findOne(query = {}) {
    return this.find(query).then(results => results[0] || null);
  }

  static findById(id) {
    const collection = mockData[this.collection.name];
    return Promise.resolve(collection ? collection.get(id) : null);
  }

  static create(data) {
    const doc = new this(data);
    return doc.save();
  }

  static insertMany(docs) {
    const collection = mockData[this.collection.name];
    if (!collection) return Promise.resolve([]);

    const results = docs.map(data => {
      const doc = new this(data);
      collection.set(doc._id, doc);
      return doc;
    });

    return Promise.resolve(results);
  }

  static deleteMany(query = {}) {
    const collection = mockData[this.collection.name];
    if (!collection) return Promise.resolve({ deletedCount: 0 });

    if (Object.keys(query).length === 0) {
      const count = collection.size;
      collection.clear();
      return Promise.resolve({ deletedCount: count });
    }

    // Simple implementation for specific queries
    let deletedCount = 0;
    for (const [id, doc] of collection.entries()) {
      const matches = Object.entries(query).every(([key, value]) => {
        return doc[key] === value;
      });
      if (matches) {
        collection.delete(id);
        deletedCount++;
      }
    }

    return Promise.resolve({ deletedCount });
  }
}

// Mock User model
class MockUser extends MockModel {
  static collection = { name: 'users' };

  async comparePassword(candidatePassword, callback) {
    // Simple mock - in real tests, this would check bcrypt hash
    const isMatch = candidatePassword === 'asdf';
    if (callback) {
      callback(null, isMatch);
    }
    return isMatch;
  }

  static findOne(query = {}) {
    const collection = mockData[this.collection.name];
    if (!collection) return { exec: () => Promise.resolve(null) };

    const results = Array.from(collection.values());
    const filtered = results.filter(doc => {
      return Object.entries(query).every(([key, value]) => {
        return doc[key] === value;
      });
    });

    const result = filtered[0] || null;

    // Return an object with exec method to match Mongoose API
    return {
      exec: () => Promise.resolve(result ? new MockUser(result) : null)
    };
  }
}

// Mock Marker model
class MockMarker extends MockModel {
  static collection = { name: 'markers' };
}

// Mock Area model
class MockArea extends MockModel {
  static collection = { name: 'areas' };
}

// Mock Metadata model
class MockMetadata extends MockModel {
  static collection = { name: 'metadatas' };
}

// Mock mongoose connection
const mockConnection = {
  collections: {
    users: { deleteMany: () => Promise.resolve() },
    markers: { deleteMany: () => Promise.resolve() },
    areas: { deleteMany: () => Promise.resolve() },
    metadatas: { deleteMany: () => Promise.resolve() }
  }
};

// Mock mongoose
const mockMongoose = {
  model: (name) => {
    switch (name) {
    case 'User': return MockUser;
    case 'Marker': return MockMarker;
    case 'Area': return MockArea;
    case 'Metadata': return MockMetadata;
    default: return MockModel;
    }
  },
  connection: mockConnection,
  connect: () => Promise.resolve(),
  disconnect: () => Promise.resolve()
};

export function setupMockDatabase() {
  console.log('📦 Mock database setup');
  return Promise.resolve();
}

export function teardownMockDatabase() {
  console.log('✅ Mock database teardown');
  return Promise.resolve();
}

export function clearMockDatabase() {
  Object.values(mockData).forEach(collection => collection.clear());
  console.log('🧹 Mock database cleared');
  return Promise.resolve();
}

export function populateMockData(testData) {
  if (testData.users) {
    testData.users.forEach(user => {
      mockData.users.set(user._id || user.email, user);
    });
  }

  if (testData.markers) {
    testData.markers.forEach(marker => {
      mockData.markers.set(marker._id, marker);
    });
  }

  if (testData.areas) {
    testData.areas.forEach(area => {
      mockData.areas.set(area._id, area);
    });
  }

  if (testData.metadatas) {
    testData.metadatas.forEach(metadata => {
      mockData.metadatas.set(metadata._id, metadata);
    });
  }

  console.log('📋 Mock data populated');
  return Promise.resolve();
}

// Export models for testing
export { MockUser, MockMarker, MockArea, MockMetadata, mockMongoose };

export default {
  setupMockDatabase,
  teardownMockDatabase,
  clearMockDatabase,
  populateMockData,
  MockUser,
  MockMarker,
  MockArea,
  MockMetadata,
  mockMongoose
};
