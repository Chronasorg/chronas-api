import { format, createLogger, transports } from 'winston';

const { combine, timestamp, label, printf } = format;
const CATEGORY = 'winston custom format';

// Using the printf format. Serialize any structured metadata (e.g. the error
// payload from express-winston's errorLogger) so it isn't silently dropped —
// without this, the only thing written for a 5xx was the literal "middlewareError".
const customFormat = printf(({ level, message, label, timestamp, ...meta }) => {
  const metaKeys = Object.keys(meta).filter(key => typeof key === 'string');
  const metaStr = metaKeys.length
    ? ` ${JSON.stringify(metaKeys.reduce((acc, key) => { acc[key] = meta[key]; return acc; }, {}))}`
    : '';
  return `${timestamp} [${label}] ${level}: ${message}${metaStr}`;
});

const logger = createLogger({
  level: 'debug',
  format: combine(label({ label: CATEGORY }), timestamp(), customFormat),
  transports: [new transports.Console()]
});

export default logger;
