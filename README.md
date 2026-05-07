[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Chronasorg/chronas-api)

# [Chronas](https://github.com/daumann/chronas) API

## Overview

This API provides authentication and CRUD operations for data used by the [Chronas](https://chronas.org) historical timeline application. Built with Node.js 22 and Express, it runs as an AWS Lambda function backed by **Amazon DynamoDB**.

The frontend is available at [Chronasorg/chronas-frontend](https://github.com/Chronasorg/chronas-frontend) ([DeepWiki](https://deepwiki.com/Chronasorg/chronas-frontend)).

### Key Stack

- **Runtime**: Node.js 22.x (native ESM) on AWS Lambda via [`@vendia/serverless-express`](https://github.com/vendia/serverless-express)
- **Database**: Amazon DynamoDB (8 in-use tables, on-demand billing)
- **Caching**: CloudFront edge cache (free tier) + in-memory Lambda cache + `Cache-Control` headers
- **Auth**: JWT + OAuth (Facebook, Google, GitHub)
- **Validation**: Joi + express-validation
- **Monitoring**: AWS X-Ray, CloudWatch dashboard
- **Testing**: Mocha + Chai + Supertest (223 tests), Newman/Postman (65 assertions across 36 requests). See [PostmanTests/](PostmanTests/)
- **Deployment**: GitHub Actions with CloudFront invalidation + auto-rollback on Postman failure
- **Cost**: ~$5-8/mo total (DynamoDB ~$3, CloudFront $0, API Gateway ~$1, Lambda ~$1)

## Getting Started

```sh
git clone https://github.com/Chronasorg/chronas-api
cd chronas-api
npm install
npm test               # runs the unit suite against dynalite (in-memory DynamoDB)
```

There is no local-server dev mode — the API is DynamoDB-only and there is no
in-memory database emulation outside the unit tests. Iterate via unit tests
locally and run end-to-end checks against the deployed dev environment with
`npm run test:postman:dev`.

## Scripts

```sh
npm test                     # Mocha unit tests against dynalite
npm run test:coverage        # c8 coverage report
npm run lint                 # ESLint with auto-fix
npm run test:postman:dev     # Newman tests against the deployed dev API
npm run test:postman:prod    # Newman tests against production
npm run validate:scan        # Inspect a data dimension across years
npm run validate:religion    # Generate religion-data correction report
npm run validate:culture     # Generate culture-data correction report
npm run validate:apply       # Apply a generated correction report (dry-run by default)
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          REQUEST FLOW                                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Browser (chronas.org)                                                   │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────┐                                 │
│  │  CloudFront (d24mkpax7rmotx)        │  Layer 1: Edge Cache            │
│  │  Cache-Control + query string key   │  FREE tier (10M req/mo)         │
│  │                                     │                                 │
│  │  HIT → return cached response       │  ~80% of requests               │
│  │  MISS ↓                             │                                 │
│  └──────┬──────────────────────────────┘                                 │
│         ▼                                                                │
│  ┌─────────────────────────────────────┐                                 │
│  │  API Gateway (HTTP API)             │  Routing + throttling            │
│  │  2g4uy0bdoe.execute-api.eu-west-1   │                                 │
│  └──────┬──────────────────────────────┘                                 │
│         ▼                                                                │
│  ┌─────────────────────────────────────┐                                 │
│  │  Lambda (Node.js 22, 512MB)         │  Layer 2: In-Memory Cache       │
│  │                                     │                                 │
│  │  memory-cache:                      │  Areas: 24h TTL                 │
│  │    area:{year} → 100-500KB          │  Metadata queries: 7-day TTL    │
│  │    query:{params} → results         │                                 │
│  │    init:{fList} → init bundle       │                                 │
│  │                                     │                                 │
│  │  HIT → return from memory           │  ~50% of remaining requests     │
│  │  MISS ↓                             │                                 │
│  └──────┬──────────────────────────────┘                                 │
│         ▼                                                                │
│  ┌─────────────────────────────────────┐                                 │
│  │  DynamoDB (8 tables, on-demand)    │  Layer 3: Database              │
│  │                                     │                                 │
│  │  Markers:  GSI-TypeYear queries     │  Only ~10% of original          │
│  │  Board:    GSI-ForumId queries      │  traffic reaches here           │
│  │  Areas:    GetItem by year          │                                 │
│  │  Metadata: BatchGet or Scan+filter  │                                 │
│  └─────────────────────────────────────┘                                 │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                       CACHE TTL STRATEGY                                  │
├──────────────────────┬───────────────────┬───────────────────────────────┤
│  Endpoint            │ CDN (s-maxage)    │ Browser (max-age)             │
├──────────────────────┼───────────────────┼───────────────────────────────┤
│  /v1/areas/:year     │ 7 days            │ 1 day                         │
│  /v1/metadata?f=...  │ 1 day             │ 1 hour                        │
│  /v1/metadata/:id    │ 1 day             │ 1 hour                        │
│  /v1/markers?year=   │ 1 hour            │ 5 minutes                     │
│  /v1/board/forum/... │ 5 minutes         │ 1 minute                      │
│  POST/PUT/DELETE     │ no cache           │ no cache                      │
└──────────────────────┴───────────────────┴───────────────────────────────┘
```

### Cost Breakdown (~$13/month total)

| Service | Cost | Notes |
|---------|------|-------|
| DynamoDB | ~$10 | 8 tables, on-demand, GSI queries |
| CloudFront | $0 | Free tier (1.7M req/mo < 10M limit) |
| API Gateway | ~$0.50 | HTTP API, reduced by CF cache |
| Lambda | ~$0.80 | ~24K invocations/day |
| Route 53 | $0.50 | Hosted zone |
| Other | ~$1 | Secrets Manager, S3, CloudWatch |

### Key Design Decisions

- **CloudFront** caches API responses at the edge without DNS changes — frontend points directly to the CF domain
- **Cache-Control headers** on every GET endpoint give browsers and CDN appropriate TTLs based on data volatility
- **GSI-based queries** on markers (GSI-TypeYear) and board (GSI-ForumId) eliminate full table scans
- **In-memory Lambda cache** for areas (24h) and metadata queries (7-day) reduces cold-start DynamoDB reads
- **Cache invalidation**: metadata clears on write (prefix-targeted), areas invalidate specific year on write, CloudFront invalidated on deploy

## Deployment

Production deployment is fully automated via **GitHub Actions** (the sole active pipeline):

1. Push to `master` triggers the workflow
2. Runs unit tests — blocks deploy if any fail
3. Deploys to Lambda via S3
4. **Invalidates CloudFront cache** (`/v1/*`)
5. Runs **Postman smoke tests against production**
6. If Postman tests fail → **automatic Lambda rollback** to previous version
7. If Postman tests pass → bumps version and pushes `[skip ci]` commit

The deploy workflow lives at [`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml). PR checks (Mocha unit tests) run via [`.github/workflows/pr-ci.yml`](.github/workflows/pr-ci.yml). See [CLAUDE.md](CLAUDE.md) and [infra/README.md](infra/README.md) for the full production architecture and infrastructure runbook.

Legacy: AWS CodeBuild, Azure Pipelines, Docker/Kubernetes, and DocumentDB are all decommissioned. GitHub Actions is the sole deployment mechanism.
