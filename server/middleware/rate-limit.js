import rateLimit from 'express-rate-limit';

import { DynamoRateLimitStore } from './dynamo-rate-store.js';

const ONE_HOUR = 60 * 60 * 1000;

export const contactLimiter = rateLimit({
  windowMs: ONE_HOUR,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new DynamoRateLimitStore({ prefix: 'contact', windowMs: ONE_HOUR }),
  message: { message: 'Too many contact submissions, try again later.' }
});
