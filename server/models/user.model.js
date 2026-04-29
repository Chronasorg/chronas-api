import { config } from '../../config/config.js';

let User;

if (config.dynamodb?.useUsers) {
  const mod = await import('./dynamo/user.dynamo.js');
  User = mod.default;
} else {
  const mod = await import('./user.model.mongoose.js');
  User = mod.default;
}

export default User;
