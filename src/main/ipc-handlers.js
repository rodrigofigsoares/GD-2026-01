'use strict';
const { ipcMain } = require('electron');
const { load, getRow, count, getDates } = require('./csv-reader');
const { PANEL_TYPES, MODEL, SIMULATION, FAULT_THRESHOLDS } = require('../shared/constants');

let win          = null;
let cfg          = null;
let timer        = null;
let index        = 0;
let speed        = 1;
let isPaused     = false;
let _extraTarget = null;

// failures: Map<panelId, { type, intensity }>
const failures        = new Map();
const autoShutdown    = new Set();
// Último estado diurno de cada painel — persiste à noite para que sombra/falha
// do dia não desapareça só porque o sol baixou.
const lastDaytimeState = new Map(); // panelId → { eff, status }

// globalOverrides: nulls = use CSV value
let globalOverrides = { wind: null, rh: null, tempOffset: 0, ghi: null, ghiGroup: null };

// autonomous decisions log
const decisions  = [];
let _decisionSeq = 0;

const _autoEventCooldown = new Map();
const AUTO_COOLDOWN_TICKS = 10;

let _lastPayloadDay    = null;
let _dailyExpectedWh   = 0;

// Soma o total esperado (W × 1h = Wh) para cada hora do dia informado.
function _computeDailyExpected(day) {
  const csvKey     = PANEL_TYPES[cfg.type]?.csvKey || cfg.type;
  const panelCount = cfg.rows * cfg.cols;
  const total      = count();
  let sumWh = 0;
  for (let i = 0; i < total; i++) {
    const r = getRow(i);
    if (!r || r['Data'] !== day) continue;
    sumWh += (parseFloat(r[`${csvKey}_Preal_W`]) || 0) * panelCount;
  }
  return sumWh; // Wh para o dia inteiro (1 tick = 1 hora)
}

