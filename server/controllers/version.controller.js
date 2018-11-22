import { composePatternSync } from 'appversion'
import User from '../models/user.model'
import Revision from '../models/revision.model'


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
  const formatedDate = new Date(buildDate).toLocaleDateString()

  User.count().exec().then(userCount => res.json({ version: getVersion, commit: getCommit, build: formatedDate, user: userCount }))
}

export default { get, getPlusUser }
