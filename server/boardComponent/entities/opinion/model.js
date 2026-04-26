import { config } from '../../../../config/config.js';

let Opinion;

if (config.dynamodb?.useBoard) {
  const mod = await import('./model.dynamo.js');
  Opinion = mod.default;
} else {
  const mod = await import('./model.mongoose.js');
  Opinion = mod.default;
}

export default Opinion;
