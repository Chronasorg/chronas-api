import { config } from '../../config/config.js';

let Area;

if (config.dynamodb?.useAreas) {
  const mod = await import('./dynamo/area.dynamo.js');
  Area = mod.default;
} else {
  const mod = await import('./area.model.mongoose.js');
  Area = mod.default;
}

export default Area;
