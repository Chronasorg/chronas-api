process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DYNAMODB_TABLE_PREFIX = 'chronas';
process.env.USE_DYNAMODB_AREAS = 'true';
process.env.USE_DYNAMODB_MARKERS = 'true';
process.env.USE_DYNAMODB_METADATA = 'true';
process.env.USE_DYNAMODB_USERS = 'true';
process.env.USE_DYNAMODB_FLAGS = 'true';
process.env.USE_DYNAMODB_REVISIONS = 'true';
process.env.USE_DYNAMODB_BOARD = 'true';
// Tests never send CloudFront invalidations: server/helpers/edge-invalidation.js
// reads this when it is imported, and a value exported in the shell for the
// admin scripts would let test writes invalidate the live distribution.
delete process.env.CLOUDFRONT_DISTRIBUTION_ID;
