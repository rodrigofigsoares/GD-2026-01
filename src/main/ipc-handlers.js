const { ipcMain } = require('electron');
const { load, getRow, count } = require('./csv-reader');
const { PANEL_TYPES, SIMULATION } = require('../shared/constants');

let win       = null;
let cfg       = null;
let timer     = null;
let index     = 0;
let speed     = 1;
let isPaused  = false;
const failures = new Map(); // panelId → 'overheat' | 'sensor_fail' | 'corrupted'

// ── Public API ────────────────────────────────────────────────────

function init(mainWindow, config) {
  win      = mainWindow;
  cfg      = config;
  index    = 0;
  speed    = 1;
  isPaused = false;
  failures.clear();
  load();
  _startLoop();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

// ── Internal ──────────────────────────────────────────────────────

function _startLoop() {
  stop();
  _tick();
  timer = setInterval(_tick, SIMULATION.TICK_INTERVAL_MS);
}

function _tick() {
  if (isPaused || !win || !cfg) return;

  const row = getRow(index);
  if (!row) return;

  win.webContents.send('simulation:tick', _buildPayload(row));
  index = (index + speed) % count();
}

function _buildPayload(row) {
  const type = cfg.type;
  const spec = PANEL_TYPES[type];

  const ghi      = parseFloat(row['GHI_Wh_m2'])      || 0;
  const airTemp  = parseFloat(row['T2M_C'])            || 0;
  const cellTemp = parseFloat(row[`${type}_Tcel_C`])  || 0;
  const pReal    = parseFloat(row[`${type}_Preal_W`]) || 0;

  // efficiency = fraction of peak output, expressed as %
  const baseEff = parseFloat(((pReal / spec.peakPower) * 100).toFixed(2));

  const panels = [];
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const id      = `panel_${r}_${c}`;
      const failure = failures.get(id);
      let status    = 'normal';
      let power     = pReal;
      let eff       = baseEff;
      let pCellTemp = cellTemp;

      if (failure === 'sensor_fail') {
        status = 'sensor_fail';
        power  = 0;
        eff    = 0;
      } else if (failure === 'overheat') {
        status    = 'overheat';
        pCellTemp = cellTemp + 25;
        // recalculate power with elevated cell temperature
        const f = 1 + (-0.004) * (pCellTemp - 25);
        power   = parseFloat((spec.peakPower * (ghi / 1000) * Math.max(0, f) * 0.8).toFixed(2));
        eff     = parseFloat(((power / spec.peakPower) * 100).toFixed(2));
      } else if (failure === 'corrupted') {
        status = 'corrupted';
      }

      panels.push({
        id,
        row:        r,
        col:        c,
        power:      parseFloat(power.toFixed(2)),
        efficiency: parseFloat(eff.toFixed(2)),
        cellTemp:   parseFloat(pCellTemp.toFixed(2)),
        status,
      });
    }
  }

  const active   = panels.filter(p => p.status !== 'corrupted');
  const avgEff   = active.length ? active.reduce((s, p) => s + p.efficiency, 0) / active.length : 0;
  const avgCell  = active.length ? active.reduce((s, p) => s + p.cellTemp,   0) / active.length : cellTemp;
  const totalPow = active.reduce((s, p) => s + p.power, 0);

  const hour = String(parseInt(row['Hora']) || 0).padStart(2, '0');

  return {
    timestamp: `${row['Data']}T${hour}:00:00`,
    speed,
    isPaused,
    globalMetrics: {
      ghi:           parseFloat(ghi.toFixed(1)),
      airTemp:       parseFloat(airTemp.toFixed(1)),
      avgCellTemp:   parseFloat(avgCell.toFixed(1)),
      avgEfficiency: parseFloat(avgEff.toFixed(1)),
      totalPower:    parseFloat(totalPow.toFixed(1)),
    },
    panels,
    chaosActive:   failures.size > 0,
    activeFailures: [...failures.entries()].map(([id, s]) => `${id}:${s}`),
  };
}

// ── IPC handlers (registered once at module load) ─────────────────

ipcMain.on('simulation:control', (_e, { action, value }) => {
  if (action === 'pause') { isPaused = true; }
  if (action === 'play')  { isPaused = false; _tick(); }
  if (action === 'speed') { speed = value; if (!isPaused) _tick(); }
  if (action === 'reset') { index = 0; isPaused = false; _tick(); }
});

ipcMain.on('chaos:apply', (_e, { panelId, failure }) => {
  if (failure === 'clear') failures.delete(panelId);
  else failures.set(panelId, failure);
  if (!isPaused) _tick();
});

ipcMain.on('chaos:clear_all', () => {
  failures.clear();
  if (!isPaused) _tick();
});

module.exports = { init, stop };
