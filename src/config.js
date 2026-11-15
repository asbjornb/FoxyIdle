// Game balance and world layout. All positions are in world units (x, z).

export const RESOURCES = {
  berries: { name: 'Berries', kind: 'Physical', color: '#e2475b', glyph: 'berry' },
  wood: { name: 'Wood', kind: 'Physical', color: '#b9814f', glyph: 'wood' },
  spirit: { name: 'Spirit', kind: 'Spiritual', color: '#f2d27a', glyph: 'spirit' },
  mana: { name: 'Mana', kind: 'Magical', color: '#7fb8ff', glyph: 'mana' },
};

export const RESOURCE_ORDER = ['berries', 'wood', 'spirit', 'mana'];

// Areas beyond the starting meadow are shrouded in mist until opened.
export const AREAS = {
  east: { name: 'Shrine Hill', center: [27, -3], radius: 10.5, gate: [15.5, -1.5], cost: { wood: 25, berries: 15 },
    blurb: 'Old stones sleep on the hill. Clear the brambles to find them.' },
  west: { name: 'Moonlit Grove', center: [-27, -3], radius: 10.5, gate: [-15.5, -1.5], cost: { spirit: 20, wood: 30 },
    blurb: 'A cold, quiet mist hides something that hums with light.' },
  north: { name: 'Wisp Hollow', center: [0, -29], radius: 10, gate: [0, -17], cost: { mana: 15, spirit: 25 },
    blurb: 'Tiny lights flicker behind the fog, waiting to be called.' },
};

// Production stations. `cycle` = seconds per gather, `yield` = amount per gather.
export const STATIONS = {
  berries: {
    name: 'Berry Thicket', area: null, pos: [-9, 6], radius: 3.4, resource: 'berries',
    cycle: 2.4, yield: 4, anim: 'gather', unlock: null,
    upgradeBase: { wood: 8, berries: 6 },
    verb: 'Gathering berries', blurb: 'Plump wild berries. Fill your little basket.',
  },
  wood: {
    name: 'Fallen Oak', area: null, pos: [9.5, 5], radius: 3.6, resource: 'wood',
    cycle: 2.8, yield: 4, anim: 'tug', unlock: null,
    upgradeBase: { berries: 10, wood: 4 },
    verb: 'Collecting branches', blurb: 'An old oak fell in a storm. Its branches are free to take.',
  },
  garden: {
    name: 'Meadow Garden', area: null, pos: [-1, 15], radius: 3.6, resource: null,
    cycle: 2.6, yield: 0, anim: 'dig', unlock: { berries: 10, wood: 10 },
    harmony: 4, vitality: 1.2,
    upgradeBase: { berries: 14, wood: 14 },
    verb: 'Tending the flowers', blurb: 'Care for the soil and the glade breathes easier. Restores Harmony.',
  },
  shrine: {
    name: 'Moss Shrine', area: 'east', pos: [28, -4], radius: 4.3, resource: 'spirit',
    cycle: 3.2, yield: 4, anim: 'meditate', unlock: null,
    harmony: 0.8,
    upgradeBase: { wood: 16, berries: 12, spirit: 6 },
    verb: 'Meditating', blurb: 'Sit with the old stones. Quiet thoughts become Spirit.',
  },
  pool: {
    name: 'Moon Pool', area: 'west', pos: [-28, -4], radius: 5.4, resource: 'mana',
    cycle: 3.8, yield: 4, anim: 'channel', unlock: null,
    upgradeBase: { spirit: 16, wood: 14, mana: 6 },
    verb: 'Drawing moonlight', blurb: 'The water remembers the moon. Draw its light out as Mana.',
  },
  hollow: {
    name: 'Wisp Circle', area: 'north', pos: [0, -30], radius: 4, resource: null,
    cycle: 0, yield: 0, anim: 'call', unlock: null,
    verb: 'Calling wisps', blurb: 'Call wandering wisps. They tend the stations even when you are away.',
  },
  tree: {
    name: 'The Great Tree', area: null, pos: [0, -4], radius: 5.2, resource: null,
    cycle: 0, yield: 0, anim: 'offer', unlock: null,
    verb: 'Offering', blurb: 'The heart of the glade, withered and grey. Restore it.',
  },
};

export const PRODUCERS = ['berries', 'wood', 'garden', 'shrine', 'pool'];

export const MAX_LEVEL = 5;

export const TREE_STAGES = [
  { name: 'Awaken the Roots', cost: { berries: 20, wood: 20 }, text: 'Roots stir beneath the soil.' },
  { name: 'Mend the Trunk', cost: { wood: 45, spirit: 25 }, text: 'Bark softens. Sap flows again.' },
  { name: 'Call Back the Leaves', cost: { berries: 50, spirit: 35, mana: 15 }, text: 'Green returns to the high branches.' },
  { name: 'Coax the Blossoms', cost: { wood: 70, spirit: 45, mana: 35 }, text: 'Petals unfold like a held breath released.' },
  { name: 'Kindle the Heartlight', cost: { berries: 90, wood: 90, spirit: 75, mana: 60 }, text: 'The Great Tree wakes.' },
];

export const WISP = {
  max: 6,
  baseCost: { spirit: 12, mana: 10 },
  growth: 1.45,
  efficiency: 0.4, // fraction of a station's player rate
};

export const HARMONY = {
  start: 70,
  max: 100,
  baseDecay: 0.11, // per second
  perAreaDecay: 0.045,
  perStageDecay: 0.02,
  treeStageBonus: 22,
  areaBonus: 8,
  lowWarn: 25,
};

export const FOX_START = [0, 11];
export const WORLD_RADIUS = 37;

export function upgradeCost(stationId, level) {
  const base = STATIONS[stationId].upgradeBase;
  const out = {};
  for (const k in base) out[k] = Math.ceil(base[k] * Math.pow(1.6, level - 1));
  return out;
}

export function wispCost(count) {
  const out = {};
  for (const k in WISP.baseCost) out[k] = Math.ceil(WISP.baseCost[k] * Math.pow(WISP.growth, count));
  return out;
}

export function stationCycle(id, level) {
  return STATIONS[id].cycle * Math.pow(0.9, level - 1);
}

export function stationYield(id, level) {
  return STATIONS[id].yield * (1 + 0.6 * (level - 1));
}