function init(mainWindow, config) {
  win      = mainWindow;
  cfg      = config;
  index    = 0; speed = 1; isPaused = false;
  failures.clear();
  autoShutdown.clear();
  lastDaytimeState.clear();
  decisions.length = 0;
  _decisionSeq     = 0;
  globalOverrides  = { wind: null, rh: null, tempOffset: 0, ghi: null, ghiGroup: null };
  _lastPayloadDay  = null;
  _dailyExpectedWh = 0;
  _autoEventCooldown.clear();
  load();
  _startLoop();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

function setExtraTarget(fn) { _extraTarget = fn; }

function _startLoop() {
  stop();
  _emit();
  timer = setInterval(_tick, SIMULATION.TICK_INTERVAL_MS);
}

// _emit: re-renderiza o tick atual SEM avançar o índice.
// isTimerTick=false → chamado por ações IPC (sliders, chaos); o renderer
// ignora acumulação de energia e adição de ponto no gráfico nesses casos.
function _emit(isTimerTick = false) {
  if (!win || !cfg) return;
  const row = getRow(index);
  if (!row) return;
  const payload = { ..._buildPayload(row), isTimerTick };
  win.webContents.send('simulation:tick', payload);
  if (_extraTarget) _extraTarget(payload);
}

// _tick: chamado pelo timer — emite como tick real e avança o tempo da simulação
function _tick() {
  if (isPaused) return;
  _emit(true); // isTimerTick = true
  index = (index + speed) % count();
}

function _addDecision(ts, panelId, type, reason) {
  decisions.unshift({ seq: ++_decisionSeq, ts, panelId, type, reason, reverted: false });
  if (decisions.length > 100) decisions.pop();
}

function _buildPayload(row) {
  const type = cfg.type;
  const spec = PANEL_TYPES[type];
  const { GAMMA, T_REF } = MODEL;
  const FT = FAULT_THRESHOLDS;

  const csvKey   = spec?.csvKey || type; // permite que a chave UI (144CEL) difira do prefixo CSV (MODERNO)
  const ghi      = parseFloat(row['GHI_Wh_m2'])          || 0;
  const rawAir   = parseFloat(row['T2M_C'])               || 0;
  const airTemp  = rawAir + (globalOverrides.tempOffset || 0);
  const cellTemp = parseFloat(row[`${csvKey}_Tcel_C`])   || 0;
  const pReal    = parseFloat(row[`${csvKey}_Preal_W`])  || 0;
  const wind     = globalOverrides.wind !== null ? globalOverrides.wind : (parseFloat(row['WS10M_ms']) || 0);
  const rh       = globalOverrides.rh   !== null ? globalOverrides.rh  : (parseFloat(row['RH2M_pct']) || 0);
  const hour     = parseInt(row['Hora']) || 0;
  const isDaytime = hour >= 6 && hour <= 18 && ghi > 10;

  // Thermal factor at current (possibly offset) air-driven cell temp
  const fNormal = Math.max(0.01, 1 + GAMMA * (cellTemp - T_REF));

  // ── Auto-detection events ──────────────────────────────────────
  const autoEvents = [];

  function _pushAuto(key, event) {
    const last = _autoEventCooldown.get(key) ?? -Infinity;
    if (index - last >= AUTO_COOLDOWN_TICKS) {
      _autoEventCooldown.set(key, index);
      autoEvents.push(event);
    }
  }

  if (isDaytime) {
    if (cellTemp >= FT.CELL_TEMP_CRITICAL)
      _pushAuto('cell_critical', { type: 'overheat_critical', severity: 'critical', value: cellTemp.toFixed(1) });
    else if (cellTemp >= FT.CELL_TEMP_WARNING)
      _pushAuto('cell_warning',  { type: 'overheat_warning',  severity: 'warning',  value: cellTemp.toFixed(1) });
  }
  if (wind >= FT.WIND_CRITICAL)
    _pushAuto('wind_critical', { type: 'wind_critical', severity: 'critical', value: wind.toFixed(1) });
  else if (wind >= FT.WIND_WARNING)
    _pushAuto('wind_warning',  { type: 'wind_warning',  severity: 'warning',  value: wind.toFixed(1) });
  if (rh >= FT.RH_WARNING)
    _pushAuto('humidity', { type: 'humidity', severity: 'warning', value: rh.toFixed(0) });

  // ── Per-panel simulation ───────────────────────────────────────
  const panels = [];

  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const id        = `panel_${r+1}_${c+1}`;
      const failure   = failures.get(id);
      const fType     = failure?.type     || null;
      const intensity = failure?.intensity ?? 100;

      const inGhiGroup     = globalOverrides.ghiGroup === null || globalOverrides.ghiGroup.has(id);
      const isGhiOverride  = globalOverrides.ghi !== null && inGhiGroup;
      const ghiForPanel    = isGhiOverride ? globalOverrides.ghi : ghi;

      // Quando override ativo: normaliza para STC (1000 W/m²) — evita distorção
      // de curva no amanhecer, onde pReal≈0 inflaria o ghiRatio desproporcionalmente.
      // Sem override: ratio = 1 (ghiForPanel == ghi).
      const ghiRatio = isGhiOverride
        ? ghiForPanel / 1000
        : (ghi > 0 ? ghiForPanel / ghi : 1);

      // expectedPower: sempre do CSV (= previsão/baseline do dia)
      const expectedPower = pReal;

      // pBase: com override, usa condições STC (fNormal=1) — a irradiância virtual
      // é constante, então a curva deve ser plana. Não usar cellTemp do CSV, pois
      // ela já reflete o aquecimento do meio-dia real e causaria um dip na produção.
      // Sem override: usa pReal do CSV (já inclui calibrações NOCT reais).
      const pBase = isGhiOverride
        ? ghiForPanel * spec.peakPower / 1000 * MODEL.PR
        : pReal;

      let status    = 'normal';
      let effHealth = 100; // saúde derivada da falha (100 = sem falha)
      let pCellTemp = cellTemp;

      // ── Lógica de falha (Chaos Mode) — define effHealth ────────
      if (fType === 'overheat') {
        status = 'overheat';
        const extraDeg    = (intensity / 100) * 60;
        pCellTemp         = cellTemp + extraDeg;
        const fHot        = Math.max(0, 1 + GAMMA * (pCellTemp - T_REF));
        const thermalRatio = fHot / fNormal;
        const degradFactor = 1 - (intensity / 100) * 0.35;
        effHealth = Math.max(0, thermalRatio * degradFactor * 100);

        if (pCellTemp >= FT.CELL_TEMP_SHUTDOWN && !autoShutdown.has(id)) {
          autoShutdown.add(id);
          const simTs = `${row['Data']}T${String(hour).padStart(2,'0')}:00:00`;
          _addDecision(simTs, id, 'panel_shutdown', `Tcél ${pCellTemp.toFixed(0)}°C ≥ ${FT.CELL_TEMP_SHUTDOWN}°C`);
          _pushAuto(`shutdown_${id}`, { type: 'panel_shutdown', severity: 'critical', panelId: id });
        }

      } else if (fType === 'hotspot') {
        status    = 'hotspot';
        pCellTemp = cellTemp + (intensity / 100) * 25;
        effHealth = Math.max(5, (1 - (intensity / 100) * 0.55) * 100);

      } else if (fType === 'pid') {
        status    = 'pid';
        effHealth = (1 - (intensity / 100) * 0.30) * 100;

      } else if (fType === 'string_fail') {
        status = 'string_fail'; effHealth = 0;

      } else if (fType === 'bypass_fail') {
        status    = 'bypass_fail';
        pCellTemp = cellTemp + (intensity / 100) * 20;
        effHealth = (1 - (0.10 + (intensity / 100) * 0.40)) * 100;

      } else if (fType === 'soiling') {
        status    = 'soiling';
        effHealth = (1 - (intensity / 100) * 0.30) * 100;

      } else if (fType === 'sensor_fail') {
        status = 'sensor_fail'; effHealth = 0;

      } else if (fType === 'corrupted') {
        status = 'corrupted'; // UI mostrará N/A
      }

      // ── Desligamento automático (decisão do gêmeo) ─────────────
      // Sobrescreve tudo — painel fica vermelho/off até reinstate explícito do operador
      if (autoShutdown.has(id)) {
        status    = 'auto_off';
        effHealth = 0;
      }

      // ── Eficiência final e potência ────────────────────────────
      const eff   = effHealth * ghiRatio;
      const power = pBase * (effHealth / 100);

      // ── Persistência noturna de anomalia ───────────────────────
      // Problema durante o dia não some só porque o sol baixou.
      // Ex: sombra de árvore → painel continua marcado até o próximo dia de sol.
      let displayEff    = eff;
      let displayStatus = status;

      if (isDaytime) {
        lastDaytimeState.set(id, { eff, status });
      } else {
        const last = lastDaytimeState.get(id);
        // Só herda se o painel parecia saudável agora mas estava com problema durante o dia
        if (last && last.eff < 85 && displayStatus === 'normal') {
          displayEff    = last.eff;
          displayStatus = last.status;
        }
      }

      panels.push({
        id, row: r, col: c,
        power:         parseFloat(Math.max(0, power).toFixed(2)),
        expectedPower: parseFloat(expectedPower.toFixed(2)),
        efficiency:    parseFloat(displayEff.toFixed(2)),
        cellTemp:      parseFloat(pCellTemp.toFixed(2)),
        status:        displayStatus,
        autoOff:       autoShutdown.has(id),
      });
    }
  }

  const active   = panels.filter(p => p.status !== 'corrupted');
  const avgEff   = active.length ? active.reduce((s, p) => s + p.efficiency, 0) / active.length : 0;
  const avgCell  = active.length ? active.reduce((s, p) => s + p.cellTemp,   0) / active.length : cellTemp;
  const totalPow = active.reduce((s, p) => s + p.power, 0);
  const totalExp = active.reduce((s, p) => s + p.expectedPower, 0);
  const hourStr  = String(hour).padStart(2, '0');

  // Detecta virada de dia — recalcula expected total do novo dia (à meia-noite)
  const currentDay = row['Data'];
  if (currentDay !== _lastPayloadDay) {
    _lastPayloadDay  = currentDay;
    _dailyExpectedWh = _computeDailyExpected(currentDay);
  }

  return {
    timestamp: `${row['Data']}T${hourStr}:00:00`,
    speed, isPaused,
    globalMetrics: {
      // Quando override global (todos os painéis), o gauge mostra a irradiância sobreposta
      ghi: globalOverrides.ghi !== null && globalOverrides.ghiGroup === null
        ? parseFloat(globalOverrides.ghi.toFixed(1))
        : parseFloat(ghi.toFixed(1)),
      airTemp:       parseFloat(airTemp.toFixed(1)),
      rh:            parseFloat(rh.toFixed(1)),
      wind:          parseFloat(wind.toFixed(1)),
      avgCellTemp:   parseFloat(avgCell.toFixed(1)),
      avgEfficiency: parseFloat(avgEff.toFixed(1)),
      totalPower:    parseFloat(totalPow.toFixed(1)),
      totalExpected: parseFloat(totalExp.toFixed(1)),
    },
    dailyExpectedWh: _dailyExpectedWh,
    panels, autoEvents,
    decisions: decisions.slice(0, 50),
    chaosActive:    failures.size > 0,
    activeFailures: [...failures.entries()].map(([id, f]) => ({ id, type: f.type, intensity: f.intensity })),
    globalOverrides: {
      wind: globalOverrides.wind, rh: globalOverrides.rh,
      tempOffset: globalOverrides.tempOffset,
      ghi: globalOverrides.ghi,
      ghiGroup: globalOverrides.ghiGroup ? [...globalOverrides.ghiGroup] : null,
    },
  };
}

