import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://9c3213bzri.execute-api.eu-west-1.amazonaws.com/v1';
const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'https://d1q6nlczw9cdpt.cloudfront.net';

test.describe('Dev Environment E2E Smoke Tests', () => {

  test('API health check', async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toBe('Health OK');
  });

  test('API version endpoint', async ({ request }) => {
    const res = await request.get(`${API_URL}/version`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('version');
  });

  test('API areas/2000 returns province data', async ({ request }) => {
    const res = await request.get(`${API_URL}/areas/2000`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const keys = Object.keys(data);
    expect(keys.length).toBeGreaterThan(2000);
  });

  test('API areas/1000 returns data (keyset migration fix)', async ({ request }) => {
    const res = await request.get(`${API_URL}/areas/1000`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Object.keys(data).length).toBeGreaterThan(2000);
  });

  test('API markers returns results', async ({ request }) => {
    const res = await request.get(`${API_URL}/markers?year=1000&limit=10`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThan(0);
  });

  test('API metadata init bundle returns ruler/culture/religion', async ({ request }) => {
    const res = await request.get(`${API_URL}/metadata?type=g&f=provinces,ruler,culture,religion,capital,province,religionGeneral`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('ruler');
    expect(data).toHaveProperty('culture');
    expect(data).toHaveProperty('religion');
    expect(data).toHaveProperty('provinces');
  });

  test('API metadata ruler has entries', async ({ request }) => {
    const res = await request.get(`${API_URL}/metadata/ruler`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('data');
    expect(Object.keys(data.data).length).toBeGreaterThan(1000);
  });

  test('API statistics returns from S3', async ({ request }) => {
    const res = await request.get(`${API_URL}/statistics`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.markerTotal).toBeGreaterThan(100000);
    expect(data.metadataTotal).toBeGreaterThan(30000);
    expect(data.userTotal).toBeGreaterThan(5000);
  });

  test('API flags list', async ({ request }) => {
    const res = await request.get(`${API_URL}/flags`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('API board/forum discussions retired (410)', async ({ request }) => {
    const res = await request.get(`${API_URL}/board/forum/questions/discussions?pinned=false`);
    expect(res.status()).toBe(410);
  });

  test('Frontend loads HTML', async ({ page }) => {
    await page.goto(FRONTEND_URL, { timeout: 30000 });
    await expect(page).toHaveTitle(/chronas/i);
  });

  test('Frontend loads map (MapBox renders)', async ({ page }) => {
    await page.goto(FRONTEND_URL, { timeout: 30000 });
    // Wait for map container to appear
    const mapContainer = page.locator('.mapboxgl-map, [class*="map"]');
    await expect(mapContainer.first()).toBeVisible({ timeout: 15000 });
  });
});
