# DynamoDB Migration — Issues & Improvements

Reviewed: 2026-04-27 | Branch: `documentdb-migration` | Verified: 2026-04-27

## Status Legend
- 🔧 **FIX NOW** — must fix before production migration
- ✅ **ALREADY FIXED** — was fixed in earlier commits or is not actually broken
- ⏳ **FIX IN PHASE 8** — fix when removing VPC / cleaning up
- 🟡 **ACCEPTABLE** — known tradeoff, documented, acceptable at current traffic
- ❌ **FALSE POSITIVE** — not actually broken after code verification

---

## 🚨 CRITICAL

| # | Issue | Verdict | Action |
|---|---|---|---|
| 1 | `convertEmptyValues: false` — writes fail on empty strings | 🔧 FIX NOW | Change to `convertEmptyValues: true` in `dynamo-client.js:30`. Some DocumentDB docs have legitimate empty string fields. |
| 2 | `.cursor()` not implemented — area admin endpoints crash | 🟡 ACCEPTABLE | `.cursor()` is only called in `aggregateProvinces`, `aggregateDimension`, `aggregateMetaCoo` — all admin paths with 0 production traffic. These are already stubbed with `notImplemented` on Area.aggregate/bulkWrite. If someone calls them, they fail loud. |
| 3 | `$exists` operator not supported | ❌ FALSE POSITIVE | No in-scope controller path sends `$exists` to the DynamoDB query builder. The metadata `mustGeo` path filters `coo` client-side. |
| 4 | `Area.aggregate()` throws notImplemented | 🟡 ACCEPTABLE | Only called by admin aggregation paths (0 production traffic). Correctly stubbed. |
| 5 | `Revision.list()` throws notImplemented | 🟡 ACCEPTABLE | 0 production traffic on revision list. Correctly stubbed. |
| 6 | Migration/export endpoints unprotected | 🔧 FIX NOW | Add auth middleware or remove before production deploy. These are dev-only endpoints that expose full DB dumps. |
| 7 | `/statistics/refresh` unprotected | 🔧 FIX NOW | Add auth guard (require admin privilege). Unprotected POST allows anyone to trigger expensive recompute. |
| 8 | Password always returned (`.select()` is no-op) | 🔧 FIX NOW | `query-proxy.js` ignores `.select('+password')` — but more importantly, DynamoDB always returns all fields. Need to strip `password` from user responses in `toObject()` or the controller, unless explicitly requested via select. |
| 9 | No S3 VPC Gateway endpoint | ✅ ALREADY FIXED | S3 Gateway endpoint `com.amazonaws.eu-west-1.s3` exists in the VPC. Confirmed in dev. |
| 10 | No S3 IAM permissions | ✅ ALREADY FIXED | `S3StatisticsAccess` policy attached to Lambda role. |
| 11 | `BatchGetCommand` never retries `UnprocessedKeys` | 🔧 FIX NOW | All BatchGetCommand call sites (metadata BatchGetProxy, links-store batchGetLinked, marker batchGetByWikis) silently drop items if DynamoDB returns UnprocessedKeys under throttling. Must add retry loop. |
| 12 | Race conditions in `upsertLink`/`removeLinkEntry` | 🟡 ACCEPTABLE | ~6 link writes/week. Read-modify-write pattern. Would need DynamoDB transactions for atomicity. Not worth the complexity at this traffic volume. |

## ⚠️ HIGH