// ── IPC handlers ──────────────────────────────────────────────────

ipcMain.on('simulation:control', (_e, { action, value }) => {
  if (action === 'pause') { isPaused = true;  _emit(); }
  if (action === 'play')  { isPaused = false; _emit(); }
  if (action === 'speed') { speed = Math.max(0.1, Math.min(999, Math.round(parseFloat(value) * 100) / 100)); _emit(); }
  if (action === 'reset') { index = 0; isPaused = false; _emit(); }
  // Seek: pula para o índice (linha) correspondente à data selecionada
  if (action === 'seek')  { index = Math.max(0, Math.min(value, count() - 1)); _emit(); }
});

ipcMain.on('chaos:apply', (_e, { panelId, type, intensity = 100 }) => {
  const prev = failures.get(panelId) || null;
  if (!type || type === 'clear') {
    failures.delete(panelId);
    // autoShutdown NÃO é limpo aqui — painel fica desligado até o operador clicar "Religar"
  } else {
    const prevType = (failures.get(panelId) || {}).type;
    failures.set(panelId, { type, intensity: Number(intensity) });
    // Ao mudar de tipo de falha, reinicia o ciclo de auto-desligamento
    if (prevType !== type) autoShutdown.delete(panelId);
  }
  if (win && !win.isDestroyed())
    win.webContents.send('chaos:state-changed', { panelId, type, intensity, prev });
  _emit(); // re-renderiza sem avançar o tempo
});

