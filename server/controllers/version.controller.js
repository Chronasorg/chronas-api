// Lambda-compatible version without appversion dependency
import User from '../models/user.model.js';
import Revision from '../models/revision.model.js';
import Promise from 'bluebird';
import APIError from '../helpers/APIError.js';
import httpStatus from 'http-status'

// Lambda-compatible version info
const VERSION_INFO = {
  version: '1.3.5',
  commit: 'lambda-deploy',
  build: new Date().toISOString()
}

/**
 * get current deployed version
 */
function get(req, res) {
  const formatedDate = new Date(VERSION_INFO.build).toLocaleDateString()
  return res.json({
    version: VERSION_INFO.version,
    commit: VERSION_INFO.commit,
    build: formatedDate
  })
}


/**
 * get current deployed version and user count
 */
function getPlusUser(req, res) {
  const formatedDate = VERSION_INFO.build

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
        .catch(() => []) // Return empty array if database query fails
    })
    .then((rev) => {
      // Try to get user count (using countDocuments instead of deprecated count)
      return User.countDocuments().exec()
        .then((userCount) => ({ rev, userCount }))
        .catch(() => ({ rev, userCount: 0 })) // Return 0 if user count query fails
    })
    .then(({ rev, userCount }) => {
      res.json({
        lastDataEdit: (rev[0] || {}).timestamp || 'n/a',
        version: VERSION_INFO.version,
        commit: VERSION_INFO.commit,
        build: formatedDate,
        user: userCount
      })
    })
    .catch((error) => {
      // Final fallback if everything fails
      console.error('Version endpoint error:', error)
      res.json({
        lastDataEdit: 'n/a',
        version: VERSION_INFO.version,
        commit: VERSION_INFO.commit,
        build: formatedDate,
        user: 0
      })
    })
}

export default { get, getPlusUser }
