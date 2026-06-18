import { format, createLogger, transports } from 'winston';

const { combine, timestamp, label, printf } = format;
const CATEGORY = 'winston custom format';

// Using the printf format. Serialize any structured metadata (e.g. the error
// payload from express-winston's errorLogger) so it isn't silently dropped —
// without this, the only thing written for a 5xx was the literal "middlewareError".
// Guard JSON.stringify: a circular meta value (axios error, AWS SDK client, res)
// would otherwise throw inside the formatter and turn a log call into a crash.
const customFormat = printf(({ level, message, label, timestamp, ...meta }) => {
  let metaStr = '';
  if (Object.keys(meta).length) {
    try {
      metaStr = ` ${JSON.stringify(meta)}`;
    } catch {
      metaStr = ' [unserializable meta]';
    }
  }
  return `${timestamp} [${label}] ${level}: ${message}${metaStr}`;
});

const logger = createLogger({
  level: 'debug',
  format: combine(label({ label: CATEGORY }), timestamp(), customFormat),
  transports: [new transports.Console()]
});

export default logger;
