import { config } from '../../config/config.js';

let Metadata;

if (config.dynamodb?.useMetadata) {
  const mod = await import('./dynamo/metadata.dynamo.js');
  Metadata = mod.default;
} else {
  const mod = await import('./metadata.model.mongoose.js');
  Metadata = mod.default;
}

export default Metadata;
