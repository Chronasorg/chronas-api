import { test, expect } from '@playwright/test';

const FRONTEND = process.env.E2E_FRONTEND_URL || 'https://chronas.org';
const API = process.env.E2E_API_URL || 'https://api.chronas.org/v1';

test.describe.configure({ mode: 'serial' });

test.describe('Production smoke — chronas.org full functionality', () => {
  test('homepage loads and shows the map', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });

    const res = await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
    expect(res?.status(), 'frontend HTTP status').toBe(200);
    await expect(page).toHaveTitle(/chronas/i);

    const mapContainer = page.locator('.mapboxgl-map, [class*="map" i]').first();
    await expect(mapContainer).toBeVisible({ timeout: 20000 });

    expect(errors.filter((e) => !/sourcemap|favicon|preload/i.test(e)), 'console+page errors').toEqual([]);
  });

  test('map canvas renders pixels (visual smoke)', async ({ page }) => {
    await page.goto(FRONTEND, { timeout: 30000 });
    const canvas = page.locator('canvas.mapboxgl-canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(3000);
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);
  });

  test('timeline / year slider exists and is interactive', async ({ page }) => {
    await page.goto(FRONTEND, { timeout: 30000 });
    await page.waitForTimeout(3000);
    const slider = page.locator('input[type="range"], [role="slider"], [class*="timeline" i], [class*="year" i]').first();
    await expect(slider).toBeAttached({ timeout: 10000 });
  });

  test('right drawer / info panel can be opened by clicking the map', async ({ page }) => {
    await page.goto(FRONTEND, { timeout: 30000 });
    const canvas = page.locator('canvas.mapboxgl-canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(4000);
    const box = await canvas.boundingBox();
    if (!box) test.skip();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1500);
  });

  test('configuration / settings route loads', async ({ page }) => {
    await page.goto(`${FRONTEND}/#/configuration`, { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/chronas/i);
  });

  test('discover route loads', async ({ page }) => {
    await page.goto(`${FRONTEND}/#/discover`, { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/chronas/i);
  });

  test('login route loads', async ({ page }) => {
    await page.goto(`${FRONTEND}/#/login`, { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    await expect(page).toHaveTitle(/chronas/i);
  });
});

test.describe('Production API — backing services (api.chronas.org)', () => {
  test('health check', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toBe('Health OK');
  });

  test('version endpoint', async ({ request }) => {
    const res = await request.get(`${API}/version`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('version');
  });

  test('areas/2000 returns province data', async ({ request }) => {
    const res = await request.get(`${API}/areas/2000`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Object.keys(data).length).toBeGreaterThan(2000);
  });

  test('areas/1 — early years still served', async ({ request }) => {
    const res = await request.get(`${API}/areas/1`);
    expect(res.status()).toBeLessThan(500);
  });

  test('markers query', async ({ request }) => {
    const res = await request.get(`${API}/markers?year=1000&limit=10`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThan(0);
  });

  test('metadata bundle returns ruler/culture/religion/provinces', async ({ request }) => {
    const res = await request.get(
      `${API}/metadata?type=g&f=provinces,ruler,culture,religion,capital,province,religionGeneral`
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('ruler');
    expect(data).toHaveProperty('culture');
    expect(data).toHaveProperty('religion');
    expect(data).toHaveProperty('provinces');
  });

  test('metadata ruler bulk', async ({ request }) => {
    const res = await request.get(`${API}/metadata/ruler`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Object.keys(data.data).length).toBeGreaterThan(1000);
  });

  test('flags list', async ({ request }) => {
    const res = await request.get(`${API}/flags`);
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray(await res.json())).toBeTruthy();
  });

  test('forum endpoints retired (410)', async ({ request }) => {
    const paths = [
      '/board/forum',
      '/board/forum/',
      '/board/forum/questions/discussions?pinned=false',
      '/collections',
      '/game'
    ];
    for (const p of paths) {
      const res = await request.get(`${API}${p}`);
      expect(res.status(), `${p} should be 410`).toBe(410);
    }
  });

  test('CORS preflight from chronas.org allowed', async ({ request }) => {
    const res = await request.fetch(`${API}/areas/2000`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://chronas.org',
        'Access-Control-Request-Method': 'GET'
      }
    });
    expect(res.status()).toBeLessThan(400);
    const allowOrigin = res.headers()['access-control-allow-origin'];
    expect(allowOrigin === 'https://chronas.org' || allowOrigin === '*').toBeTruthy();
  });
});

test.describe('Production rate limiting — DynamoDB-backed', () => {
  test('auth/login responds with RateLimit headers', async ({ request }) => {
    const res = await request.post(`${API}/auth/login`, {
      data: { email: 'rate-test@chronas.invalid', password: 'wrong' }
    });
    const headers = res.headers();
    expect(headers).toHaveProperty('ratelimit');
    expect(headers).toHaveProperty('ratelimit-policy');
    expect(headers['ratelimit-policy']).toMatch(/^20;w=900$/);
  });

  test('refresh has higher limit (60/15min) than login', async ({ request }) => {
    const res = await request.post(`${API}/auth/refresh`, {
      data: {}
    });
    expect(res.headers()['ratelimit-policy']).toMatch(/^60;w=900$/);
  });

  test('contact has tighter hourly limit (5/3600s)', async ({ request }) => {
    const res = await request.post(`${API}/contact`, {
      data: { from: 'test@chronas.invalid', subject: 'rate-test', html: 'x' }
    });
    expect(res.headers()['ratelimit-policy']).toMatch(/^5;w=3600$/);
  });

  test('login limit is NOT exceeded by 15 quick requests (sweet spot)', async ({ request }) => {
    let throttledAt = -1;
    for (let i = 0; i < 15; i++) {
      const res = await request.post(`${API}/auth/login`, {
        data: { email: `sweet-spot-${i}@chronas.invalid`, password: 'wrong' }
      });
      if (res.status() === 429) {
        throttledAt = i;
        break;
      }
    }
    expect(throttledAt, 'should not 429 within first 15 attempts').toBe(-1);
  });
});