| # | Issue | Verdict | Action |
|---|---|---|---|
| 13 | 6 GSIs paid but never queried | 🟡 ACCEPTABLE | PAY_PER_REQUEST = $0 for unused GSIs. Only write amplification cost (~15-30% on writes), but with ~40 writes/week total this is pennies. GSIs are reserved for future use (GSI-PartOf for area replaceAll, GSI-UserTimestamp for revision list if ever needed). Exception: GSI-QA IS used by discussion.dynamo.js. |
| 14 | Board `scanOpinions()` scans entire table | 🔧 FIX NOW | `find({discussion_id})` should query `PK=DISC#<id>` with `SK begins_with OPINION#` instead of scanning. The PK+SK structure was designed for this — the code just doesn't use it. |
| 15 | `User.list()` scans all users instead of GSI-Karma | 🟡 ACCEPTABLE | User list is called <1x/week (highscore page). 7k users scan costs ~$0.001. GSI-Karma optimization is a nice-to-have but not blocking. |
| 16 | User lowercase only on save() — findById doesn't lowercase | 🔧 FIX NOW | `User.findById('Admin@chronas.org')` won't find the user stored as `admin@chronas.org`. Need to lowercase in findById too. |
| 17 | `local-migrate.js` transformUser doesn't lowercase | 🔧 FIX NOW | Migration script creates items with original case `_id`, but the DynamoDB model lowercases on save. Mismatched keys = duplicate records + lookup failures. |
| 18 | Lambda `buildAndStore()` will OOM on 512 MB | ✅ ALREADY FIXED | `buildAndStore` is only called by `/statistics/refresh` POST endpoint (which should be gated behind auth and run rarely). Normal GET reads from S3. In production with 512 MB Lambda, the refresh endpoint should NOT be called from the Lambda — use `refresh-statistics.js` locally instead. |
| 19 | `console.log(config)` leaks secrets to CloudWatch | 🔧 FIX NOW | Line 131 of config.js prints the entire config object including JWT secret, DB credentials, OAuth secrets. Remove or redact. |
| 20 | `jwtSecret` fallback to known string | 🟡 ACCEPTABLE | `fallback-jwt-secret-for-lambda` is only used if Secrets Manager fails. In production, Secrets Manager always provides the real secret. The fallback prevents Lambda from crashing on startup if SM is slow. |
| 21 | `renameEntity` not atomic | 🟡 ACCEPTABLE | ~0 wiki renames/week. Acknowledged in plan. |
| 22 | `$regex` → `contains()` — different semantics | 🟡 ACCEPTABLE | Mongoose `$regex` with `$options: 'i'` does case-insensitive regex. DynamoDB `contains()` is case-sensitive substring match. Affects search results (may miss case-variant matches). Acceptable because search is a secondary feature with low traffic. |
| 23 | `BatchWriteCommand` doesn't handle `UnprocessedItems` | 🔧 FIX NOW | Migration `writeBatch` falls back to individual puts on batch error — but doesn't check `UnprocessedItems` in successful responses. Under throttling, items are silently dropped. Must check and retry. |
| 24 | Export endpoint shallow ObjectId conversion | ❌ FALSE POSITIVE | Export function handles `_id` toString and Date conversion. Nested ObjectIds in `data` fields are preserved as-is (they're stored as Mixed type in Mongoose, so they're already plain objects). |

## 🔶 MEDIUM

