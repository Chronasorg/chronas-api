import User from '../models/user.model'
import { getAppVersion, getAppVersionSync, composePattern, composePatternSync } from 'appversion'


/**
 * get current deployed version
 * @returns {User}
 */
function get(req, res) {
  const getVersion = composePatternSync('M.m.p')
  const getCommit = composePatternSync('c')
  return res.json({ version: getVersion, commit: getCommit })
}

export default { get }
