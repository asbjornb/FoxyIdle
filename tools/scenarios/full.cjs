// Plays through the game: walk by keyboard, gather, unlock everything, win.
module.exports = async (page) => {
  const F = (fn, arg) => page.evaluate(fn, arg);
  const log = async (label) => console.log(label, JSON.stringify(await F(() => { const g = window.__foxy.game.s; return { near: window.__foxy.near, working: window.__foxy.workingAt, res: Object.fromEntries(Object.entries(g.res).map(([k, v]) => [k, Math.round(v)])), h: Math.round(g.harmony), stage: g.treeStage, status: g.status, mode: window.__foxy.mode }; })));
  await page.click('button.big.primary');
  await page.adv(3);
  // Keyboard walking test: hold W for 1.5s
  const p0 = await F(() => ({ ...window.__foxy.fox.pos }));
  await F(() => window.__foxy.keys.add('KeyW'));
  await page.adv(1.5);
  await F(() => window.__foxy.keys.delete('KeyW'));
  const p1 = await F(() => ({ ...window.__foxy.fox.pos }));
  console.log('walk W moved', (p1.z - p0.z).toFixed(2), 'x', (p1.x - p0.x).toFixed(2));
  // Walk to berries via click-to-move simulation (teleport near) and gather for real
  await F(() => window.__foxy.teleport(-6.4, 7.8));
  await page.adv(12);
  await log('after berries');
  await F(() => window.__foxy.teleport(6.6, 6.8));
  await page.adv(4);
  await page.shot('04-wood');
  await page.adv(10);
  await log('after wood');
  // Plant the garden
  await F(() => window.__foxy.teleport(-1, 12.6));
  await page.adv(0.5);
  await F(() => window.__foxy.primary());
  await page.adv(2);
  await log('garden planted?');
  await page.adv(3);
  await page.shot('05-garden');
  // Upgrade berries
  await F(() => { window.__foxy.give({ berries: 50, wood: 50 }); window.__foxy.teleport(-6.4, 7.8); });
  await page.adv(1);
  await F(() => window.__foxy.upgrade());
  await page.adv(1.5);
  await page.shot('06-berries-up');
  // Tree stage 1
  await F(() => window.__foxy.teleport(0, 0.4));
  await page.adv(0.6);
  await F(() => window.__foxy.primary());
  await page.adv(2.5);
  await page.shot('07-tree1');
  await log('tree1');
  // Open east
  await F(() => { window.__foxy.give({ berries: 40, wood: 40 }); window.__foxy.teleport(13.4, -0.8); });
  await page.adv(0.6);
  await F(() => window.__foxy.primary());
  await page.adv(1.2);
  await page.shot('08-gate-east-opening');
  await page.adv(4);
  await F(() => window.__foxy.teleport(25.5, -2));
  await page.adv(6);
  await page.shot('09-shrine');
  await log('shrine');
  // West
  await F(() => { window.__foxy.give({ spirit: 40, wood: 40 }); window.__foxy.teleport(-13.4, -0.8); });
  await page.adv(0.6);
  await F(() => window.__foxy.primary());
  await page.adv(5);
  await F(() => window.__foxy.teleport(-23.6, -3));
  await page.adv(6);
  await page.shot('10-pool');
  await log('pool');
  // North
  await F(() => { window.__foxy.give({ spirit: 40, mana: 40 }); window.__foxy.teleport(0, -14.8); });
  await page.adv(0.6);
  await F(() => window.__foxy.primary());
  await page.adv(5);
  await F(() => { window.__foxy.give({ spirit: 200, mana: 200 }); window.__foxy.teleport(0, -26.5); });
  await page.adv(0.6);
  for (let i = 0; i < 3; i++) { await F(() => window.__foxy.primary()); await page.adv(0.3); }
  await page.adv(3);
  await page.shot('11-hollow');
  await log('hollow');
  // Tree stages 2..4
  await F(() => { window.__foxy.give({ berries: 400, wood: 400, spirit: 400, mana: 400 }); window.__foxy.teleport(0, 0.4); });
  for (let i = 0; i < 3; i++) { await page.adv(0.5); await F(() => window.__foxy.primary()); await page.adv(3); }
  await page.adv(4);
  await page.shot('12-tree4');
  await log('tree4');
  // Night look
  await F(() => window.__foxy.setDay(0.8));
  await page.adv(1);
  await page.shot('13-night');
  await F(() => window.__foxy.setDay(0.5));
  await page.adv(1);
  await page.shot('14-dusk');
  await F(() => window.__foxy.setDay(0.15));
  // Final stage -> win
  await F(() => window.__foxy.primary());
  await page.adv(4);
  await page.shot('15-win-cinematic');
  await page.adv(4);
  await page.waitForTimeout(1200);
  await page.shot('16-win-screen');
  await log('end');
};
