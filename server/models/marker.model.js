import { config } from '../../config/config.js';

let Marker;

if (config.dynamodb?.useMarkers) {
  const mod = await import('./dynamo/marker.dynamo.js');
  Marker = mod.default;
} else {
  const mod = await import('./marker.model.mongoose.js');
  Marker = mod.default;
}

export default Marker;
