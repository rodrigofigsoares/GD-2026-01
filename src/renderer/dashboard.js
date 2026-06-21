'use strict';

window.Dashboard = (() => {
  // ── State ─────────────────────────────────────────────
  let chart        = null;
  let isPlaying    = true;
  let currentSpeed = 1;
  const MAX_HIST   = 24;
  const hist       = { labels: [], power: [] };

  let selectedPanel  = null;          // panel clicked in 3D
  let activeFailures = {};            // panelId → failure string
  let _lastFailStr   = '';            // for dirty-check to avoid list rebuild every tick

  // ── Public API ────────────────────────────────────────

  function init() {
    isPlaying    = true;
    currentSpeed = 1;
    hist.labels.length = 0;
    hist.power.length  = 0;
    selectedPanel  = null;
    activeFailures = {};
    _lastFailStr   = '';

    _setupControls();
    _setupChaosControls();

    if (chart) { chart.destroy(); chart = null; }
    _initChart();
    _syncBtns();
    _renderChaosSection();
  }

  function update(payload) {
    _updateSensors(payload.globalMetrics);
    _pushPoint(payload.timestamp, payload.globalMetrics.totalPower);
    _syncChaosState(payload);
  }

  function updateChartLabel(label) {
    if (!chart) return;
    chart.data.datasets[0].label = label;
    chart.update('none');
  }

  function updateTheme(theme) {
    if (!chart) return;
    _applyChartTheme(theme !== 'light');
    chart.update('none');
  }

  function selectPanel(panelData) {
    selectedPanel = panelData;
    _renderChaosSection();
  }

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
      currentSpeed = 1;
      _syncBtns();
      window.electronAPI.simulationControl('speed', 1);
    });

    document.getElementById('btn-speed-5x')?.addEventListener('click', () => {
      currentSpeed = 5;
      _syncBtns();
      window.electronAPI.simulationControl('speed', 5);
    });
  }

  function _syncBtns() {
    const pp  = document.getElementById('btn-play-pause');
    const s1  = document.getElementById('btn-speed-1x');
    const s5  = document.getElementById('btn-speed-5x');
    const tFn = window.t;

    if (pp) {
      pp.textContent = isPlaying ? '⏸' : '▶';
      pp.title = isPlaying
        ? (tFn?.('ctrl.pause')  || 'Pause')
        : (tFn?.('ctrl.resume') || 'Resume');
      pp.classList.toggle('active', isPlaying);
    }
    if (s1) s1.classList.toggle('active', currentSpeed === 1);
    if (s5) s5.classList.toggle('active', currentSpeed === 5);
  }

  // ── Chaos Mode ────────────────────────────────────────

  const CHAOS_BTNS = {
    'btn-chaos-overheat':   'overheat',
    'btn-chaos-sensor':     'sensor_fail',
    'btn-chaos-corrupted':  'corrupted',
  };

  function _setupChaosControls() {
    [...Object.keys(CHAOS_BTNS), 'btn-chaos-clear-all'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
    });

    Object.entries(CHAOS_BTNS).forEach(([btnId, failure]) => {
      document.getElementById(btnId)?.addEventListener('click', () => {
        if (!selectedPanel) return;
        const current = activeFailures[selectedPanel.id];
        window.electronAPI.chaosApply(
          selectedPanel.id,
          current === failure ? 'clear' : failure
        );
      });
    });

    document.getElementById('btn-chaos-clear-all')?.addEventListener('click', () => {
      window.electronAPI.chaosClearAll();
    });
  }

  function _syncChaosState(payload) {
    const failStr = JSON.stringify(payload.activeFailures);
    if (failStr === _lastFailStr && !selectedPanel) return; // nothing changed

    activeFailures = {};
    payload.activeFailures.forEach(entry => {
      const [id, failure] = entry.split(':');
      activeFailures[id] = failure;
    });
    _lastFailStr = failStr;
    _renderChaosSection();
  }

  function _renderChaosSection() {
    const hintEl    = document.getElementById('chaos-hint');
    const panelIdEl = document.getElementById('chaos-panel-id');

    // ── Panel selection display ──────────────────────────
    if (selectedPanel) {
      if (hintEl)    hintEl.style.display = 'none';
      if (panelIdEl) { panelIdEl.style.display = ''; panelIdEl.textContent = selectedPanel.id; }
    } else {
      if (hintEl)    hintEl.style.display = '';
      if (panelIdEl) panelIdEl.style.display = 'none';
    }

    // ── Failure buttons ──────────────────────────────────
    const currentFailure = selectedPanel ? activeFailures[selectedPanel.id] : null;

    Object.entries(CHAOS_BTNS).forEach(([btnId, failure]) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.disabled = !selectedPanel;
      btn.classList.remove('f-overheat', 'f-sensor_fail', 'f-corrupted');
      if (selectedPanel && currentFailure === failure) btn.classList.add(`f-${failure}`);
    });

    // ── Active failures list ─────────────────────────────
    const failureCount = Object.keys(activeFailures).length;
    const wrapEl = document.getElementById('chaos-active-wrap');
    if (wrapEl) wrapEl.style.display = failureCount > 0 ? 'block' : 'none';

    const countEl = document.getElementById('chaos-active-count');
    if (countEl) {
      const fn = window.t?.('chaos.active');
      countEl.textContent = typeof fn === 'function' ? fn(failureCount) : `${failureCount}`;
    }

    const listEl = document.getElementById('chaos-active-list');
    if (!listEl) return;

    const newStr = JSON.stringify(activeFailures);
    if (listEl.dataset.rendered === newStr) return; // skip rebuild if unchanged
    listEl.dataset.rendered = newStr;

    listEl.innerHTML = '';
    Object.entries(activeFailures).forEach(([id, failure]) => {
      const item = document.createElement('div');
      item.className = 'chaos-active-item';

      const fLabel = window.t?.(`chaos.f.${failure}`) || failure;

      const idSpan  = document.createElement('span');
      idSpan.className = 'chaos-item-id';
      idSpan.textContent = id;

      const fSpan = document.createElement('span');
      fSpan.className = `chaos-item-failure ${failure}`;
      fSpan.textContent = fLabel;

      const clrBtn = document.createElement('button');
      clrBtn.className = 'chaos-item-clear';
      clrBtn.title = '✕';
      clrBtn.textContent = '✕';
      clrBtn.addEventListener('click', () => {
        window.electronAPI.chaosApply(id, 'clear');
      });

      item.appendChild(idSpan);
      item.appendChild(fSpan);
      item.appendChild(clrBtn);
      listEl.appendChild(item);
    });
  }

  // ── Sensor Cards ──────────────────────────────────────

  function _updateSensors(m) {
    _set('sensor-ghi',  `${m.ghi.toFixed(0)} W/m²`);
    _set('sensor-air',  `${m.airTemp.toFixed(1)} °C`);
    _set('sensor-cell', `${m.avgCellTemp.toFixed(1)} °C`);

    const effEl = document.getElementById('sensor-eff');
    if (effEl) {
      effEl.textContent = `${m.avgEfficiency.toFixed(1)}%`;
      effEl.style.color =
          m.ghi <= 0              ? 'var(--text-muted)'
        : m.avgEfficiency >= 70   ? 'var(--badge-green-fg)'
        : m.avgEfficiency >= 30   ? '#e6a817'
        :                           '#e63e3e';
    }

    const pw = m.totalPower;
    _set('sensor-pow', pw >= 1000
      ? `${(pw / 1000).toFixed(2)} kW`
      : `${pw.toFixed(0)} W`);
  }

  function _set(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ── Chart ─────────────────────────────────────────────

  function _initChart() {
    const canvas = document.getElementById('power-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    const dark = !document.body.classList.contains('light');

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: (window.t?.('chart.label') || 'Power'),
          data:  [],
          borderColor:     dark ? '#238636' : '#1a7f37',
          backgroundColor: dark ? 'rgba(35,134,54,0.10)' : 'rgba(26,127,55,0.08)',
          borderWidth:  2,
          pointRadius:      0,
          pointHoverRadius: 3,
          fill: true,
          tension: 0.4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: dark ? '#161b22' : '#ffffff',
            borderColor:     dark ? '#30363d' : '#d0d7de',
            borderWidth:  1,
            titleColor:   dark ? '#e6edf3' : '#1f2328',
            bodyColor:    dark ? '#8b949e' : '#57606a',
            callbacks: {
              label: (ctx) => {
                const v = ctx.raw;
                return ` ${v >= 1000 ? `${(v/1000).toFixed(2)} kW` : `${v.toFixed(0)} W`}`;
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

  function _applyChartTheme(dark) {
    const ds = chart.data.datasets[0];
    ds.borderColor     = dark ? '#238636' : '#1a7f37';
    ds.backgroundColor = dark ? 'rgba(35,134,54,0.10)' : 'rgba(26,127,55,0.08)';

    const tt = chart.options.plugins.tooltip;
    tt.backgroundColor = dark ? '#161b22' : '#ffffff';
    tt.borderColor     = dark ? '#30363d' : '#d0d7de';
    tt.titleColor      = dark ? '#e6edf3' : '#1f2328';
    tt.bodyColor       = dark ? '#8b949e' : '#57606a';

    chart.options.scales.x.grid.color  = dark ? '#21262d' : '#d0d7de';
    chart.options.scales.x.ticks.color = dark ? '#484f58' : '#8c959f';
    chart.options.scales.y.grid.color  = dark ? '#21262d' : '#d0d7de';
    chart.options.scales.y.ticks.color = dark ? '#484f58' : '#8c959f';
  }

  function _pushPoint(timestamp, totalPower) {
    if (!chart) return;

    const [date, time] = timestamp.split('T');
    const [, m, d]     = date.split('-');
    hist.labels.push(`${d}/${m} ${time.slice(0, 5)}`);
    hist.power.push(parseFloat(totalPower.toFixed(1)));

    if (hist.labels.length > MAX_HIST) { hist.labels.shift(); hist.power.shift(); }

    chart.data.labels           = [...hist.labels];
    chart.data.datasets[0].data = [...hist.power];
    chart.update('none');
  }

  return {
    init,
    update,
    updateChartLabel,
    updateTheme,
    syncControls: _syncBtns,
    selectPanel,
  };
})();
