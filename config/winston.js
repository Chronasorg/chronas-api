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

// The Lambda Web Function runtime captures stdout and stderr and filters them
// by applicationLogLevel (WARN in prod); console methods give a line its
// level. By default winston writes raw lines to process.stdout, which carry
// no level and were not delivered at WARN, so every 5xx from express-winston's
// errorLogger was lost (verified on a test endpoint 2026-10-13). forceConsole
// routes each level to its console method: error → console.error,
// warn → console.warn, the rest → console.log.
export const consoleTransportOptions = {
  forceConsole: true,
  stderrLevels: ['error'],
  consoleWarnLevels: ['warn']
};

const logger = createLogger({
  level: 'debug',
  format: combine(label({ label: CATEGORY }), timestamp(), customFormat),
  transports: [new transports.Console(consoleTransportOptions)]
});

export default logger;
