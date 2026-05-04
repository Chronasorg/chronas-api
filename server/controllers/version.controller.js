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

async function getPlusUser(req, res) {
  const formatedDate = VERSION_INFO.build;

  let lastDataEdit = 'n/a';
  let userCount = 0;

  try {
    const rev = await Revision.find().sort({ timestamp: -1 }).limit(1).lean().exec();
    lastDataEdit = (rev && rev[0] && rev[0].timestamp) || 'n/a';
  } catch (err) {
    console.error('Version endpoint: revision lookup failed', err.message);
  }

  try {
    userCount = await User.countDocuments().exec();
  } catch (err) {
    console.error('Version endpoint: user count failed', err.message);
  }

  res.json({
    lastDataEdit,
    version: VERSION_INFO.version,
    commit: VERSION_INFO.commit,
    build: formatedDate,
    user: userCount
  });
}

export default { get, getPlusUser };
