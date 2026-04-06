[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Chronasorg/chronas-api)

# [Chronas](https://github.com/daumann/chronas) API

## Overview

This API provides authentication and CRUD operations for data used by the [Chronas](https://chronas.org) historical timeline application. Built with Node.js 22, Express, and Mongoose, it runs as an AWS Lambda function backed by Amazon DocumentDB.

The frontend is available at [Chronasorg/chronas-frontend](https://github.com/Chronasorg/chronas-frontend) ([DeepWiki](https://deepwiki.com/Chronasorg/chronas-frontend)).

### Key Stack

- **Runtime**: Node.js 22.x (native ESM) on AWS Lambda via [`@vendia/serverless-express`](https://github.com/vendia/serverless-express)
- **Database**: Amazon DocumentDB (MongoDB-compatible) with TLS
- **Auth**: JWT + OAuth (Facebook, Google, GitHub)
- **Validation**: Joi + express-validation
- **Monitoring**: AWS X-Ray, Application Insights
- **API Docs**: Swagger UI at [`/api-docs`](https://api.chronas.org/api-docs)
- **Testing**: Mocha + Chai + Supertest (unit/integration), Newman/Postman (API-level). See [PostmanTests/](PostmanTests/)
- **Infrastructure**: AWS CDK v2 (separate [chronas-cdk](https://github.com/Chronasorg/chronas-cdk) repo)

## Getting Started

```sh
git clone https://github.com/Chronasorg/chronas-api
cd chronas-api
npm install
cp .env.example .env   # configure JWT_SECRET, MONGO_HOST, etc.
```

Start a local MongoDB:
```sh
docker run -d --name mongodatabase -p 27017:27017 mongo
```

Start the dev server:
```sh
npm start              # runs on port 4040 with debug logging
```

## Scripts

```sh
npm start                    # Dev server (port 4040)
npm run start:debug          # Dev server with --inspect
npm test                     # Mocha tests
npm run test:coverage        # c8 coverage report
npm run lint                 # ESLint with auto-fix
npm run test:postman         # Newman tests against local server
npm run test:postman:prod    # Newman tests against production
```

## Deployment

Production deployment is via AWS Lambda + API Gateway, managed by CDK:

```sh
npm run deploy:prod          # Deploys via CDK from ../chronas-cdk
```

See [docs/LAMBDA_OPTIMIZATION.md](docs/LAMBDA_OPTIMIZATION.md) for Lambda architecture details and [docs/DATABASE_CONNECTION.md](docs/DATABASE_CONNECTION.md) for DocumentDB connection setup.
