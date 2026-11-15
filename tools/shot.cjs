// Usage: node tools/shot.cjs <url> <outdir> [scenario]
const { chromium } = require('playwright');
(async () => {
  const [url, out, scenario = 'basic'] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); else if (m.text().startsWith('LOG')) console.log(m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'manual');
  await page.waitForFunction(() => window.__foxy, null, { timeout: 60000 });
  const adv = (s, dt) => page.evaluate(([s, dt]) => window.__foxy.advance(s, dt), [s, dt || 1 / 30]);
  const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); console.log('shot', name); };
  page.adv = adv; page.shot = shot;
  await adv(1);
  await shot('01-title');
  const steps = require(`./scenarios/${scenario}.cjs`);
  await steps(page, out);
  console.log('ERRORS:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
  await browser.close();
})();
