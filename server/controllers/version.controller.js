import { composePatternSync } from 'appversion'
import User from '../models/user.model.js';
import Revision from '../models/revision.model.js';
import Promise from 'bluebird';
import APIError from '../helpers/APIError.js';
import httpStatus from 'http-status'


/**
 * get current deployed version
 */
function get(req, res) {
  const getVersion = composePatternSync('M.m.p')
  const getCommit = composePatternSync('c')
  const buildDate = composePatternSync('d')
  const formatedDate = new Date(buildDate).toLocaleDateString()
  return res.json({ version: getVersion, commit: getCommit, build: formatedDate })
}


/**
 * get current deployed version and user count
 */
function getPlusUser(req, res) {
  const getVersion = composePatternSync('M.m.p')
  const getCommit = composePatternSync('c')
  const buildDate = composePatternSync('d')
  const formatedDate = buildDate

  Revision
    .find()
    .sort({ timestamp: -1 })
    .limit(1)
    .lean()
    .exec()
    .then((rev) => {
      User.count().exec().then((userCount) => {
        res.json({ lastDataEdit: (rev[0] || {}).timestamp || 'n/a', version: getVersion, commit: getCommit, build: formatedDate, user: userCount })
      })
    })
}

export default { get, getPlusUser }