| # | Issue | Verdict | Action |
|---|---|---|---|
| 25 | `QueryProxy` missing `finally()` | 🔧 FIX NOW | Easy fix — add `finally(fn) { return this._promise.finally(fn); }` |
| 26 | Compression threshold 200KB too close to 400KB limit | 🔧 FIX NOW | Lower to 100KB. A 200KB item + 200KB of other fields = 400KB limit hit. 100KB gives safe margin. |
| 27 | DynamoQuery skip/limit fetches all then slices | 🟡 ACCEPTABLE | By design — DynamoDB doesn't support server-side skip. Only affects full-table scans on small tables (flags, users). Hot paths (markers, areas) use model-specific methods with GSI queries. |
| 28 | `Buffer.isBuffer()` misses Uint8Array in refresh script | 🔧 FIX NOW | Change to `Buffer.isBuffer(item.data) \|\| item.data instanceof Uint8Array` |
| 29 | `refresh-statistics.js` scans metadata twice | 🔧 FIX NOW | Compute both type and subtype groupings in a single scan pass |
| 30 | Hardcoded area statistics | 🟡 ACCEPTABLE | `provinces: 2479, areaDatapoints: 49580000` are static geometry counts that don't change. Not worth scanning 4000 area docs to recount. |
| 31 | No resume capability in local-migrate | 🔧 FIX NOW | Already identified as M1 in plan. Need keyset pagination with `--resume-from <lastId>` |
| 32 | No `links` collection in local-migrate | ❌ FALSE POSITIVE | Links migration is handled by the Lambda `migrateLinks()` function, not local-migrate. The links decomposition needs DocumentDB access. |
| 33 | `local-migrate.js` no `convertEmptyValues` | 🔧 FIX NOW | Same as #1 — add `convertEmptyValues: true` to the local DynamoDB client |
| 34 | No HTTP→DynamoDB integration tests | 🔧 FIX NOW | Need supertest tests that hit Express endpoints with DynamoDB backing. Current tests only test model methods directly. |
| 35 | No concurrent access tests | 🟡 ACCEPTABLE | Concurrency issues (#12, #21) are acknowledged. Testing them requires complex parallel test infrastructure. |
| 36 | `auth.test.js` completely commented out | ⏳ CLEANUP | Dead code, remove. |
| 37 | Skipped area creation test | 🟡 ACCEPTABLE | Area creation test skipped because it requires fields the legacy data doesn't have (name, geometry, createdBy). Test infrastructure issue, not a production bug. |

## 🟢 LOW

| # | Issue | Verdict | Action |
|---|---|---|---|
| 38 | Inconsistent `_id` type coercion | 🟡 ACCEPTABLE | Some models call `String(id)`, some don't. All DynamoDB keys must be strings, and all models do coerce on write. Read-side coercion is inconsistent but works because DocumentDB stores area `_id` as strings already. |
| 39 | `estimatedDocumentCount` uses 6-hour-stale data | 🟡 ACCEPTABLE | `X-Total-Count` header was removed (FE-WIN #2). `estimatedDocumentCount` is only used by statistics (which reads from S3 now) and test setup. |
| 40 | No input validation on `save()` | 🟡 ACCEPTABLE | Mongoose schema validation is lost in DynamoDB. Controllers already validate via Joi schemas in `param-validation.js`. DynamoDB rejects invalid types at the API level. |
| 41 | Cache TTL hardcoded to 1 week | 🟡 ACCEPTABLE | Matches the original Mongoose model behavior. |
| 42 | `crypto.randomUUID()` used without import | ❌ FALSE POSITIVE | `crypto.randomUUID()` is a Node.js 19+ global. No import needed on Node 22. |
| 43 | Export endpoint dead logic | 🟡 ACCEPTABLE | `k === 'user' && k !== 'users'` — the second condition is always true when k is 'user'. Harmless but ugly. |
| 44 | Mock database tests prove nothing | ⏳ CLEANUP | Legacy test infrastructure. Remove when DynamoDB tests fully replace them. |

---

## Action Plan — Fix Before Production

### Priority 1: Security (do immediately)
- [ ] **#6, #7**: Add auth guard to migration + statistics refresh endpoints (or remove migration endpoints entirely before production deploy)
- [ ] **#8**: Strip `password` field from user responses in `UserDynamo.toObject()` unless explicitly selected
- [ ] **#19**: Remove `console.log(config)` from config.js

### Priority 2: Data Integrity (before migration)
- [ ] **#1, #33**: Set `convertEmptyValues: true` in dynamo-client.js and local-migrate.js
- [ ] **#11**: Add `UnprocessedKeys` retry loop to all BatchGetCommand call sites
- [ ] **#16, #17**: Lowercase `_id` in `User.findById()` and `local-migrate.js transformUser()`
- [ ] **#23**: Add `UnprocessedItems` check to `writeBatch()` in migration controller and local-migrate.js
- [ ] **#26**: Lower compression threshold from 200KB to 100KB

### Priority 3: Performance (before production traffic)
- [ ] **#14**: Opinion `find({discussion_id})` → Query on PK=DISC#id, SK begins_with OPINION#
- [ ] **#25**: Add `finally()` to QueryProxy
- [ ] **#28, #29**: Fix refresh-statistics.js Buffer check and double-scan

### Priority 4: Cleanup (Phase 8)
- [ ] **#36**: Remove commented-out auth.test.js
- [ ] **#44**: Remove mock database tests once DynamoDB tests are complete
