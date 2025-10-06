// Lambda-compatible version without appversion dependency
import Promise from 'bluebird';
import httpStatus from 'http-status';

import User from '../models/user.model.js';
import Revision from '../models/revision.model.js';
import APIError from '../helpers/APIError.js';


// Lambda-compatible version info
const VERSION_INFO = {
  version: '1.3.7',
  commit: 'automated-deploy-test',
  build: new Date().toISOString()
};

/**
 * get current deployed version
 */
function get(req, res) {
  const formatedDate = new Date(VERSION_INFO.build).toLocaleDateString();
  return res.json({
    version: VERSION_INFO.version,
    commit: VERSION_INFO.commit,
    build: formatedDate
  });
}


/**
 * get current deployed version and user count
 */
function getPlusUser(req, res) {
  const formatedDate = VERSION_INFO.build;

  // Handle database queries with fallback for Lambda environment
  Promise.resolve()
    .then(() => {
      // Try to get revision data
      return Revision
        .find()
        .sort({ timestamp: -1 })
        .limit(1)
        .lean()
        .exec()
        .catch(() => []); // Return empty array if database query fails
    })
    .then(async (rev) => {
      try {
        // Debug: Check database connection and collections
        const mongoose = await import('mongoose');
        const { db } = mongoose.default.connection;
        console.log('🔍 Debug - Database name:', db ? db.databaseName : 'No database connection');
        console.log('🔍 Debug - Mongoose connection state:', mongoose.default.connection.readyState);

        if (db) {
          // List all collections
          const collections = await db.listCollections().toArray();
          console.log('🔍 Debug - Available collections:', collections.map(c => c.name));

          // Try to find any collection that might contain users
          for (const collection of collections) {
            const count = await db.collection(collection.name).countDocuments();
            console.log(`🔍 Debug - Collection '${collection.name}' has ${count} documents`);
          }
        }

        // Try to get user count (using countDocuments instead of deprecated count)
        const userCount = await User.countDocuments().exec();
        console.log('🔍 Debug - User.countDocuments() result:', userCount);

        return { rev, userCount };
      } catch (error) {
        console.log('🔍 Debug - User.countDocuments() error:', error.message);
        return { rev, userCount: 0 };
      }
    })
    .then(({ rev, userCount }) => {
      console.log('Debug - User count query result:', userCount);
      res.json({
        lastDataEdit: (rev[0] || {}).timestamp || 'n/a',
        version: VERSION_INFO.version,
        commit: VERSION_INFO.commit,
        build: formatedDate,
        user: userCount
      });
    })
    .catch((error) => {
      // Final fallback if everything fails
      console.error('Version endpoint error:', error);
      res.json({
        lastDataEdit: 'n/a',
        version: VERSION_INFO.version,
        commit: VERSION_INFO.commit,
        build: formatedDate,
        user: 0
      });
    });
}

export default { get, getPlusUser };
