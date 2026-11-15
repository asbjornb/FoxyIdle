module.exports = async (page) => {
  const F = (fn, arg) => page.evaluate(fn, arg);
  await page.click('button.big.primary');
  await page.adv(1);
  await F(() => { window.__foxy.give({ berries: 999, wood: 999, spirit: 999, mana: 999 }); window.__foxy.teleport(0, 0.4); });
  for (let i = 0; i < 5; i++) { await page.adv(0.4); await F(() => window.__foxy.primary()); }
  await page.adv(8);
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); console.log('op', await F(() => { const e = document.querySelector('.end-screen'); return e ? getComputedStyle(e).opacity + ' ' + e.className : 'none'; })); }
  console.log(JSON.stringify(await F(() => { const e = document.querySelector('.end-screen'); return { exists: !!e, cls: e && e.className, op: e && getComputedStyle(e).opacity, mode: window.__foxy.mode, status: window.__foxy.game.s.status }; })));
  await page.shot('60-win');
  await page.click('.end-screen button[data-a="continue"]');
  await page.adv(1);
  await page.waitForTimeout(900);
  console.log('after continue', JSON.stringify(await F(() => ({ mode: window.__foxy.mode, free: window.__foxy.game.s.freePlay }))));
  await page.shot('61-freeplay');
};
