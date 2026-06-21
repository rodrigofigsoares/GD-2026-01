'use strict';

// Wires simulation:tick IPC → scene + dashboard + header status bar
window.electronAPI.onSimulationTick((payload) => {
  _updateSimStatus(payload);
  window.AppScene?.update(payload);
  window.Dashboard?.update(payload);
});

// Chaos Mode toggle from menu
window.electronAPI.onChaosToggle((enabled) => {
  const section = document.getElementById('section-chaos');
  if (!section) return;

  if (enabled) {
    section.style.display = '';

    // Slide in, then pulse-highlight after entrance completes
    section.classList.remove('chaos-slide-in', 'chaos-highlight');
    void section.offsetWidth;
    section.classList.add('chaos-slide-in');

    setTimeout(() => {
      section.classList.remove('chaos-slide-in');
      section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      section.classList.add('chaos-highlight');
      setTimeout(() => section.classList.remove('chaos-highlight'), 1200);
    }, 240);
  } else {
    section.style.display = 'none';
    section.classList.remove('chaos-slide-in', 'chaos-highlight');
  }
});

let _statusRevealed = false;

function _updateSimStatus(p) {
  const statusEl = document.getElementById('sim-status');
  if (!statusEl) return;

  // First tick: fade the status bar in
  if (!_statusRevealed) {
    _statusRevealed = true;
    statusEl.style.display = 'flex';
    statusEl.style.animation = 'status-fade-in 0.4s ease forwards';
  }

  const [date, time] = p.timestamp.split('T');
  const [y, m, d]    = date.split('-');

  const ts = document.getElementById('sim-ts');
  if (ts) ts.textContent = `${d}/${m}/${y} ${time.slice(0, 5)}`;

  const ghiEl = document.getElementById('sim-ghi');
  if (ghiEl) ghiEl.textContent = p.globalMetrics.ghi.toFixed(0);

  const effEl = document.getElementById('sim-eff');
  if (effEl) effEl.textContent = p.globalMetrics.avgEfficiency.toFixed(1);

  const pw = p.globalMetrics.totalPower;
  const powEl = document.getElementById('sim-pow');
  if (powEl) powEl.textContent =
    pw >= 1000 ? `${(pw / 1000).toFixed(2)} kW` : `${pw.toFixed(0)} W`;

  // Sim-dot: pulses when running, static when paused
  const dotEl = statusEl.querySelector('.sim-dot');
  if (dotEl) {
    dotEl.style.animationPlayState = p.isPaused ? 'paused' : 'running';
    dotEl.style.background = p.isPaused ? 'var(--text-muted)' : 'var(--accent)';
  }
}
