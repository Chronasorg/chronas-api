import { config } from '../../config/config.js';

let Revision;

if (config.dynamodb?.useRevisions) {
  const mod = await import('./dynamo/revision.dynamo.js');
  Revision = mod.default;
} else {
  const mod = await import('./revision.model.mongoose.js');
  Revision = mod.default;
}

export default Revision;
