module.exports = async (page) => {
  const F = (fn, arg) => page.evaluate(fn, arg);
  await page.click('button.big.primary');
  await F(() => { window.__foxy.give({ spirit: 99, wood: 99, berries: 99 }); window.__foxy.game.unlockArea('east'); window.__foxy.game.unlockArea('west'); window.__foxy.teleport(-20, -3); });
  await page.adv(4);
  const info = await F(() => {
    const st = window.__foxy.stations.stations.pool;
    const water = st.group.children.find((c) => c.material && c.material.type === 'ShaderMaterial');
    return { found: !!water, glow: st.waterUniforms.uGlow.value, night: st.waterUniforms.uNight.value, y: water && water.position.y, cy: st.center.y };
  });
  console.log(JSON.stringify(info));
  await page.shot('50-pool-a');
  await F(() => { const st = window.__foxy.stations.stations.pool; const water = st.group.children.find((c) => c.material && c.material.type === 'ShaderMaterial'); });
  await page.adv(0.1);
  await page.shot('50-pool-b');
};
