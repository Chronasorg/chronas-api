# Data Validation & Correction Guide

Tools for validating and correcting historical area data (religion, culture, ruler) against Wikidata and known historical facts.

## Quick Start

```bash
# Scan a dimension for all unique values (finds anomalies)
npm run validate:scan -- --dimension religion --api-url https://api.chronas.org

# Generate a correction report for religion data (Issue #10)
npm run validate:religion -- --api-url https://api.chronas.org

# Preview what would change (dry-run, no writes)
npm run validate:apply -- --report reports/religion-validation-refined-2026-04-20.json --api-url https://api.chronas.org --dry-run

# Apply corrections to production
npm run validate:apply -- --report reports/religion-validation-refined-2026-04-20.json --api-url https://api.chronas.org --email your@email.com --password yourpassword --apply
```

## Scripts

### `npm run validate:scan`

Scans all area data for a given dimension and reports every unique value found, its frequency, year range, and sample provinces. Flags values not registered in metadata as potential errors.

```bash
# Full options
node scripts/data-validation/scan-dimension.js \
  --dimension religion \        # religion | culture | ruler | capital
  --api-url https://api.chronas.org \
  --start -500 \                # start year (default: -500)
  --end 2000 \                  # end year (default: 2000)
  --interval 100                # sample every N years (default: 100)
```

**Output:** `reports/scan-{dimension}-{date}.json`

**Use this when:** You want to discover unknown data issues, find orphaned values, or understand the data landscape before making corrections.

### `npm run validate:religion`

Validates religion data specifically for Issue #10 (Eastern Orthodox territories). Detects provinces incorrectly tagged as `catholic` or `chalcedonism` when they should be `orthodox`, with awareness of Ottoman conquest periods (sets `sunni` during Ottoman rule).

```bash
# Full options
node scripts/data-validation/validate-religion.js \
  --api-url https://api.chronas.org \
  --start 1055 \                # start year (default: 1055, post-Great Schism)
  --end 2000 \                  # end year (default: 2000)
  --interval 5 \                # scan interval for Ottoman detection (default: 5)
  --skip-wikidata               # skip Wikidata queries, use mapping file only
```

**How it works:**
1. Scans the API for ruler data (years 1300-1920) to detect Ottoman conquest/liberation dates per province
2. Optionally queries Wikidata SPARQL for Eastern Orthodox territory references
3. Splits provinces into:
   - **Group 1** — Never Ottoman: `orthodox` for full range 1055-2000
   - **Group 2** — Ottoman period: `orthodox` → `sunni` → `orthodox` (with dates from ruler data)
4. Generates a report with pre-computed `updateMany` API calls

**Output:** `reports/religion-validation-refined-{date}.json`

### `npm run validate:apply`

Reads a validation report and applies corrections via the existing `PUT /v1/areas` (updateMany) endpoint. Only changes the specified dimension — ruler, culture, capital, and population are never touched.

```bash
# Dry-run (default — shows what would change, no writes)
node scripts/data-validation/apply-corrections.js \
  --report reports/religion-validation-refined-2026-04-20.json \
  --api-url https://api.chronas.org \
  --dry-run

# Apply with login credentials
node scripts/data-validation/apply-corrections.js \
  --report reports/religion-validation-refined-2026-04-20.json \
  --api-url https://api.chronas.org \
  --email your@email.com \
  --password yourpassword \
  --apply

# Apply with pre-obtained JWT token
node scripts/data-validation/apply-corrections.js \
  --report reports/religion-validation-refined-2026-04-20.json \
  --api-url https://api.chronas.org \
  --token eyJhbGciOi... \
  --apply
```

**Safety features:**
- Default mode is `--dry-run` (prints API calls without executing)
- `--apply` flag required to make changes
- Pre-flight check verifies data hasn't drifted since the report was generated
- All changes go through `updateMany` which creates revision records for audit/revert
- Batches in 10-year ranges for synchronous execution with revision tracking

## How updateMany Works

The `PUT /v1/areas` endpoint updates specific provinces across a year range. Area data is stored as arrays:

```
[ruler, culture, religion, capital, population]
  [0]     [1]      [2]       [3]       [4]
```

When you send `{ religion: "orthodox" }`, only index 2 is modified. The check `typeof nextBody[index] !== 'undefined'` ensures all other indices are skipped. This is called **dimension isolation** — ruler, culture, capital, and population are never touched.

## Configuration

### Wikidata Mappings (`config/wikidata-mappings.js`)

Maps Wikidata entity IDs to Chronas values and defines which provinces belong to which historical group:

- `religionFromWikidata` — Wikidata religion ID → Chronas religion key
- `easternOrthodoxProvinces` — Province name → Wikidata entity ID (for Orthodox territories)
- `westernChalcedonismProvinces` — Provinces that should be `catholic`, not `orthodox`
- `cultureCorrections` — Province-specific culture fixes for Issue #11

To add a new province to the correction scope, add it to the appropriate mapping in this file.

### Wikidata Client (`scripts/data-validation/wikidata-client.js`)

Shared SPARQL query helper. Rate-limited to 1 request/second per Wikidata policy. Retries on 429/503 with exponential backoff.

## Workflow for Fixing a New Data Issue

1. **Discover** — Run the scanner to understand the data:
   ```bash
   npm run validate:scan -- --dimension culture --api-url https://api.chronas.org --interval 50
   ```

2. **Map** — Add province-to-correct-value mappings in `config/wikidata-mappings.js`

3. **Validate** — Run the appropriate validation script (or create a new one following the pattern in `validate-religion.js`)

4. **Review** — Inspect the generated report in `reports/`:
   ```bash
   cat reports/religion-validation-refined-2026-04-20.json | python3 -m json.tool | less
   ```

5. **Dry-run** — Preview the exact API calls:
   ```bash
   npm run validate:apply -- --report reports/your-report.json --api-url https://api.chronas.org --dry-run
   ```

6. **Apply** — Execute against production:
   ```bash
   npm run validate:apply -- --report reports/your-report.json --api-url https://api.chronas.org --email x --password y --apply
   ```

7. **Verify** — Check the results:
   ```bash
   curl -s https://api.chronas.org/v1/areas/1100 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Kiev'))"
   ```

## Completed Corrections

### Issue #10 — Eastern Orthodoxy (applied 2026-04-20)

**Problem:** ~27 Eastern Orthodox territories showed `catholic` instead of `orthodox` for years 1055-2000. Some also had `chalcedonism` which is only valid pre-1054 (Great Schism).

**Fix applied:**
- **16 provinces** (never Ottoman): set to `orthodox` for years 1055-2000
  - Kiev, Volhynia, Zhytomyr, Podolia, Bratslav, Novgorod, Pskov, Tikhvin, Pereyaslav, Poltava, Minsk, Polotsk, Ruthenia, Chernigov, Georgia, Imereti
- **17 provinces** (Ottoman periods): split into orthodox/sunni/orthodox with dates derived from ruler data
  - Bulgaria, Serbia, Thrace, Bosnia, Macedonia, Larissa, Kozani, Vidin, Plovdiv, Nis, Burgas, Banat, Transylvania, Dobruja, Torontal, Hamid, Kartli

**Report:** `reports/religion-validation-refined-2026-04-20.json`

### Pending Issues

- **Issue #11 — Austronesian cultures:** Province-to-culture mappings defined in `config/wikidata-mappings.js` (`cultureCorrections`). Validation script not yet created.
- **Issue #10 — Liguria:** Still shows `chalcedonism` for 1054-2000. Should be `catholic` (Republic of Genoa, Western territory). Needs a separate targeted fix.
