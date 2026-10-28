// Lambda-compatible version without appversion dependency
import User from '../models/user.model.js';
import Revision from '../models/revision.model.js';


// Version info - updated by CI/CD pipeline via build-version.json
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let VERSION_INFO;
try {
  VERSION_INFO = JSON.parse(readFileSync(join(__dirname, '../../build-version.json'), 'utf8'));
} catch {
  VERSION_INFO = {
    version: '1.3.7',
    commit: 'local-dev',
    build: new Date().toISOString()
  };
}

function get(req, res) {
  return res.json({
    version: VERSION_INFO.version,
    commit: VERSION_INFO.commit,
    build: VERSION_INFO.build
  });
}

// DescribeTable's ItemCount refreshes about every 6 hours; caching it keeps
// the welcome call clear of DescribeTable's lower request limit.
const USER_COUNT_TTL_MS = 10 * 60 * 1000;
const USER_COUNT_RETRY_MS = 60 * 1000;
let userCountCache = { value: 0, expires: 0 };

async function cachedUserCount() {
  if (Date.now() < userCountCache.expires) return userCountCache.value;
  try {
    const value = await User.estimatedDocumentCount();
    userCountCache = { value, expires: Date.now() + USER_COUNT_TTL_MS };
  } catch (err) {
    userCountCache = { ...userCountCache, expires: Date.now() + USER_COUNT_RETRY_MS };
    console.warn({ msg: 'welcomeUserCountFailed', name: err.name, message: err.message });
  }
  return userCountCache.value;
}

/**
 * GET /v1/welcome and /v1/version/welcome. Also serves as an end-to-end
 * keep-alive check: the last-edit GetItem runs on every call and a failure
 * answers 5xx. The user count is only a display number and never fails it.
 */
async function getPlusUser(req, res, next) {
  try {
    const [lastEdit, userCount] = await Promise.all([Revision.lastEdit(), cachedUserCount()]);
    res.json({
      lastDataEdit: lastEdit || 'n/a',
      version: VERSION_INFO.version,
      commit: VERSION_INFO.commit,
      build: VERSION_INFO.build,
      user: userCount
    });
  } catch (err) {
    next(err);
  }
}

function resetUserCountCache() {
  userCountCache = { value: 0, expires: 0 };
}

export default { get, getPlusUser, resetUserCountCache };
