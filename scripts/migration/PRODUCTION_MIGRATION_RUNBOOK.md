# Production Migration Runbook — DocumentDB → DynamoDB

Lessons learned from the dev account migration (704516356990, 2026-04-27).

## Prerequisites (before running any migration)

### 1. DynamoDB Gateway VPC Endpoint (REQUIRED)
The Lambda is in a VPC with no internet access. DynamoDB is NOT accessible without a VPC endpoint.

```bash
# Check existing endpoints
aws ec2 describe-vpc-endpoints --profile chronas --region eu-west-1 \
  --filters "Name=vpc-id,Values=<VPC_ID>" \
  --query 'VpcEndpoints[].ServiceName'

# Create DynamoDB Gateway endpoint (FREE — unlike interface endpoints)
ROUTE_TABLES=$(aws ec2 describe-route-tables --profile chronas --region eu-west-1 \
  --filters "Name=vpc-id,Values=<VPC_ID>" \
  --query 'RouteTables[].RouteTableId' --output text)

aws ec2 create-vpc-endpoint \
  --vpc-id <VPC_ID> \
  --service-name com.amazonaws.eu-west-1.dynamodb \
  --vpc-endpoint-type Gateway \
  --route-table-ids $ROUTE_TABLES \
  --profile chronas --region eu-west-1
```

### 2. Lambda IAM Permissions
The Lambda role needs DynamoDB access. Attach this inline policy:

```bash
aws iam put-role-policy \
  --role-name <LAMBDA_ROLE_NAME> \
  --policy-name DynamoDBMigrationAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["dynamodb:*"],
      "Resource": [
        "arn:aws:dynamodb:eu-west-1:<ACCOUNT_ID>:table/chronas-*",
        "arn:aws:dynamodb:eu-west-1:<ACCOUNT_ID>:table/chronas-*/index/*"
      ]
    }]
  }' --profile chronas
```

**IAM propagation takes 30-60 seconds.** Wait before running migrations.

### 3. Lambda Timeout
Set Lambda timeout to 300s for migration (restore to 30s after):

```bash
aws lambda update-function-configuration \
  --function-name <FUNCTION_NAME> \
  --timeout 300 --profile chronas --region eu-west-1
```

## Migration Order and Known Issues

### Areas (~4,000 docs, 85-145 KB each)
**Must migrate in batches of 500.** Full collection exceeds 300s Lambda timeout.

```
/v1/migration/run?collection=areas&skip=0&limit=500
/v1/migration/run?collection=areas&skip=500&limit=500
... repeat until skip=4000
```

### Markers (114,321 docs, tiny)
**Null year values:** Some markers have `year: null`. The migration sets these to `year: 0` so they can be stored in the GSI-TypeYear index. The original null value is preserved in spirit — these markers don't appear in year-filtered queries either way.

Single invocation works fine (114k × ~200B = ~23 MB, completes in ~60s).

### Metadata (38,252 docs, variable size)
**Skip the `links` document:** `_id='links'` is the monolithic links singleton. It's decomposed into the `chronas-links` table instead. The migration transform returns `null` for this doc.

**Empty attribute names:** Some metadata `data` objects have empty string keys (`"": value`). DynamoDB rejects these. The transform strips them.

**Gzip compression:** Items with data >200 KB (provinces, ruler) are automatically gzipped via `prepareForWrite()`. This is transparent on read via `decodeFromRead()`.

### Users (7,169 docs)
**Empty `_id` values:** 2 user documents have empty/null `_id` fields. These are skipped (returned as `null` from transform). No real user data is lost — these are likely broken records.

**`_entity: 'USER'` field added** for the GSI-Karma index partition key.

### Links (1 document → 9,493 items)
**This is NOT a normal collection migration.** The `links` endpoint decomposes the single `Metadata._id='links'` document into per-entity items in `chronas-links`.

Each key in `links.data` (e.g., `"0:Battle_of_Hastings"`) becomes one DynamoDB item with `entityRef` as the PK.

### Revisions (6,040 docs, some very large)
**Oversized body fields:** Some revision `nextBody`/`prevBody` strings exceed 400 KB even as JSON strings. Two mitigations:
1. **Gzip compression** for body fields >50 KB (stored as Binary, flagged with `nextBodyCompressed: true` / `prevBodyCompressed: true`)
2. **Individual-put fallback:** When a BatchWriteItem fails (one oversized item blocks the batch of 25), the migration falls back to individual PutItem per item, logging failures

In dev, 6,039 of 6,040 migrated. 1 document is too large even after gzip (>400 KB compressed). This is acceptable — it's an old bulk-edit revision with an enormous body.

### Flags (435 docs)
No issues. Single invocation.

### Board (forums + discussions + opinions = 36,432 items)
**Run in this order:** forums first, then discussions, then opinions.

Forums and discussions need to be migrated before opinions because opinions reference discussion IDs in their PK (`DISC#<id>`).

No size issues. Single invocation per sub-collection.

## Invocation Method

The migration runs through a temporary endpoint on the Lambda (`/v1/migration/run`). **Invoke via Lambda directly** — API Gateway has a 29s timeout that's too short.

```bash
# Write event payload to file
node -e "const fs=require('fs');fs.writeFileSync('/tmp/mig-event.json',JSON.stringify({
  version:'2.0',routeKey:'GET /v1/migration/run',rawPath:'/v1/migration/run',
  rawQueryString:'collection=COLLECTION_NAME',
  headers:{host:'lambda.local'},
  queryStringParameters:{collection:'COLLECTION_NAME'},
  requestContext:{http:{method:'GET',path:'/v1/migration/run'},stage:'\$default'},
  isBase64Encoded:false
}));"

# Invoke Lambda directly (bypasses API Gateway timeout)
aws lambda invoke \
  --function-name <FUNCTION_NAME> \
  --profile chronas --region eu-west-1 \
  --cli-read-timeout 300 \
  --payload fileb:///tmp/mig-event.json \
  /tmp/mig-result.json

# Check result
node -e "const r=require('/tmp/mig-result.json');console.log(JSON.parse(r.body))"
```

## Post-Migration Verification

```bash
# Compare counts (DynamoDB ItemCount is eventually consistent — use scan)
aws dynamodb scan --table-name chronas-<TABLE> --profile chronas \
  --region eu-west-1 --select COUNT --output json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).ScannedCount))"
```

## Zero-Downtime Flag Flip

After migration, flip flags one at a time. DocumentDB continues running. No downtime.

```bash
# Flip one collection at a time
./scripts/migration/20-flip-lambda-env.sh \
  --function <FUNCTION_NAME> \
  --flag USE_DYNAMODB_AREAS=true

# Run Postman tests after each flip
npm run test:postman:prod

# If tests pass, flip the next one
```

## Cleanup After Migration

1. Remove the `/v1/migration/run` route from `index.route.js`
2. Delete `migration.controller.js`
3. Restore Lambda timeout to 30s
4. Remove `DynamoDBMigrationAccess` inline policy (keep the managed policy for runtime)
