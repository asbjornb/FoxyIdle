module.exports = async (page) => {
  await page.click('button.big.primary');
  await page.adv(3.2);
  await page.shot('02-start');
  await page.evaluate(() => window.__foxy.teleport(-6.5, 7.5));
  await page.adv(3.5);
  await page.shot('03-berries');
  const st = await page.evaluate(() => ({ near: window.__foxy.near, working: window.__foxy.workingAt, res: window.__foxy.game.s.res, mode: window.__foxy.mode }));
  console.log(JSON.stringify(st));
};
