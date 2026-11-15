const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: process.argv[3] === 'gl' ? ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] : [] });
  const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto(process.argv[2]);
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); function f() { n++; if (performance.now() - t0 > 5000) res({ fps: n / 5, gl: (() => { const c = document.createElement('canvas').getContext('webgl2'); const d = c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; })() }); else requestAnimationFrame(f); } requestAnimationFrame(f); }));
  console.log(JSON.stringify(r), errors.slice(0, 5));
  await browser.close();
})();
