'use strict';

window.Dashboard = (() => {
  // ── State ─────────────────────────────────────────────
  let powerChart  = null;
  let fleetDonut  = null;
  let isPlaying   = true;
  let currentSpeed = 1;
  let _rows = 1, _cols = 1;
  let _isDark = true;
  let _datesLoaded = false;

  const MAX_HIST = 24;
  const hist = { labels: [], power: [], expected: [] };

  let kwhGenerated = 0;
  let kwhExpected  = 0;
  const CO2_FACTOR = 0.0765; // kg CO₂/kWh (fator rede elétrica brasileira)

  const historyItems = [];
  const MAX_HISTORY  = 50;
  let _prevFailureIds = new Set(); // rastreia chaves "panelId:tipo" de anomalias ativas
  let _lastTimeLabel  = '--:--';   // label HH:MM da última simulação recebida

  // ── Public API ────────────────────────────────────────

  function init(config) {
    _rows = config?.rows ?? 1;
    _cols = config?.cols ?? 1;
    _isDark = !document.body.classList.contains('light');

    isPlaying    = true;
    currentSpeed = 1;
    _datesLoaded = false;
    hist.labels.length = 0;
    hist.power.length  = 0;
    hist.expected.length = 0;
    kwhGenerated = 0;
    kwhExpected  = 0;
    historyItems.length = 0;
    _prevFailureIds     = new Set();
    _lastTimeLabel      = '--:--';

    _setupControls();
    _setupFooterTabs();

    if (powerChart) { powerChart.destroy(); powerChart = null; }
    if (fleetDonut) { fleetDonut.destroy(); fleetDonut = null; }

    _initPowerChart();
    _initFleetDonut();
    _renderHistory();
    _syncBtns();
  }

  function update(payload) {
    const m = payload.globalMetrics;

    // Atualiza label de hora para uso no histórico
    const [, time] = payload.timestamp.split('T');
    _lastTimeLabel = time.slice(0, 5);

    _updateSensors(m);
    _updateFleet(payload.panels);
    // Energia e gráfico só avançam em ticks reais do timer,
    // não em re-emissões causadas por sliders ou IPC de controle.
    if (payload.isTimerTick) {
      _updateEnergy(m.totalPower, m.totalExpected ?? m.totalPower);
      _pushPoint(payload.timestamp, m.totalPower, m.totalExpected ?? m.totalPower);
    }
    _updateGhiGauge(m.ghi);
    _updateHeatmap(payload.panels);
    _detectAlerts(payload);
    _handleAutoEvents(payload.autoEvents || []);
    _checkSuggestions(payload.panels, m);
    _renderDecisionsMain(payload.decisions || []);
    _syncSimTimestamp(payload);
    if (!_datesLoaded) { _datesLoaded = true; _populateDates(); }
  }

  function updateChartLabel() {
    if (!powerChart) return;
    powerChart.data.datasets[0].label = window.t?.('chart.actual')    || 'Real';
    powerChart.data.datasets[1].label = window.t?.('chart.expected') || 'Esperado';
    powerChart.update('none');
  }

  function updateTheme(theme) {
    _isDark = theme !== 'light';
    if (powerChart) { _applyPowerChartTheme(); powerChart.update('none'); }
    if (fleetDonut) { _applyDonutTheme();      fleetDonut.update('none'); }
    _updateGhiGauge(_lastGhi);
    _updateHeatmap(_lastPanels);
  }

  function syncControls() { _syncBtns(); }

  // ── Simulation Controls ───────────────────────────────

  function _setupControls() {
    ['btn-play-pause', 'speed-slider', 'speed-input'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
    });

    document.getElementById('btn-play-pause')?.addEventListener('click', () => {
      isPlaying = !isPlaying;
      _syncBtns();
      window.electronAPI.simulationControl(isPlaying ? 'play' : 'pause');
    });

    const slider = document.getElementById('speed-slider');
    const input  = document.getElementById('speed-input');

    slider?.addEventListener('input', () => {
      const v = parseInt(slider.value, 10);
      if (input) input.value = v;
      currentSpeed = v;
      window.electronAPI.simulationControl('speed', v);
      _syncBtns();
    });

    input?.addEventListener('change', () => {
      let v = parseInt(input.value, 10) || 1;
      v = Math.max(1, Math.min(999, v));
      input.value = v;
      if (slider) slider.value = Math.min(v, parseInt(slider.max, 10));
      currentSpeed = v;
      window.electronAPI.simulationControl('speed', v);
      _syncBtns();
    });
  }

  function _syncBtns() {
    const pp = document.getElementById('btn-play-pause');
    if (pp) {
      pp.textContent = isPlaying ? '⏸' : '▶';
      pp.title       = isPlaying ? (window.t?.('ctrl.pause') || 'Pausar') : (window.t?.('ctrl.resume') || 'Retomar');
      pp.classList.toggle('active', isPlaying);
    }
    const statusEl = document.getElementById('ctrl-status-label');
    if (statusEl) {
      statusEl.textContent = isPlaying
        ? (window.t?.('ctrl.running') || 'Em andamento')
        : (window.t?.('ctrl.paused')  || 'Pausado');
      statusEl.style.color = isPlaying ? 'var(--badge-green-fg)' : 'var(--text-muted)';
    }
    const slider = document.getElementById('speed-slider');
    const input  = document.getElementById('speed-input');
    if (slider) slider.value = Math.min(currentSpeed, parseInt(slider.max, 10));
    if (input)  input.value  = currentSpeed;
  }

  // Sincroniza o date-select com o timestamp atual da simulação
  function _syncSimTimestamp(payload) {
    const sel = document.getElementById('date-select');
    if (!sel || !sel.options.length || sel.options[0].value === '') return;
    const simDate = payload.timestamp.slice(0, 10); // 'YYYY-MM-DD'
    for (const opt of sel.options) {
      if (opt.dataset.date === simDate) { sel.value = opt.value; break; }
    }
  }

  async function _populateDates() {
    if (!window.electronAPI?.getDates) return;
    try {
      const dates = await window.electronAPI.getDates();
      const sel   = document.getElementById('date-select');
      if (!sel || !dates?.length) return;

      // Clone para remover listeners anteriores
      const clone = sel.cloneNode(false);
      sel.parentNode.replaceChild(clone, sel);

      dates.forEach(d => {
        const opt = document.createElement('option');
        opt.value          = d.rowIndex;
        opt.dataset.date   = d.date;
        const [y, m, day]  = d.date.split('-');
        opt.textContent    = `${day}/${m}/${y}`;
        clone.appendChild(opt);
      });

      clone.addEventListener('change', () => {
        const rowIndex = parseInt(clone.value, 10);
        if (!isNaN(rowIndex)) window.electronAPI.simulationControl('seek', rowIndex);
      });
    } catch (_) { /* getDates ainda não disponível */ }
  }

  // ── Footer Tabs ───────────────────────────────────────

  function _setupFooterTabs() {
    ['tab-power', 'tab-temp', 'tab-decisions'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
    });
    document.getElementById('tab-power')?.addEventListener('click',     () => _setTab('power'));
    document.getElementById('tab-temp')?.addEventListener('click',      () => _setTab('temp'));
    document.getElementById('tab-decisions')?.addEventListener('click', () => _setTab('decisions'));
  }

  function _setTab(tab) {
    document.getElementById('panel-power').style.display     = tab === 'power'     ? '' : 'none';
    document.getElementById('panel-temp').style.display      = tab === 'temp'      ? '' : 'none';
    document.getElementById('panel-decisions').style.display = tab === 'decisions' ? '' : 'none';
    document.getElementById('tab-power').classList.toggle('active',     tab === 'power');
    document.getElementById('tab-temp').classList.toggle('active',      tab === 'temp');
    document.getElementById('tab-decisions')?.classList.toggle('active', tab === 'decisions');
    if (tab === 'temp') _updateHeatmap(_lastPanels);
  }

  // ── Sensor Cards ──────────────────────────────────────

  function _updateSensors(m) {
    _set('sensor-ghi',  `${m.ghi.toFixed(0)} W/m²`);
    _set('sensor-air',  `${m.airTemp.toFixed(1)} °C`);
    _set('sensor-cell', `${m.avgCellTemp.toFixed(1)} °C`);

    const effEl = document.getElementById('sensor-eff');
    if (effEl) {
      effEl.textContent = `${m.avgEfficiency.toFixed(1)}%`;
      effEl.style.color = m.ghi <= 0 ? 'var(--text-muted)'
        : m.avgEfficiency >= 85 ? 'var(--badge-green-fg)'
        : m.avgEfficiency >= 50 ? '#e6a817'
        : '#e63e3e';
    }
  }

  function _set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ── Fleet Status (uptime + donut) ─────────────────────

  function _updateFleet(panels) {
    const total    = panels.length;
    const normal   = panels.filter(p => p.status === 'normal').length;
    const failed   = panels.filter(p => p.status !== 'normal' && p.status !== 'corrupted').length;
    const nodata   = panels.filter(p => p.status === 'corrupted').length;
    const uptime   = total > 0 ? (normal / total * 100) : 100;

    const uptimeEl = document.getElementById('fleet-uptime');
    if (uptimeEl) {
      uptimeEl.textContent = `${uptime.toFixed(1)}%`;
      uptimeEl.style.color = uptime >= 90 ? 'var(--badge-green-fg)'
        : uptime >= 70 ? '#e6a817' : '#e63e3e';
    }

    _set('fleet-normal-count', normal);
    _set('fleet-fail-count',   failed);
    _set('fleet-nodata-count', nodata);

    if (fleetDonut) {
      fleetDonut.data.datasets[0].data = [normal, failed, nodata];
      fleetDonut.update('none');
    }
  }

  function _initFleetDonut() {
    const canvas = document.getElementById('fleet-donut');
    if (!canvas || typeof Chart === 'undefined') return;
    fleetDonut = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: [
          window.t?.('fleet.normal')  || 'Normal',
          window.t?.('fleet.failure') || 'Com falha',
          window.t?.('fleet.nodata')  || 'Sem dados',
        ],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: ['#238636', '#e6501f', '#484f58'],
          borderWidth: 0,
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: _isDark ? '#161b22' : '#ffffff',
            borderColor:     _isDark ? '#30363d' : '#d0d7de',
            borderWidth: 1,
            titleColor:  _isDark ? '#e6edf3' : '#1f2328',
            bodyColor:   _isDark ? '#8b949e' : '#57606a',
          },
        },
      },
    });
  }

  function _applyDonutTheme() {
    if (!fleetDonut) return;
    const tt = fleetDonut.options.plugins.tooltip;
    tt.backgroundColor = _isDark ? '#161b22' : '#ffffff';
    tt.borderColor     = _isDark ? '#30363d' : '#d0d7de';
    tt.titleColor      = _isDark ? '#e6edf3' : '#1f2328';
    tt.bodyColor       = _isDark ? '#8b949e' : '#57606a';
  }

  // ── Energy & CO₂ ─────────────────────────────────────

  function _updateEnergy(totalPower, totalExpected) {
    // Each tick = 1 simulated hour → Wh/1000 = kWh
    kwhGenerated += totalPower   / 1000;
    kwhExpected  += totalExpected / 1000;

    const fmtKwh = (v) => v >= 1000
      ? `${(v / 1000).toFixed(2)} MWh`
      : `${v.toFixed(2)} kWh`;

    _set('energy-gen', fmtKwh(kwhGenerated));
    _set('energy-exp', fmtKwh(kwhExpected));

    const pct = kwhExpected > 0 ? Math.min(kwhGenerated / kwhExpected * 100, 100) : 0;
    const bar = document.getElementById('energy-bar');
    if (bar) bar.style.width = `${pct.toFixed(1)}%`;

    const co2 = kwhGenerated * CO2_FACTOR;
    _set('co2-val', co2 >= 1000
      ? `${(co2 / 1000).toFixed(2)} t CO₂`
      : `${co2.toFixed(2)} kg CO₂`);
  }

  // ── GHI Gauge ─────────────────────────────────────────

  let _lastGhi = 0;

  function _updateGhiGauge(ghi) {
    _lastGhi = ghi;
    const canvas = document.getElementById('ghi-gauge');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.offsetWidth || canvas.width;
    const h = canvas.offsetHeight || canvas.height;
    canvas.width  = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h - 18;                          // leave 18px below centre for labels
    const r  = Math.min(w * 0.42, cy - 6);
    const SA = Math.PI;
    const EA = 2 * Math.PI;
    const MAX = 1000;

    const trackColor = _isDark ? '#21262d' : '#d0d7de';
    const textColor  = _isDark ? '#e6edf3' : '#1f2328';
    const mutedColor = _isDark ? '#484f58' : '#8c959f';

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, SA, EA);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth   = 10;
    ctx.stroke();

    // Value arc (color by intensity)
    const ratio  = Math.min(ghi, MAX) / MAX;
    const arcEnd = SA + ratio * Math.PI;
    const arcColor = ghi < 200 ? '#484f58'
      : ghi < 500 ? '#e6a817'
      : '#238636';

    ctx.beginPath();
    ctx.arc(cx, cy, r, SA, arcEnd);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth   = 10;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Center value
    ctx.fillStyle  = textColor;
    ctx.font       = `bold ${Math.round(r * 0.38)}px system-ui`;
    ctx.textAlign  = 'center';
    ctx.fillText(`${ghi.toFixed(0)}`, cx, cy - r * 0.12);
    ctx.fillStyle = mutedColor;
    ctx.font      = `${Math.round(r * 0.24)}px system-ui`;
    ctx.fillText('W/m²', cx, cy - r * 0.12 + Math.round(r * 0.34));

    // Min/max labels
    ctx.fillStyle  = mutedColor;
    ctx.font       = `${Math.round(r * 0.20)}px system-ui`;
    ctx.textAlign  = 'left';
    ctx.fillText('0', cx - r - 4, cy + 12);
    ctx.textAlign  = 'right';
    ctx.fillText('1k', cx + r + 4, cy + 12);
  }

  // ── Temperature Heatmap ───────────────────────────────

  let _lastPanels = [];

  function _updateHeatmap(panels) {
    if (!panels || panels.length === 0) return;
    _lastPanels = panels;

    const panelEl = document.getElementById('panel-temp');
    if (!panelEl || panelEl.style.display === 'none') return;

    const canvas = document.getElementById('temp-heatmap');
    if (!canvas) return;
    const w = canvas.offsetWidth || canvas.clientWidth || 600;
    const h = canvas.offsetHeight || canvas.clientHeight || 120;
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const cols = _cols || 1;
    const rows = _rows || 1;
    const cw = w / cols;
    const ch = h / rows;
    const MIN_T = 15, MAX_T = 80;

    panels.forEach(p => {
      const x = p.col * cw;
      const y = p.row * ch;

      if (p.status === 'corrupted') {
        ctx.fillStyle = _isDark ? '#21262d' : '#c8cdd3';
        ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);
        ctx.fillStyle = _isDark ? '#484f58' : '#8c959f';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('N/A', x + cw / 2, y + ch / 2 + 4);
        return;
      }

      const t = Math.max(MIN_T, Math.min(MAX_T, p.cellTemp));
      const ratio = (t - MIN_T) / (MAX_T - MIN_T);
      // Blue → Cyan → Green → Yellow → Red
      const r = Math.round(ratio > 0.5 ? 255 : ratio * 2 * 120);
      const g = Math.round(ratio < 0.5 ? ratio * 2 * 200 : (1 - ratio) * 2 * 200);
      const b = Math.round(ratio < 0.5 ? 200 - ratio * 2 * 200 : 0);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + 1, y + 1, cw - 2, ch - 2);

      // Temp label
      if (cw > 36 && ch > 18) {
        ctx.fillStyle = ratio > 0.6 ? '#fff' : '#000';
        ctx.font = `${Math.min(10, Math.floor(ch * 0.4))}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText(`${p.cellTemp.toFixed(0)}°`, x + cw / 2, y + ch / 2 + 4);
      }
    });

    // Gradient legend (right side)
    const lgX = w - 10, lgW = 8;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,   'rgb(255,0,0)');
    grad.addColorStop(0.5, 'rgb(0,200,0)');
    grad.addColorStop(1,   'rgb(0,0,200)');
    ctx.fillStyle = grad;
    ctx.fillRect(lgX, 0, lgW, h);

    ctx.fillStyle = _isDark ? '#8b949e' : '#57606a';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`${MAX_T}°`, lgX - 2, 10);
    ctx.fillText(`${MIN_T}°`, lgX - 2, h - 2);
  }

  // ── Alert Feed ────────────────────────────────────────

  // ── Histórico de Eventos (sidebar esquerda) ──────────
  // Detecta SINTOMAS (eficiência anormal, desligamentos) — NÃO expõe o tipo de falha
  // injetada pelo Chaos Mode. O operador só vê o que um sistema real produziria.

  function _addHistory(icon, title, detail, time, sev, reinstatePanel) {
    historyItems.unshift({ icon, title, detail, time, sev, reinstatePanel: reinstatePanel || null });
    if (historyItems.length > MAX_HISTORY) historyItems.pop();
    _renderHistory();
  }

  function _renderHistory() {
    const list = document.getElementById('alert-list');
    if (!list) return;

    if (historyItems.length === 0) {
      list.innerHTML = `<div class="alert-empty">${window.t?.('alerts.empty') || 'Nenhum evento registrado'}</div>`;
      return;
    }

    list.innerHTML = historyItems.map(item => {
      const btn = item.reinstatePanel
        ? `<button class="hist-action" data-panel="${item.reinstatePanel}">🔌 Religar</button>`
        : '';
      return `<div class="hist-item hist-sev-${item.sev}">
        <span class="hist-icon">${item.icon}</span>
        <div class="hist-body">
          <div class="hist-header">
            <span class="hist-title">${item.title}</span>
            <span class="hist-time">${item.time}</span>
          </div>
          <div class="hist-detail">${item.detail}</div>
          ${btn}
        </div>
      </div>`;
    }).join('');

    list.querySelectorAll('.hist-action[data-panel]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.electronAPI.reinstatePanel(btn.dataset.panel);
        btn.disabled    = true;
        btn.textContent = 'Reativado ✓';
      });
    });
  }

  function _detectAlerts(payload) {
    const m   = payload.globalMetrics;
    const currentKeys = new Set();

    payload.panels.forEach(p => {
      if (p.status === 'corrupted') return;
      if (p.autoOff) {
        // Desligamento automático (decisão do sistema) — operador deve poder intervir
        currentKeys.add(`${p.id}:auto_off`);
      } else if (p.efficiency < 60 && p.efficiency > 0) {
        // Eficiência baixa — pode ser durante o dia OU anomalia herdada do dia anterior
        // (Ex: sombra de árvore persiste à noite até o próximo dia de sol normalizar)
        currentKeys.add(`${p.id}:low_eff`);
      }
    });

    // Novas anomalias apareceram
    currentKeys.forEach(key => {
      if (_prevFailureIds.has(key)) return;
      const [panelId, type] = key.split(':');
      if (type === 'auto_off') {
        _addHistory('⛔', panelId, 'Desconectado pelo sistema por temperatura crítica.', _lastTimeLabel, 'critical', panelId);
      } else if (type === 'low_eff') {
        const p = payload.panels.find(x => x.id === panelId);
        _addHistory('⚠', panelId, `Eficiência anormal: ${p?.efficiency.toFixed(0) ?? '?'}% do esperado.`, _lastTimeLabel, 'warning', null);
      }
    });

    // Anomalias anteriores que se resolveram
    _prevFailureIds.forEach(key => {
      if (currentKeys.has(key)) return;
      const [panelId, type] = key.split(':');
      const detail = type === 'auto_off' ? 'Painel reativado pelo operador.' : 'Eficiência normalizada.';
      _addHistory('✅', panelId, detail, _lastTimeLabel, 'ok', null);
    });

    _prevFailureIds = currentKeys;
  }

  // ── Power Chart (dual line) ───────────────────────────

  function _initPowerChart() {
    const canvas = document.getElementById('power-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const dark = _isDark;
    powerChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: window.t?.('chart.actual')   || 'Real',
            data:  [],
            borderColor:     dark ? '#238636' : '#1a7f37',
            backgroundColor: dark ? 'rgba(35,134,54,0.08)' : 'rgba(26,127,55,0.06)',
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 3,
            fill: true, tension: 0.4,
          },
          {
            label: window.t?.('chart.expected') || 'Esperado',
            data:  [],
            borderColor: dark ? '#1f6feb' : '#0550ae',
            backgroundColor: 'transparent',
            borderWidth: 1.5, borderDash: [5, 4],
            pointRadius: 0, pointHoverRadius: 3,
            fill: false, tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color:    dark ? '#8b949e' : '#57606a',
              boxWidth: 12, font: { size: 11 }, padding: 12,
            },
          },
          tooltip: {
            backgroundColor: dark ? '#161b22' : '#ffffff',
            borderColor:     dark ? '#30363d' : '#d0d7de',
            borderWidth: 1,
            titleColor:  dark ? '#e6edf3' : '#1f2328',
            bodyColor:   dark ? '#8b949e' : '#57606a',
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw;
                return ` ${ctx.dataset.label}: ${v >= 1000 ? `${(v/1000).toFixed(2)} kW` : `${v.toFixed(0)} W`}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid:  { color: dark ? '#21262d' : '#d0d7de' },
            ticks: { color: dark ? '#484f58' : '#8c959f', maxTicksLimit: 7, maxRotation: 0 },
          },
          y: {
            grid:  { color: dark ? '#21262d' : '#d0d7de' },
            ticks: {
              color: dark ? '#484f58' : '#8c959f',
              callback: (v) => v >= 1000 ? `${(v/1000).toFixed(1)}kW` : `${v}W`,
            },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function _applyPowerChartTheme() {
    const dark = _isDark;
    const ds0 = powerChart.data.datasets[0];
    const ds1 = powerChart.data.datasets[1];
    ds0.borderColor     = dark ? '#238636' : '#1a7f37';
    ds0.backgroundColor = dark ? 'rgba(35,134,54,0.08)' : 'rgba(26,127,55,0.06)';
    ds1.borderColor     = dark ? '#1f6feb' : '#0550ae';

    const legend = powerChart.options.plugins.legend;
    legend.labels.color = dark ? '#8b949e' : '#57606a';

    const tt = powerChart.options.plugins.tooltip;
    tt.backgroundColor = dark ? '#161b22' : '#ffffff';
    tt.borderColor     = dark ? '#30363d' : '#d0d7de';
    tt.titleColor      = dark ? '#e6edf3' : '#1f2328';
    tt.bodyColor       = dark ? '#8b949e' : '#57606a';

    powerChart.options.scales.x.grid.color  = dark ? '#21262d' : '#d0d7de';
    powerChart.options.scales.x.ticks.color = dark ? '#484f58' : '#8c959f';
    powerChart.options.scales.y.grid.color  = dark ? '#21262d' : '#d0d7de';
    powerChart.options.scales.y.ticks.color = dark ? '#484f58' : '#8c959f';
  }

  function _pushPoint(timestamp, totalPower, totalExpected) {
    if (!powerChart) return;
    const [date, time] = timestamp.split('T');
    const [, m, d]     = date.split('-');
    hist.labels.push(`${d}/${m} ${time.slice(0, 5)}`);
    hist.power.push(parseFloat(totalPower.toFixed(1)));
    hist.expected.push(parseFloat(totalExpected.toFixed(1)));

    if (hist.labels.length > MAX_HIST) {
      hist.labels.shift(); hist.power.shift(); hist.expected.shift();
    }
    powerChart.data.labels              = [...hist.labels];
    powerChart.data.datasets[0].data   = [...hist.power];
    powerChart.data.datasets[1].data   = [...hist.expected];
    powerChart.update('none');
  }

  // ── Toast Notifications ───────────────────────────────

  const _toastCooldown = new Map();  // key → last-shown ms
  const TOAST_COOLDOWN_MS = 2_000;   // 2s entre toasts do mesmo tipo (aumentar na versão comercial)
  const _chaosToastCooldown = new Map();
  let _suggestionCooldown = 0;

  const TOAST_MESSAGES = {
    overheat_warning:  { icon: '🌡', sev: 'warning',  title: 'Atenção — Temperatura',    body: (v) => `Temperatura de célula em ${v}°C. Derating aplicado.` },
    overheat_critical: { icon: '🔥', sev: 'critical', title: 'Crítico — Superaquecimento',body: (v) => `Temperatura de célula em ${v}°C. Risco de dano permanente.` },
    wind_warning:      { icon: '💨', sev: 'warning',  title: 'Atenção — Vento',           body: (v) => `Velocidade de ${v} m/s detectada. Monitorar fixação.` },
    wind_critical:     { icon: '🌪', sev: 'critical', title: 'Crítico — Vento Forte',     body: (v) => `Velocidade de ${v} m/s! Risco estrutural.` },
    humidity:          { icon: '💧', sev: 'warning',  title: 'Atenção — Umidade Alta',    body: (v) => `Umidade em ${v}%. Verificar vedação dos conectores.` },
    panel_shutdown:    { icon: '⛔', sev: 'critical', title: 'Sistema — Painel Desligado', body: (e) => `${e.panelId} desconectado automaticamente por superaquecimento (${e.reason}).` },
  };

  function _makeToast(container, sev, icon, title, body, lifetime) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${sev}`;
    toast.innerHTML = `<span class="toast-icon">${icon}</span><div><div class="toast-title">${title}</div><div class="toast-body">${body}</div></div><button class="toast-close">✕</button>`;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    const ms = lifetime ?? (sev === 'critical' ? 12000 : 7000);
    setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 400); }, ms);
  }

  function _showToast(key, event) {
    const now = Date.now();
    if (_toastCooldown.has(key) && now - _toastCooldown.get(key) < TOAST_COOLDOWN_MS) return;
    _toastCooldown.set(key, now);

    const def = TOAST_MESSAGES[event.type];
    if (!def) return;

    const container = document.getElementById('toast-container');
    if (!container) return;
    const body = event.panelId ? def.body(event) : def.body(event.value || '');
    _makeToast(container, def.sev, def.icon, def.title, body);
  }

  // ── Decisions tab (main window footer) ───────────────

  const TYPE_ICONS_MAIN = { panel_shutdown: '⛔' };
  const TYPE_LABELS_MAIN = { panel_shutdown: 'Desligamento preventivo' };

  function _renderDecisionsMain(decisions) {
    const container = document.getElementById('decisions-list-main');
    if (!container) return;
    if (!decisions || decisions.length === 0) {
      container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.82rem;">Nenhuma decisão autônoma registrada ainda.</div>';
      return;
    }
    container.innerHTML = decisions.map(d => {
      const icon  = TYPE_ICONS_MAIN[d.type]  || '🔔';
      const label = TYPE_LABELS_MAIN[d.type] || d.type;
      const ts    = d.ts ? d.ts.replace('T', ' ').slice(0, 16) : '—';
      const revertBadge = d.reverted ? '<span style="color:#56d364;font-size:0.7rem;"> · Revertido</span>' : '';
      const btn = (!d.reverted && d.type === 'panel_shutdown')
        ? `<button class="btn-reinstate-main" data-panel="${d.panelId}" style="font-size:0.7rem;padding:3px 8px;background:rgba(31,111,235,0.1);border:1px solid #1f6feb;color:#79c0ff;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;">🔌 Religar</button>`
        : '';
      return `<div style="display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border-bottom:1px solid var(--border);${d.reverted ? 'opacity:0.45;' : ''}">
        <span style="font-size:1rem;flex-shrink:0;margin-top:1px;">${icon}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.78rem;font-weight:600;color:var(--text-bright);">${d.panelId} — ${label}</div>
          <div style="font-size:0.68rem;color:var(--text-dim);font-family:monospace;">${d.reason}</div>
          <div style="font-size:0.66rem;color:var(--text-muted);margin-top:2px;">${ts}${revertBadge}</div>
        </div>
        ${btn}
      </div>`;
    }).join('');

    // Wire reinstate buttons
    container.querySelectorAll('.btn-reinstate-main').forEach(btn => {
      btn.addEventListener('click', () => {
        window.electronAPI.reinstatePanel(btn.dataset.panel);
        btn.disabled = true; btn.textContent = 'Religado ✓';
      });
    });
  }

  // ── Chaos state change → immediate notification ───────

  function onChaosChange(data) {
    if (!data) return;
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Cooldown de 2s por chave para não disparar múltiplos toasts ao arrastar slider
    const ckKey = `chaos_${data.type}_${data.panelId || ''}`;
    const now   = Date.now();
    if (_chaosToastCooldown.has(ckKey) && now - _chaosToastCooldown.get(ckKey) < TOAST_COOLDOWN_MS) return;
    _chaosToastCooldown.set(ckKey, now);

    const TYPE_LABELS = {
      overheat: 'Superaquecimento', hotspot: 'Hot-Spot', pid: 'Degradação PID',
      string_fail: 'Falha de String', bypass_fail: 'Falha de Bypass',
      soiling: 'Sujeira', sensor_fail: 'Falha de Sensor', corrupted: 'Dado Corrompido',
    };

    if (data.type === 'clear_all') {
      _makeToast(container, 'info', '🗑', 'Chaos Mode', 'Todas as falhas foram removidas.', 5000);
      return;
    }
    if (data.type === 'reinstate') {
      _makeToast(container, 'info', '🔌', 'Painel Religado', `${data.panelId} foi reativado pelo operador.`, 5000);
      return;
    }
    if (!data.type || data.type === 'clear') {
      _makeToast(container, 'info', '✅', 'Falha Removida', `${data.panelId} — normalizado.`, 5000);
      return;
    }

    const label     = TYPE_LABELS[data.type] || data.type;
    const isChange  = data.prev && data.prev.type === data.type;
    const title     = isChange ? 'Intensidade Alterada' : 'Falha Injetada';
    const bodyText  = isChange
      ? `${data.panelId} — ${label} (${data.prev.intensity}% → ${data.intensity}%)`
      : `${data.panelId} — ${label} (${data.intensity}%)`;
    _makeToast(container, 'warning', '⚡', title, bodyText, 6000);
  }

  function _handleAutoEvents(autoEvents) {
    autoEvents.forEach(e => {
      const key = e.type + (e.panelId || '');
      _showToast(key, e);
      // panel_shutdown é detectado via flag autoOff em _detectAlerts — não duplicar
      if (e.type === 'panel_shutdown') return;
      const def = TOAST_MESSAGES[e.type];
      if (!def) return;
      const body = e.panelId ? def.body(e) : def.body(e.value || '');
      _addHistory(def.icon, def.title, body, _lastTimeLabel, def.sev, null);
    });
  }

  const _suggestionCauses = {
    soiling:     'sujeira ou poeira acumulada',
    hotspot:     'sombreamento parcial ou hot-spot',
    pid:         'degradação PID (perda gradual de potência)',
    bypass_fail: 'falha em diodo de bypass',
    overheat:    'temperatura elevada na célula',
  };

  function _checkSuggestions(panels, m) {
    if (Date.now() - _suggestionCooldown < 60_000) return;
    const yellowPanels = panels.filter(p =>
      p.status !== 'normal' && p.efficiency > 40 && p.efficiency < 85 && p.efficiency > 0
    );
    if (yellowPanels.length === 0 || yellowPanels.length > 3) return;

    const status = yellowPanels[0].status;
    const cause  = _suggestionCauses[status] || 'problema desconhecido';
    _suggestionCooldown = Date.now();

    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-info';
    toast.innerHTML = `<span class="toast-icon">🔍</span><div><div class="toast-title">Já verificou seus painéis recentemente?</div><div class="toast-body">${yellowPanels.length} painel(is) com eficiência reduzida — pode ser ${cause}.</div></div><button class="toast-close">✕</button>`;
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 400); }, 9000);
  }

  return { init, update, updateChartLabel, updateTheme, syncControls, onChaosChange };
})();
