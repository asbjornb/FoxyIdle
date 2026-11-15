module.exports = async (page) => {
  const F = (fn, arg) => page.evaluate(fn, arg);
  await page.click('button.big.primary');
  await page.adv(3);
  await F(() => { window.__foxy.game.s.harmony = 30; window.__foxy.teleport(-3, 6); });
  await page.adv(8);
  await page.shot('20-low-harmony');
  console.log('h', await F(() => window.__foxy.game.s.harmony.toFixed(1)));
  await F(() => { window.__foxy.game.s.harmony = 0.2; });
  await page.adv(4);
  await page.shot('21-gloom');
  await page.waitForTimeout(3000); // end screen is shown via setTimeout (real time)
  await page.adv(0.5);
  await page.waitForTimeout(1000);
  await page.shot('22-lose-screen');
  console.log('state', JSON.stringify(await F(() => ({ status: window.__foxy.game.s.status, mode: window.__foxy.mode }))));
  await page.click('.end-screen button.big.primary');
  await page.adv(3);
  console.log('after restart', JSON.stringify(await F(() => ({ status: window.__foxy.game.s.status, mode: window.__foxy.mode, h: window.__foxy.game.s.harmony, res: window.__foxy.game.s.res }))));
  await page.waitForTimeout(800);
  await page.shot('23-restart');
  // save/continue: gather a bit, save, reload
  await F(() => { window.__foxy.give({ berries: 33 }); window.__foxy.game.save(); });
  await page.reload();
  await page.waitForFunction(() => window.__foxy);
  await page.adv(0.5);
  const hasContinue = await page.$('button[data-a="continue"]');
  console.log('continue button present:', !!hasContinue);
  await hasContinue.click();
  await page.adv(1);
  console.log('after continue', JSON.stringify(await F(() => window.__foxy.game.s.res)));
};
