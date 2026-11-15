module.exports = async (page) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.adv(0.5);
  await page.shot('40-mobile-title');
  await page.click('button.big.primary');
  await page.adv(3);
  await page.evaluate(() => window.__foxy.teleport(-6.4, 7.8));
  await page.adv(3);
  await page.waitForTimeout(600);
  await page.shot('41-mobile-play');
  // tap-to-move: tap on the ground in the upper middle of the screen
  const before = await page.evaluate(() => ({ ...window.__foxy.fox.pos }));
  await page.mouse.click(195, 300);
  await page.adv(2);
  const after = await page.evaluate(() => ({ ...window.__foxy.fox.pos }));
  console.log('tap moved', Math.hypot(after.x - before.x, after.z - before.z).toFixed(2));
};
