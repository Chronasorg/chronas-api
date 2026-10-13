[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/Chronasorg/chronas-api)

# [Chronas](https://github.com/daumann/chronas) API

## Overview

This API provides authentication and CRUD operations for data used by the [Chronas](https://chronas.org) historical timeline application. Built with Node.js 24 and Express, it runs as an AWS Lambda Web Function behind CloudFront, backed by **Amazon DynamoDB**.

The frontend is available at [Chronasorg/chronas-frontend](https://github.com/Chronasorg/chronas-frontend) ([DeepWiki](https://deepwiki.com/Chronasorg/chronas-frontend)).

### Key Stack

- **Runtime**: Node.js 24 (native ESM) as an [AWS Lambda Web Function](https://docs.aws.amazon.com/lambda/latest/dg/web-functions.html): a plain HTTP server (`index.js` → `web-server.js`), no adapter
- **Database**: Amazon DynamoDB (8 in-use tables, on-demand billing)
- **Caching**: CloudFront edge cache (free tier) + bounded in-memory caches + `Cache-Control` headers
- **Auth**: JWT (email and password; social logins retired 2026-10-13)
- **Validation**: Joi + express-validation
- **Monitoring**: AWS X-Ray, CloudWatch dashboard
- **Testing**: Mocha + Chai + Supertest (223 tests), Newman/Postman (65 assertions across 36 requests). See [PostmanTests/](PostmanTests/)
- **Deployment**: GitHub Actions with CloudFront invalidation + auto-rollback on Postman failure
- **Cost**: September 2026 $5.56; the Web Function adds about $8–12/mo

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

```text
chronas.org (frontend) ──► d24mkpax7rmotx.cloudfront.net ─┐
api.chronas.org (legacy site, third parties) ── alias ────┤  CloudFront E1KTIK2H0W8J2Q
                                                           │  edge cache for public map data
                                                           ▼  OAC (signed requests only)
                                       Lambda Web Function "chronas-api" (Node 24, arm64)
                                                           │  bounded in-memory caches
                                                           ▼
                                       DynamoDB · S3 (statistics) · Secrets Manager
```

| Endpoint | CDN (`s-maxage`) | Browser (`max-age`) |
| --- | --- | --- |
| `/v1/areas/:year` | 7 days | 1 day |
| `/v1/metadata?f=…`, `/v1/metadata/:id` | 1 day | 1 hour |
| `/v1/metadata?type=e…` | 12 hours | 30 minutes |
| `/v1/markers?year=…`, other metadata lists | 1 hour | 5 minutes |
| `/v1/metadata/:id/getLinked` | 1 hour | 0 (revalidate) |
| everything else, all errors, all writes | `no-store` | `no-store` |

CloudFront keys on `Authorization`, so a logged-in response is never served to someone else, and it doesn't cache 5xx responses. The frontend sends the token only on requests that need it, so public map reads share one edge entry. Details: [infra/README.md](infra/README.md) and [docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md](docs/API_CLOUDFRONT_WEB_FUNCTIONS_PLAN.md).

## Deployment

Fully automated via **GitHub Actions**, [`.github/workflows/deploy-prod.yml`](.github/workflows/deploy-prod.yml), on every push to `master`:

1. Unit and integration tests on Node 24; a failure blocks the deploy.
2. New Web Function revision from the zipped package; the `prod` endpoint moves to it.
3. CloudFront invalidation of `/v1/*`.
4. `/v1/version` must report the new commit, then **Postman smoke tests against production**.
5. On any failure: **automatic rollback** to the previous revision.
6. On success: version bump with a `[skip ci]` commit.

PR checks run via [`.github/workflows/pr-ci.yml`](.github/workflows/pr-ci.yml). See [CLAUDE.md](CLAUDE.md) and [infra/README.md](infra/README.md) for the production architecture.

## License

Chronas uses a split license for code and data:

- **Code** — [MIT License](LICENSE). Reuse the source freely with attribution.
- **Data** — [CC BY-SA 4.0](DATA-LICENSE.md). The historical data served by the
  API (province/area geometry, per-year ruler/culture/religion/capital data, etc.)
  is derived substantially from Wikipedia and inherits its attribution +
  share-alike terms.

If you build on the Chronas data, please credit Chronas (https://chronas.org)
and honor the underlying Wikipedia sources. Caching a local copy is preferred
over heavy live API use — see [DATA-LICENSE.md](DATA-LICENSE.md).
