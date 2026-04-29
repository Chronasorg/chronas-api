import { config } from '../../../../config/config.js';

let Forum;

if (config.dynamodb?.useBoard) {
  const mod = await import('./model.dynamo.js');
  Forum = mod.default;
} else {
  const mod = await import('./model.mongoose.js');
  Forum = mod.default;
}

export default Forum;
