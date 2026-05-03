[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Chronasorg/chronas-api)

# [Chronas](https://github.com/daumann/chronas) API

## Overview

This API provides authentication and CRUD operations for data used by the [Chronas](https://chronas.org) historical timeline application. Built with Node.js 22 and Express, it runs as an AWS Lambda function backed by **Amazon DynamoDB**.

The frontend is available at [Chronasorg/chronas-frontend](https://github.com/Chronasorg/chronas-frontend) ([DeepWiki](https://deepwiki.com/Chronasorg/chronas-frontend)).

### Key Stack

- **Runtime**: Node.js 22.x (native ESM) on AWS Lambda via [`@vendia/serverless-express`](https://github.com/vendia/serverless-express)
- **Database**: Amazon DynamoDB (10 tables, on-demand billing)
- **Caching**: CloudFront edge cache (free tier) + in-memory Lambda cache + `Cache-Control` headers
- **Auth**: JWT + OAuth (Facebook, Google, GitHub)
- **Validation**: Joi + express-validation
- **Monitoring**: AWS X-Ray, CloudWatch dashboard
- **Testing**: Mocha + Chai + Supertest (246 tests), Newman/Postman (76 assertions). See [PostmanTests/](PostmanTests/)
- **Deployment**: GitHub Actions with CloudFront invalidation + auto-rollback on Postman failure
- **Cost**: ~$5-8/mo total (DynamoDB ~$3, CloudFront $0, API Gateway ~$1, Lambda ~$1)

## Getting Started

```sh
git clone https://github.com/Chronasorg/chronas-api
cd chronas-api
npm install
cp .env.example .env   # configure JWT_SECRET
npm start              # dev server on port 3001 (in-memory DB, no external deps)
```

## Scripts

```sh
npm start                    # Dev server (port 4040)
npm run start:debug          # Dev server with --inspect
npm test                     # Mocha tests (150+ tests)
npm run test:all             # Mocha + Postman tests
npm run test:coverage        # c8 coverage report
npm run lint                 # ESLint with auto-fix
npm run test:postman         # Newman tests against local server
npm run test:postman:prod    # Newman tests against production
```

## Architecture

```
User → CloudFront (edge cache, api.chronas.org)
       ↓ cache hit → instant response ($0 DynamoDB cost)
       ↓ cache miss → API Gateway → Lambda → DynamoDB
```

- **CloudFront** distribution `E1KTIK2H0W8J2Q` caches all GET responses at the edge
- **Cache-Control headers** on every endpoint control TTLs (areas: 7 days, metadata: 1 day, markers: 1 hour, board: 5 min)
- **In-memory Lambda cache** for areas (24h TTL) and metadata queries (7-day TTL)
- **GSI-based queries** on markers (GSI-TypeYear) and board (GSI-ForumId) eliminate full table scans

## Deployment

Production deployment is fully automated via **GitHub Actions** (the sole active pipeline):

1. Push to `master` triggers the workflow
2. Runs unit tests — blocks deploy if any fail
3. Deploys to Lambda via S3
4. **Invalidates CloudFront cache** (`/v1/*`)
5. Runs **Postman smoke tests against production**
6. If Postman tests fail → **automatic Lambda rollback** to previous version
7. If Postman tests pass → bumps version and pushes `[skip ci]` commit

See [docs/DEPLOYMENT_AND_TESTING.md](docs/DEPLOYMENT_AND_TESTING.md) for full pipeline details, test coverage, and rollback behavior.

Legacy: AWS CodeBuild, Azure Pipelines, Docker/Kubernetes, and DocumentDB are all decommissioned. GitHub Actions is the sole deployment mechanism.