ipcMain.on('chaos:clear_all', () => {
  failures.clear();
  autoShutdown.clear();
  lastDaytimeState.clear(); // reseta persistência noturna junto com tudo
  globalOverrides = { wind: null, rh: null, tempOffset: 0, ghi: null, ghiGroup: null };
  if (win && !win.isDestroyed())
    win.webContents.send('chaos:state-changed', { type: 'clear_all' });
  _emit();
});

ipcMain.on('chaos:global', (_e, overrides) => {
  const copy = { ...overrides };
  if ('ghiGroup' in copy) {
    globalOverrides.ghiGroup = copy.ghiGroup && copy.ghiGroup.length > 0
      ? new Set(copy.ghiGroup) : null;
    delete copy.ghiGroup;
  }
  globalOverrides = { ...globalOverrides, ...copy };
  _emit(); // re-renderiza sem avançar o tempo
});

ipcMain.on('reinstate:panel', (_e, { panelId }) => {
  autoShutdown.delete(panelId);
  lastDaytimeState.delete(panelId); // painel religado → não herda mais o estado de desligamento
  const d = decisions.find(d => !d.reverted && d.panelId === panelId && d.type === 'panel_shutdown');
  if (d) d.reverted = true;
  if (win && !win.isDestroyed())
    win.webContents.send('chaos:state-changed', { type: 'reinstate', panelId });
  _emit();
});

ipcMain.handle('sim:get-dates', () => {
  load(); // garante que o CSV está carregado
  return getDates();
});

module.exports = { init, stop, setExtraTarget };
