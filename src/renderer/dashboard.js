'use strict';

window.Dashboard = (() => {
  // ── State ─────────────────────────────────────────────
  let powerChart  = null;
  let fleetDonut  = null;
  let isPlaying   = true;
  let currentSpeed = 1;
  let _rows = 1, _cols = 1;
  let _isDark = true;

  const MAX_HIST = 24;
  const hist = { labels: [], power: [], expected: [] };

  let kwhGenerated = 0;
  let kwhExpected  = 0;
  const CO2_FACTOR = 0.0765; // kg CO₂/kWh (fator rede elétrica brasileira)

  const alerts = [];
  const MAX_ALERTS = 30;
  let _prevFailureIds = new Set();

  // ── Public API ────────────────────────────────────────

  function init(config) {
    _rows = config?.rows ?? 1;
    _cols = config?.cols ?? 1;
    _isDark = !document.body.classList.contains('light');

    isPlaying    = true;
    currentSpeed = 1;
    hist.labels.length = 0;
    hist.power.length  = 0;
    hist.expected.length = 0;
    kwhGenerated = 0;
    kwhExpected  = 0;
    alerts.length = 0;
    _prevFailureIds = new Set();

    _setupControls();
    _setupFooterTabs();

    if (powerChart) { powerChart.destroy(); powerChart = null; }
    if (fleetDonut) { fleetDonut.destroy(); fleetDonut = null; }

    _initPowerChart();
    _initFleetDonut();
    _renderAlerts();
    _syncBtns();
  }

  function update(payload) {
    const m = payload.globalMetrics;
    _updateSensors(m);
    _updateFleet(payload.panels);
    _updateEnergy(m.totalPower, m.totalExpected ?? m.totalPower);
    _pushPoint(payload.timestamp, m.totalPower, m.totalExpected ?? m.totalPower);
    _updateGhiGauge(m.ghi);
    _updateHeatmap(payload.panels);
    _detectAlerts(payload);
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
    ['btn-play-pause', 'btn-speed-1x', 'btn-speed-5x'].forEach(id => {
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
    document.getElementById('btn-speed-1x')?.addEventListener('click', () => {
      currentSpeed = 1; _syncBtns();
      window.electronAPI.simulationControl('speed', 1);
    });
    document.getElementById('btn-speed-5x')?.addEventListener('click', () => {
      currentSpeed = 5; _syncBtns();
      window.electronAPI.simulationControl('speed', 5);
    });
  }

  function _syncBtns() {
    const pp = document.getElementById('btn-play-pause');
    const s1 = document.getElementById('btn-speed-1x');
    const s5 = document.getElementById('btn-speed-5x');
    if (pp) {
      pp.textContent = isPlaying ? '⏸' : '▶';
      pp.title = isPlaying
        ? (window.t?.('ctrl.pause')  || 'Pausar')
        : (window.t?.('ctrl.resume') || 'Retomar');
      pp.classList.toggle('active', isPlaying);
    }
    if (s1) s1.classList.toggle('active', currentSpeed === 1);
    if (s5) s5.classList.toggle('active', currentSpeed === 5);
  }

  // ── Footer Tabs ───────────────────────────────────────

  function _setupFooterTabs() {
    ['tab-power', 'tab-temp'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
    });
    document.getElementById('tab-power')?.addEventListener('click', () => _setTab('power'));
    document.getElementById('tab-temp')?.addEventListener('click',  () => _setTab('temp'));
  }

  function _setTab(tab) {
    document.getElementById('panel-power').style.display = tab === 'power' ? '' : 'none';
    document.getElementById('panel-temp').style.display  = tab === 'temp'  ? '' : 'none';
    document.getElementById('tab-power').classList.toggle('active', tab === 'power');
    document.getElementById('tab-temp').classList.toggle('active',  tab === 'temp');
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
    const cy = h * 0.88;
    const r  = Math.min(w * 0.42, h * 0.80);
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

  function _detectAlerts(payload) {
    const currentIds = new Set();
    payload.activeFailures.forEach(entry => {
      const [id] = entry.split(':');
      currentIds.add(id);
    });

    const [, time] = payload.timestamp.split('T');
    const label = time.slice(0, 5);

    currentIds.forEach(id => {
      if (!_prevFailureIds.has(id)) {
        alerts.unshift({ type: 'failure', panelId: id, time: label });
        if (alerts.length > MAX_ALERTS) alerts.pop();
      }
    });

    _prevFailureIds.forEach(id => {
      if (!currentIds.has(id)) {
        alerts.unshift({ type: 'cleared', panelId: id, time: label });
        if (alerts.length > MAX_ALERTS) alerts.pop();
      }
    });

    _prevFailureIds = currentIds;
    _renderAlerts();
  }

  function _renderAlerts() {
    const list = document.getElementById('alert-list');
    if (!list) return;

    if (alerts.length === 0) {
      list.innerHTML = `<div class="alert-empty">${window.t?.('alerts.empty') || 'Nenhum alerta'}</div>`;
      return;
    }

    list.innerHTML = '';
    alerts.forEach(a => {
      const item  = document.createElement('div');
      item.className = `alert-item ${a.type}`;

      const time = document.createElement('span');
      time.className   = 'alert-time';
      time.textContent = a.time;

      const msg  = document.createElement('span');
      msg.className   = 'alert-msg';
      const verb = a.type === 'failure'
        ? (window.t?.('alerts.anomaly') || 'Anomalia')
        : (window.t?.('alerts.cleared') || 'Normalizado');
      msg.textContent = `${a.panelId} — ${verb}`;

      item.appendChild(time);
      item.appendChild(msg);
      list.appendChild(item);
    });
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

  return { init, update, updateChartLabel, updateTheme, syncControls };
})();
