const PANEL_TYPES = {
  '60CEL': {
    label:     '60 células',
    peakPower: 360,
    area:      1.65,
  },
  '72CEL': {
    label:     '72 células',
    peakPower: 440,
    area:      2.00,
  },
  'MODERNO': {
    label:     'Moderno',
    peakPower: 682,
    area:      3.10,
  },
};

const MODEL = {
  PR:    0.8,
  NOCT:  45,
  GAMMA: -0.004,
  T_REF: 25,
};

const SIMULATION = {
  TICK_INTERVAL_MS: 1000,
};

module.exports = { PANEL_TYPES, MODEL, SIMULATION };
