import { test } from '@playwright/test';
import fs from 'fs';

const FRONTEND = 'https://chronas.org';

test('explore chronas.org DOM structure', async ({ page }) => {
  test.setTimeout(60000);

  await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(8000);

  await page.screenshot({ path: 'test-results/explore-home.png', fullPage: false });

  const buttons = await page.locator('button, [role="button"]').evaluateAll((nodes) =>
    nodes.slice(0, 60).map((n) => ({
      text: (n.textContent || '').trim().slice(0, 40),
      aria: n.getAttribute('aria-label'),
      cls: (n.getAttribute('class') || '').slice(0, 80)
    }))
  );

  const inputs = await page.locator('input').evaluateAll((nodes) =>
    nodes.slice(0, 30).map((n) => ({
      type: n.getAttribute('type'),
      name: n.getAttribute('name'),
      placeholder: n.getAttribute('placeholder'),
      aria: n.getAttribute('aria-label'),
      cls: (n.getAttribute('class') || '').slice(0, 80)
    }))
  );

  const dataAttrs = await page.evaluate(() => {
    const els = document.querySelectorAll('[data-testid],[data-test],[data-cy]');
    return Array.from(els).slice(0, 40).map((el) => ({
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-cy'),
      text: (el.textContent || '').trim().slice(0, 40)
    }));
  });

  const sliders = await page.locator('[role="slider"], input[type="range"], .timeline, [class*="timeline" i], [class*="year" i]').evaluateAll((nodes) =>
    nodes.slice(0, 20).map((n) => ({
      tag: n.tagName.toLowerCase(),
      role: n.getAttribute('role'),
      cls: (n.getAttribute('class') || '').slice(0, 100),
      text: (n.textContent || '').trim().slice(0, 40)
    }))
  );

  const navLinks = await page.locator('a, [role="link"], nav button').evaluateAll((nodes) =>
    nodes.slice(0, 30).map((n) => ({
      text: (n.textContent || '').trim().slice(0, 40),
      href: n.getAttribute('href'),
      cls: (n.getAttribute('class') || '').slice(0, 80)
    }))
  );

  const html = await page.content();
  fs.writeFileSync('test-results/explore-dump.json', JSON.stringify({
    title: await page.title(),
    url: page.url(),
    buttons: buttons.filter(b => b.text || b.aria || b.cls.length > 0),
    inputs,
    dataAttrs,
    sliders,
    navLinks: navLinks.filter(n => n.text || n.href),
    htmlLength: html.length
  }, null, 2));

  console.log('\n\n=== EXPLORE DUMP ===');
  console.log(`title: ${await page.title()}`);
  console.log(`buttons (first 10):`, JSON.stringify(buttons.slice(0, 10), null, 2));
  console.log(`inputs:`, JSON.stringify(inputs, null, 2));
  console.log(`data-testids:`, JSON.stringify(dataAttrs, null, 2));
  console.log(`sliders:`, JSON.stringify(sliders.slice(0, 8), null, 2));
});
