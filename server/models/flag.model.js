import { config } from '../../config/config.js';

let Flag;

if (config.dynamodb?.useFlags) {
  const mod = await import('./dynamo/flag.dynamo.js');
  Flag = mod.default;
} else {
  const mod = await import('./flag.model.mongoose.js');
  Flag = mod.default;
}

export default Flag;
