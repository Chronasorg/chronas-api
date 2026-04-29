import { config } from '../../../../config/config.js';

let Discussion;

if (config.dynamodb?.useBoard) {
  const mod = await import('./model.dynamo.js');
  Discussion = mod.default;
} else {
  const mod = await import('./model.mongoose.js');
  Discussion = mod.default;
}

export default Discussion;
