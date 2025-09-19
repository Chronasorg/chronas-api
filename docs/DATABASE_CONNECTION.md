# Database Connection Configuration

This document describes the modernized database connection setup for DocumentDB with Lambda optimization and TLS support.

## Overview

The database connection has been modernized to support:
- AWS DocumentDB with TLS encryption
- Lambda-optimized connection pooling
- Connection caching for improved performance
- Automatic TLS certificate detection
- Environment-specific configuration

## Files

- `config/database.js` - Main database connection module
- `scripts/download-docdb-cert.js` - TLS certificate download utility
- `certs/rds-ca-2019-root.pem` - DocumentDB TLS certificate (auto-downloaded)

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MONGO_HOST` | MongoDB/DocumentDB connection URI | `mongodb://localhost:27017/chronas-api` | Yes |
| `MONGODB_USE_TLS` | Force TLS usage | Auto-detected from URI | No |
| `AWS_LAMBDA_FUNCTION_NAME` | Lambda function name (auto-set by AWS) | - | No |

### Connection URI Formats

#### Local Development
```
mongodb://localhost:27017/chronas-api
```

#### DocumentDB Cluster
```
mongodb://username:password@cluster.docdb.amazonaws.com:27017/chronas?replicaSet=rs0&retryWrites=false
```

## Features

### TLS Support

The connection module automatically detects DocumentDB clusters and enables TLS:

- **Auto-detection**: URIs containing `docdb` automatically enable TLS
- **Certificate paths**: Searches multiple locations for the TLS certificate
- **Fallback**: Gracefully handles missing certificates

### Lambda Optimization

Connection settings are optimized based on the runtime environment:

| Setting | Local Development | Lambda |
|---------|-------------------|--------|
| `maxPoolSize` | 10 | 1 |
| `minPoolSize` | 2 | 0 |
| `bufferCommands` | true | false |

### Connection Caching

- Reuses existing connections when healthy
- Automatically invalidates stale connections
- Optimized for Lambda cold start performance

## Usage

### Basic Connection

```javascript
import { connectToDatabase } from './config/database.js';

const uri = process.env.MONGO_HOST;
await connectToDatabase(uri);
```

### Connection Status

```javascript
import { getConnectionStatus } from './config/database.js';

const status = getConnectionStatus();
console.log('Database state:', status.state);
console.log('Is connected:', status.isConnected);
```

### Connectivity Test

```javascript
import { testDatabaseConnectivity } from './config/database.js';

const isHealthy = await testDatabaseConnectivity();
if (!isHealthy) {
  console.log('Database is not responding');
}
```

### Graceful Shutdown

```javascript
import { closeDatabaseConnection } from './config/database.js';

process.on('SIGTERM', async () => {
  await closeDatabaseConnection();
  process.exit(0);
});
```

## TLS Certificate Setup

### Automatic Download

```bash
npm run setup:docdb-cert
```

### Manual Download

```bash
node scripts/download-docdb-cert.js
```

### Certificate Locations

The module searches for certificates in this order:
1. `/opt/rds-ca-2019-root.pem` (Lambda layer)
2. `./certs/rds-ca-2019-root.pem` (Local development)
3. `./migration/rds-ca-2019-root.pem` (Migration scripts)

## Health Checks

The health check endpoints have been updated to use the new database module:

- `GET /health` - Basic health status
- `GET /health/detailed` - Detailed health with database status
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

## Migration from Old Connection

### Before (index.js)
```javascript
import mongoose from 'mongoose';

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10
});
```

### After (index.js)
```javascript
import { connectToDatabase } from './config/database.js';

await connectToDatabase(mongoUri);
```

## Troubleshooting

### Common Issues

#### TLS Certificate Not Found
```
WARNING: TLS required but certificate not found
```
**Solution**: Run `npm run setup:docdb-cert` to download the certificate.

#### Connection Pool Exhausted
```
MongoServerSelectionError: connection pool exhausted
```
**Solution**: Check connection pooling settings and ensure connections are properly closed.

#### Lambda Timeout
```
Task timed out after X seconds
```
**Solution**: Verify `bufferCommands: false` is set for Lambda environment.

### Debug Logging

Enable debug logging:
```bash
DEBUG=chronas-api:database npm start
```

### Connection Testing

Test connection without starting the full application:
```bash
node -e "
import('./config/database.js').then(db => 
  db.connectToDatabase('your-connection-uri')
    .then(() => console.log('✓ Connection successful'))
    .catch(e => console.log('✗ Connection failed:', e.message))
)"
```

## Performance Considerations

### Lambda Cold Starts

- Connection caching reduces cold start impact
- Single connection pool size minimizes resource usage
- Disabled command buffering prevents timeouts

### Connection Reuse

- Connections are cached and reused across Lambda invocations
- Automatic health checks ensure connection validity
- Graceful degradation when connections fail

### Memory Usage

- Optimized pool sizes reduce memory footprint
- Connection cleanup prevents memory leaks
- Efficient event handler management

## Security

### TLS Encryption

- All DocumentDB connections use TLS encryption
- Certificate validation prevents man-in-the-middle attacks
- Hostname verification ensures connection authenticity

### Connection Strings

- Credentials should be stored in AWS Secrets Manager
- Connection URIs should not contain hardcoded passwords
- Use environment variables for configuration

## Testing

### Unit Tests

```bash
npm test -- --grep "Database Connection"
```

### Integration Tests

```bash
node scripts/test-database-connection.js
```

### Health Check Tests

```bash
curl http://localhost:4040/health/detailed
```