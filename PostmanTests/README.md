# Chronas API Postman Tests

Newman/Postman test collections for the deployed Chronas API. The collections
run against the **dev** or **production** environment only — there is no
local server (the API is DynamoDB-only with no in-memory emulation outside
the Mocha unit tests).

## Files

### Collections

- `chronas-enhanced.postman_collection.json` — primary collection used by the
  deploy pipeline (post-deploy smoke + auto-rollback on failure)
- `chronas.postman_collection.json` — older basic collection, retained for
  ad-hoc manual runs via `node scripts/run-postman-tests.js <env> basic`

### Environments

- `chronas-dev.postman_environment.json` — dev API
- `chronas-api.postman_environment.json` — production (`https://api.chronas.org`)

## Running

From the repo root, use the npm scripts:

```sh
npm run test:postman:dev    # dev environment
npm run test:postman:prod   # production
```

Both wrap [`scripts/run-postman-tests.js`](../scripts/run-postman-tests.js),
which uses the `enhanced` collection by default. To run the basic collection
manually:

```sh
node scripts/run-postman-tests.js dev basic
node scripts/run-postman-tests.js prod basic
```

Result JSONs are written to `postman-results-<env>-<collection>.json`
(gitignored).

## Continuous monitoring

`monitor_tests.sh` runs the enhanced collection against production every 30
seconds for 3 minutes and renders an HTML report. Useful for on-call spot
checks; not part of any pipeline.

```sh
cd PostmanTests && ./monitor_tests.sh
```

## CI integration

The production deploy workflow ([`.github/workflows/deploy-prod.yml`](../.github/workflows/deploy-prod.yml))
runs the enhanced collection against `https://api.chronas.org` after every
deploy and rolls the Lambda back to the previous S3 zip if any assertion
fails.
