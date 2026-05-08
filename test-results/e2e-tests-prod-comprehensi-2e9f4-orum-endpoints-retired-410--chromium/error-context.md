# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-tests/prod-comprehensive.spec.js >> Production API — backing services (api.chronas.org) >> forum endpoints retired (410)
- Location: e2e-tests/prod-comprehensive.spec.js:132:3

# Error details

```
Error: /game should be 410

expect(received).toBe(expected) // Object.is equality

Expected: 410
Received: 404
```

# Test source

```ts
  42  | 
  43  |   test('right drawer / info panel can be opened by clicking the map', async ({ page }) => {
  44  |     await page.goto(FRONTEND, { timeout: 30000 });
  45  |     const canvas = page.locator('canvas.mapboxgl-canvas').first();
  46  |     await expect(canvas).toBeVisible({ timeout: 20000 });
  47  |     await page.waitForTimeout(4000);
  48  |     const box = await canvas.boundingBox();
  49  |     if (!box) test.skip();
  50  |     await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  51  |     await page.waitForTimeout(1500);
  52  |   });
  53  | 
  54  |   test('configuration / settings route loads', async ({ page }) => {
  55  |     await page.goto(`${FRONTEND}/#/configuration`, { timeout: 30000 });
  56  |     await page.waitForLoadState('domcontentloaded');
  57  |     await expect(page).toHaveTitle(/chronas/i);
  58  |   });
  59  | 
  60  |   test('discover route loads', async ({ page }) => {
  61  |     await page.goto(`${FRONTEND}/#/discover`, { timeout: 30000 });
  62  |     await page.waitForLoadState('domcontentloaded');
  63  |     await expect(page).toHaveTitle(/chronas/i);
  64  |   });
  65  | 
  66  |   test('login route loads', async ({ page }) => {
  67  |     await page.goto(`${FRONTEND}/#/login`, { timeout: 30000 });
  68  |     await page.waitForLoadState('domcontentloaded');
  69  |     await expect(page).toHaveTitle(/chronas/i);
  70  |   });
  71  | });
  72  | 
  73  | test.describe('Production API — backing services (api.chronas.org)', () => {
  74  |   test('health check', async ({ request }) => {
  75  |     const res = await request.get(`${API}/health`);
  76  |     expect(res.ok()).toBeTruthy();
  77  |     expect(await res.text()).toBe('Health OK');
  78  |   });
  79  | 
  80  |   test('version endpoint', async ({ request }) => {
  81  |     const res = await request.get(`${API}/version`);
  82  |     expect(res.ok()).toBeTruthy();
  83  |     const body = await res.json();
  84  |     expect(body).toHaveProperty('version');
  85  |   });
  86  | 
  87  |   test('areas/2000 returns province data', async ({ request }) => {
  88  |     const res = await request.get(`${API}/areas/2000`);
  89  |     expect(res.ok()).toBeTruthy();
  90  |     const data = await res.json();
  91  |     expect(Object.keys(data).length).toBeGreaterThan(2000);
  92  |   });
  93  | 
  94  |   test('areas/1 — early years still served', async ({ request }) => {
  95  |     const res = await request.get(`${API}/areas/1`);
  96  |     expect(res.status()).toBeLessThan(500);
  97  |   });
  98  | 
  99  |   test('markers query', async ({ request }) => {
  100 |     const res = await request.get(`${API}/markers?year=1000&limit=10`);
  101 |     expect(res.ok()).toBeTruthy();
  102 |     const data = await res.json();
  103 |     expect(Array.isArray(data)).toBeTruthy();
  104 |     expect(data.length).toBeGreaterThan(0);
  105 |   });
  106 | 
  107 |   test('metadata bundle returns ruler/culture/religion/provinces', async ({ request }) => {
  108 |     const res = await request.get(
  109 |       `${API}/metadata?type=g&f=provinces,ruler,culture,religion,capital,province,religionGeneral`
  110 |     );
  111 |     expect(res.ok()).toBeTruthy();
  112 |     const data = await res.json();
  113 |     expect(data).toHaveProperty('ruler');
  114 |     expect(data).toHaveProperty('culture');
  115 |     expect(data).toHaveProperty('religion');
  116 |     expect(data).toHaveProperty('provinces');
  117 |   });
  118 | 
  119 |   test('metadata ruler bulk', async ({ request }) => {
  120 |     const res = await request.get(`${API}/metadata/ruler`);
  121 |     expect(res.ok()).toBeTruthy();
  122 |     const data = await res.json();
  123 |     expect(Object.keys(data.data).length).toBeGreaterThan(1000);
  124 |   });
  125 | 
  126 |   test('flags list', async ({ request }) => {
  127 |     const res = await request.get(`${API}/flags`);
  128 |     expect(res.ok()).toBeTruthy();
  129 |     expect(Array.isArray(await res.json())).toBeTruthy();
  130 |   });
  131 | 
  132 |   test('forum endpoints retired (410)', async ({ request }) => {
  133 |     const paths = [
  134 |       '/board/forum',
  135 |       '/board/forum/',
  136 |       '/board/forum/questions/discussions?pinned=false',
  137 |       '/collections',
  138 |       '/game'
  139 |     ];
  140 |     for (const p of paths) {
  141 |       const res = await request.get(`${API}${p}`);
> 142 |       expect(res.status(), `${p} should be 410`).toBe(410);
      |                                                  ^ Error: /game should be 410
  143 |     }
  144 |   });
  145 | 
  146 |   test('CORS preflight from chronas.org allowed', async ({ request }) => {
  147 |     const res = await request.fetch(`${API}/areas/2000`, {
  148 |       method: 'OPTIONS',
  149 |       headers: {
  150 |         Origin: 'https://chronas.org',
  151 |         'Access-Control-Request-Method': 'GET'
  152 |       }
  153 |     });
  154 |     expect(res.status()).toBeLessThan(400);
  155 |     const allowOrigin = res.headers()['access-control-allow-origin'];
  156 |     expect(allowOrigin === 'https://chronas.org' || allowOrigin === '*').toBeTruthy();
  157 |   });
  158 | });
  159 | 
  160 | test.describe('Production rate limiting — DynamoDB-backed', () => {
  161 |   test('auth/login responds with RateLimit headers', async ({ request }) => {
  162 |     const res = await request.post(`${API}/auth/login`, {
  163 |       data: { email: 'rate-test@chronas.invalid', password: 'wrong' }
  164 |     });
  165 |     const headers = res.headers();
  166 |     expect(headers).toHaveProperty('ratelimit');
  167 |     expect(headers).toHaveProperty('ratelimit-policy');
  168 |     expect(headers['ratelimit-policy']).toMatch(/^20;w=900$/);
  169 |   });
  170 | 
  171 |   test('refresh has higher limit (60/15min) than login', async ({ request }) => {
  172 |     const res = await request.post(`${API}/auth/refresh`, {
  173 |       data: {}
  174 |     });
  175 |     expect(res.headers()['ratelimit-policy']).toMatch(/^60;w=900$/);
  176 |   });
  177 | 
  178 |   test('contact has tighter hourly limit (5/3600s)', async ({ request }) => {
  179 |     const res = await request.post(`${API}/contact`, {
  180 |       data: { from: 'test@chronas.invalid', subject: 'rate-test', html: 'x' }
  181 |     });
  182 |     expect(res.headers()['ratelimit-policy']).toMatch(/^5;w=3600$/);
  183 |   });
  184 | 
  185 |   test('login limit is NOT exceeded by 15 quick requests (sweet spot)', async ({ request }) => {
  186 |     let throttledAt = -1;
  187 |     for (let i = 0; i < 15; i++) {
  188 |       const res = await request.post(`${API}/auth/login`, {
  189 |         data: { email: `sweet-spot-${i}@chronas.invalid`, password: 'wrong' }
  190 |       });
  191 |       if (res.status() === 429) {
  192 |         throttledAt = i;
  193 |         break;
  194 |       }
  195 |     }
  196 |     expect(throttledAt, 'should not 429 within first 15 attempts').toBe(-1);
  197 |   });
  198 | });
  199 | 
```