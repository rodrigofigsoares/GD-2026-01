'use strict';

// Requires BABYLON global (loaded via CDN before this script)
window.AppScene = (() => {
  let engine  = null;
  let scene   = null;
  const panels = {}; // id → { mesh, mat }

  // ── Public API ────────────────────────────────────────

  function init(canvas, config) {
    if (engine) {
      engine.dispose();
      Object.keys(panels).forEach(k => delete panels[k]);
    }

    engine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    scene = _buildScene(config);
    engine.runRenderLoop(() => scene.render());
    window.addEventListener('resize', () => engine.resize());
  }

  function update(payload) {
    payload.panels.forEach(p => {
      const entry = panels[p.id];
      if (!entry) return;
      entry.mat.diffuseColor = _color(p);
      entry.mesh.metadata.panelData = p;
    });
  }

  // ── Scene construction ────────────────────────────────

  function _buildScene(config) {
    const s = new BABYLON.Scene(engine);
    s.clearColor = new BABYLON.Color4(0.051, 0.067, 0.090, 1);

    _setupCamera(s, config);
    _setupLights(s);
    _createGround(s, config);
    _createPanels(s, config);
    _setupClickHandler(s);

    return s;
  }

  function _setupCamera(s, config) {
    const maxSide = Math.max(config.rows, config.cols);
    const cam = new BABYLON.ArcRotateCamera(
      'cam',
      -Math.PI / 4,
      Math.PI / 3.5,
      maxSide * 3 + 6,
      new BABYLON.Vector3(0, 1, 0),
      s
    );
    cam.attachControl(engine.getRenderingCanvas(), true);
    cam.lowerRadiusLimit      = 4;
    cam.upperRadiusLimit      = 80;
    cam.wheelDeltaPercentage  = 0.01;
  }

  function _setupLights(s) {
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), s);
    hemi.intensity   = 0.75;
    hemi.groundColor = new BABYLON.Color3(0.06, 0.07, 0.09);

    const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1, -2, -1), s);
    dir.intensity = 0.40;
    dir.position  = new BABYLON.Vector3(10, 20, 10);
  }

  function _createGround(s, config) {
    const w = (config.cols + 1) * 2.8;
    const h = (config.rows + 1) * 2.8;
    const g = BABYLON.MeshBuilder.CreateGround('ground', { width: w, height: h }, s);
    const m = new BABYLON.StandardMaterial('groundMat', s);
    m.diffuseColor  = new BABYLON.Color3(0.08, 0.10, 0.12);
    m.specularColor = new BABYLON.Color3(0, 0, 0);
    g.material = m;
  }

  function _createPanels(s, config) {
    const spacing = 2.5;
    const ox = -(config.cols - 1) * spacing / 2;
    const oz = -(config.rows - 1) * spacing / 2;

    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        const id   = `panel_${r}_${c}`;
        const mesh = BABYLON.MeshBuilder.CreateBox(id, {
          width: 2.0, height: 0.08, depth: 1.4,
        }, s);

        const mat = new BABYLON.StandardMaterial(`mat_${id}`, s);
        mat.diffuseColor  = new BABYLON.Color3(0.07, 0.09, 0.13);
        mat.specularColor = new BABYLON.Color3(0.04, 0.04, 0.04);
        mesh.material = mat;

        mesh.position.set(ox + c * spacing, 0.4, oz + r * spacing);
        mesh.rotation.x = Math.PI / 6; // 30° south-facing tilt
        mesh.metadata   = { id, row: r, col: c, panelData: null };

        panels[id] = { mesh, mat };
      }
    }
  }

  function _setupClickHandler(s) {
    s.onPointerObservable.add(info => {
      if (info.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
      const meta = info.pickInfo?.pickedMesh?.metadata;
      if (meta?.panelData) {
        window.showPanelTooltip?.(meta.panelData);
      } else if (info.pickInfo?.hit) {
        window.hidePanelTooltip?.();
      }
    });
  }

  // ── Color mapping ─────────────────────────────────────

  function _color(p) {
    switch (p.status) {
      case 'overheat':    return new BABYLON.Color3(0.88, 0.36, 0.04);
      case 'sensor_fail': return new BABYLON.Color3(0.32, 0.36, 0.42);
      case 'corrupted':   return new BABYLON.Color3(0.46, 0.20, 0.76);
    }
    if (p.efficiency <= 0)  return new BABYLON.Color3(0.06, 0.08, 0.12); // off / night
    if (p.efficiency >= 70) return new BABYLON.Color3(0.04, 0.58, 0.32); // green
    if (p.efficiency >= 30) return new BABYLON.Color3(0.72, 0.50, 0.04); // yellow
    return new BABYLON.Color3(0.74, 0.17, 0.17);                          // red
  }

  return { init, update };
})();
