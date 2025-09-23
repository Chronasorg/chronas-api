# Postman Test Automation

This document describes the automated Postman testing setup for the Chronas API.

## Overview

The Postman test automation provides comprehensive API testing with:
- Automated server lifecycle management
- Multiple environment support (local, dev, prod)
- Detailed HTML and JSON reporting
- CI/CD integration
- Test data setup and teardown

## Quick Start

### 1. Setup Test Environment
```bash
npm run test:setup
```

### 2. Run Tests
```bash
# Run enhanced tests with automatic server management
npm run test:postman

# Run basic tests
npm run test:postman:basic

# Run against development environment
npm run test:postman:dev

# Run against production environment
npm run test:postman:prod
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run test:setup` | Validate environment and create test data |
| `npm run test:postman` | Run enhanced collection with auto server start |
| `npm run test:postman:basic` | Run basic collection with auto server start |
| `npm run test:postman:dev` | Run tests against dev environment |
| `npm run test:postman:prod` | Run tests against production environment |
| `npm run test:postman:manual` | Run tests manually (server must be running) |
| `npm run test:ci` | Run tests in CI/CD mode |
| `npm run test:ci:basic` | Run basic tests in CI/CD mode |

## Test Collections

### Enhanced Collection (`chronas-enhanced.postman_collection.json`)
Comprehensive test suite covering:
- **Authentication** - Login, token validation
- **Version & Health** - Version info, health checks
- **Metadata** (96k+ requests) - CRUD operations, filtering, linking
- **Markers** (33k+ requests) - Geographic markers, types, years
- **Areas** (4k+ requests) - Historical area data
- **Board/Forum** (11k+ requests) - Discussion functionality
- **User Management** - User CRUD operations
- **Statistics** - System statistics
- **Flags** - Flag management

### Basic Collection (`chronas.postman_collection.json`)
Simplified test suite for quick validation.

## Environments

### Local Environment (`chronas-local.postman_environment.json`)
- **Base URL**: `http://localhost:3001`
- **Test User**: `postman@aui.de`
- **Auto Server Start**: Enabled

### Development Environment (`chronas-dev.postman_environment.json`)
- **Base URL**: `https://api-dev.chronas.org`
- **Auto Server Start**: Disabled

### Production Environment (`chronas-api.postman_environment.json`)
- **Base URL**: `https://api.chronas.org`
- **Auto Server Start**: Disabled

## Test Results

Test results are saved in multiple formats:

### JSON Results
- `postman-results-{environment}-{collection}.json`
- Contains detailed execution data, timings, and failures
- Used for programmatic analysis

### HTML Reports
- `postman-results-{environment}-{collection}.html`
- Visual test report with charts and detailed results
- Generated using newman-reporter-htmlextra

### CI/CD Results
- `test-results/postman-ci-{environment}-{collection}.json`
- `test-results/test-summary-{environment}-{collection}.json`
- Optimized for CI/CD pipeline integration

## Server Management

### Automatic Server Management
For local testing, the automation can automatically:
1. Check if server is running
2. Start server if needed
3. Wait for server readiness
4. Run tests
5. Stop server after tests

### Manual Server Management
For development or debugging:
```bash
# Start server manually
npm start

# Run tests against running server
npm run test:postman:manual
```

## Test Data

### Test User
The automation creates a test user:
- **Email**: `postman@aui.de`
- **Password**: `password123`
- **Username**: `postman-test-user`

### Test Metadata
Tests create temporary metadata items:
- `test_metadata_item` - Used for CRUD operations
- Automatically cleaned up after tests

## CI/CD Integration

### GitHub Actions Example
```yaml
name: API Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
      - run: npm ci
      - run: npm run test:ci
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results
          path: test-results/
```

### Jenkins Pipeline Example
```groovy
pipeline {
    agent any
    stages {
        stage('Setup') {
            steps {
                sh 'npm ci'
                sh 'npm run test:setup'
            }
        }
        stage('Test') {
            steps {
                sh 'npm run test:ci'
            }
            post {
                always {
                    archiveArtifacts artifacts: 'test-results/**/*', fingerprint: true
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: 'test-results',
                        reportFiles: '*.html',
                        reportName: 'Postman Test Report'
                    ])
                }
            }
        }
    }
}
```

## Troubleshooting

### Common Issues

#### Server Won't Start
```bash
# Check if port 3001 is in use
lsof -i :3001

# Kill process using port
kill -9 <PID>

# Try starting manually
npm start
```

#### Tests Fail Due to Missing Dependencies
```bash
# Reinstall dependencies
npm ci

# Install newman globally if needed
npm install -g newman
```

#### Environment Variables Missing
```bash
# Copy example environment file
cp .env.example .env

# Edit with your values
nano .env
```

#### Database Connection Issues
```bash
# Check DocumentDB connection
npm run test:db

# Verify certificates
ls -la certs/
```

### Debug Mode

Run tests with debug output:
```bash
# Enable debug logging
DEBUG=chronas-api:* npm run test:postman

# Run with verbose newman output
newman run PostmanTests/chronas-enhanced.postman_collection.json \
  -e PostmanTests/chronas-local.postman_environment.json \
  --verbose
```

## Advanced Usage

### Custom Test Execution
```bash
# Run specific environment and collection
node scripts/run-postman-tests.js dev enhanced

# Run with custom options
node scripts/run-postman-tests.js local basic --auto-start
```

### Test Data Management
```bash
# Setup test environment only
node scripts/setup-test-environment.js

# Create test user manually
curl -X POST http://localhost:3001/v1/users/ \
  -H "Content-Type: application/json" \
  -d '{"email":"postman@aui.de","password":"password123"}'
```

### Result Analysis
```bash
# Parse JSON results
node -e "
const results = require('./postman-results-local-enhanced.json');
console.log('Total requests:', results.run.stats.requests.total);
console.log('Failed requests:', results.run.stats.requests.failed);
"
```

## Performance Benchmarks

Expected performance for local testing:
- **Enhanced Collection**: ~30-60 seconds (34 requests)
- **Basic Collection**: ~10-20 seconds (varies)
- **Server Startup**: ~5-10 seconds
- **Individual Request**: <2 seconds average

## Contributing

When adding new tests:
1. Add requests to appropriate collection
2. Include proper test assertions
3. Use environment variables for URLs
4. Test against all environments
5. Update this documentation

### Test Assertion Guidelines
```javascript
// Status code validation
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Response time validation
pm.test("Response time is acceptable", function () {
    pm.expect(pm.response.responseTime).to.be.below(2000);
});

// JSON structure validation
pm.test("Response contains required fields", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('id');
    pm.expect(jsonData).to.have.property('name');
});
```