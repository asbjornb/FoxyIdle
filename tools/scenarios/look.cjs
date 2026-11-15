module.exports = async (page) => {
  const F = (fn, arg) => page.evaluate(fn, arg);
  await page.click('button.big.primary');
  await page.adv(3);
  await page.shot('30-start');
  await F(() => { window.__foxy.give({ berries: 999, wood: 999, spirit: 999, mana: 999 }); const g = window.__foxy.game; g.unlockArea('east'); g.unlockArea('west'); g.unlockArea('north'); });
  const spots = [['gather', -6.2, 8.4, 0.9], ['tug', 6.9, 7.3, -0.6], ['meditate', 25.0, -1.8, 2.3], ['channel', -23.0, -3.2, -1.6]];
  for (const [name, x, z, yaw] of spots) {
    await F(([x, z, yaw]) => { window.__foxy.teleport(x, z); }, [x, z, yaw]);
    await page.adv(1.6);
    await F((yaw) => { const c = window.__foxy.cam; c.dist = 4.6; c.pitch = 0.25; c.yaw = window.__foxy.fox.heading + yaw; }, yaw);
    await page.adv(1.3);
    await page.shot('31-anim-' + name);
  }
  await F(() => window.__foxy.teleport(-1, 12.8));
  await F(() => window.__foxy.primary());
  await page.adv(3);
  await page.shot('31-anim-dig');
};
