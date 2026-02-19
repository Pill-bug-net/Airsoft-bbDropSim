'use strict';

// ============================================================
//  TrajectoryGraph — 左下の 2D 弾道グラフ
//  X軸: 水平距離 0〜100m, Y軸: 高さ 0〜3m
// ============================================================

class TrajectoryGraph {
  constructor() {
    this._canvas  = null;
    this._ctx     = null;
    this._shots   = [];   // 過去 5 発分 { log, color }
    this._maxShots = 5;

    // グラフ描画エリアの余白
    this._pad = { top: 24, right: 10, bottom: 28, left: 42 };
  }

  init(canvasEl) {
    this._canvas = canvasEl;
    this._ctx    = canvasEl.getContext('2d');
  }

  /** 着弾した BB の軌跡ログを追加 */
  addShot(positionLog, color) {
    this._shots.push({ log: positionLog.slice(), color });
    if (this._shots.length > this._maxShots) this._shots.shift();
  }

  /** 毎フレーム: activeBBs の現在軌跡 + 過去軌跡を描画 */
  draw(activeBBs) {
    const c   = this._canvas;
    const ctx = this._ctx;
    const W   = c.width;
    const H   = c.height;
    const p   = this._pad;

    const gw = W - p.left - p.right;   // グラフ幅
    const gh = H - p.top  - p.bottom;  // グラフ高さ

    ctx.clearRect(0, 0, W, H);

    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, W, H);

    // グリッド + 軸
    this._drawGrid(ctx, gw, gh, p);

    // 過去 5 発 (古い順に薄い)
    this._shots.forEach((shot, i) => {
      const alpha = 0.25 + (i / this._maxShots) * 0.5;
      this._drawPath(ctx, shot.log, shot.color, alpha, gw, gh, p, true);
    });

    // 飛行中の BB (全て白でリアルタイム)
    activeBBs.forEach(bb => {
      if (bb.positionLog.length > 1) {
        this._drawPath(ctx, bb.positionLog, bb.color, 1.0, gw, gh, p, false);
      }
    });
  }

  // ── X (水平距離 0〜100m)、Y (高さ 0〜3m) を画素に変換 ──
  _toX(dist, gw) { return this._pad.left + (dist / 100) * gw; }
  _toY(height, gh) { return this._pad.top + gh - (height / 3) * gh; }

  _drawGrid(ctx, gw, gh, p) {
    const px0 = p.left;
    const py0 = p.top;
    const px1 = p.left + gw;
    const py1 = p.top  + gh;

    // グリッド線 (5m)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth   = 0.5;
    for (let d = 0; d <= 100; d += 5) {
      const x = this._toX(d, gw);
      ctx.beginPath(); ctx.moveTo(x, py0); ctx.lineTo(x, py1); ctx.stroke();
    }
    // Y 方向グリッド (0.5m)
    for (let h = 0; h <= 3; h += 0.5) {
      const y = this._toY(h, gh);
      ctx.beginPath(); ctx.moveTo(px0, y); ctx.lineTo(px1, y); ctx.stroke();
    }

    // 軸線
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(px0, py0); ctx.lineTo(px0, py1); // Y軸
    ctx.moveTo(px0, py1); ctx.lineTo(px1, py1); // X軸
    ctx.stroke();

    // 目線高さ (1.5m) 参考線
    const eyeY = this._toY(1.5, gh);
    ctx.strokeStyle = 'rgba(255,255,100,0.25)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(px0, eyeY); ctx.lineTo(px1, eyeY); ctx.stroke();
    ctx.setLineDash([]);

    // X 軸ラベル (10m 毎)
    ctx.fillStyle  = '#888';
    ctx.font       = '9px monospace';
    ctx.textAlign  = 'center';
    for (let d = 0; d <= 100; d += 10) {
      ctx.fillText(`${d}m`, this._toX(d, gw), py1 + 12);
    }

    // Y 軸ラベル (0, 1, 2, 3m)
    ctx.textAlign = 'right';
    for (let h = 0; h <= 3; h++) {
      ctx.fillText(`${h}m`, px0 - 4, this._toY(h, gh) + 3);
    }

    // タイトル
    ctx.fillStyle = '#aaffaa';
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('弾道 (側面)', p.left + gw / 2, p.top - 8);
  }

  _drawPath(ctx, log, color, alpha, gw, gh, p, markImpact) {
    if (log.length < 2) return;

    // 16進カラー → rgba
    const r = (color >> 16) & 0xff;
    const g = (color >>  8) & 0xff;
    const b =  color        & 0xff;

    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth   = alpha > 0.7 ? 1.5 : 1;
    ctx.beginPath();

    log.forEach(([px, py, pz], i) => {
      // 水平距離 = sqrt(px²+pz²)
      const dist = Math.sqrt(px * px + pz * pz);
      const cx   = this._toX(dist, gw);
      const cy   = this._toY(py,   gh);
      if (i === 0) ctx.moveTo(cx, cy);
      else          ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    // 着弾点に × マーク
    if (markImpact) {
      const [lx, ly, lz] = log[log.length - 1];
      const dist = Math.sqrt(lx * lx + lz * lz);
      const cx   = this._toX(dist, gw);
      const cy   = this._toY(ly,   gh);
      const s    = 4;
      ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(alpha + 0.3, 1)})`;
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
      ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
      ctx.stroke();
    }
  }
}

// ============================================================
//  UIManager — Property パネル、スコープ、HUD 管理
// ============================================================

class UIManager {
  constructor() {
    // ── 設定値 ──
    this.mass          = BB_WEIGHTS['0.20'];  // kg デフォルト 0.20g
    this.hopupPct      = 0;                   // 0–100 %
    this.omega         = 0;                   // rad/s
    this.baseVelocity  = 90;                  // m/s (ユーザー入力)
    this.barrelMm      = 300;                 // mm
    this.windSpeed     = 0;                   // m/s
    this.windDirDeg    = 0;                   // 度
    this.muzzleVelocity = 90;                 // m/s (実際に使う初速)

    // ── スコープ ──
    this._scopeActive  = false;
    this._scopeCanvas  = null;
    this._scopeCtx     = null;

    // ── 2D 弾道グラフ ──
    this.trajectoryGraph = new TrajectoryGraph();

    // ── FPS 計測 ──
    this._fpsBuf  = [];
    this._lastT   = performance.now();

    // ── 最後の射程 ──
    this._lastRange = null;
  }

  // ----------------------------------------------------------
  //  初期化: DOM イベントを全て登録
  // ----------------------------------------------------------
  init(sceneManager) {
    this._sceneManager = sceneManager;

    // 2D グラフ Canvas
    this.trajectoryGraph.init(document.getElementById('trajectory-canvas'));

    // スコープ Canvas
    this._scopeCanvas = document.getElementById('scope-canvas');
    this._scopeCtx    = this._scopeCanvas.getContext('2d');
    this._resizeScopeCanvas();
    window.addEventListener('resize', () => this._resizeScopeCanvas());

    // ── BB 重さ (ラジオボタン) ──
    document.querySelectorAll('input[name="bb-weight"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this.mass = BB_WEIGHTS[radio.value];
        this._updateMuzzleVelocity();
      });
    });

    // ── HopUp スライダー ──
    const hopSlider = document.getElementById('hopup-slider');
    const hopVal    = document.getElementById('hopup-val');
    hopSlider.addEventListener('input', () => {
      this.hopupPct = parseInt(hopSlider.value, 10);
      this.omega    = (this.hopupPct / 100) * 3000;
      hopVal.textContent = `${this.hopupPct}%`;
    });

    // ── 基本初速 スライダー ──
    const velSlider = document.getElementById('vel-slider');
    const velVal    = document.getElementById('vel-val');
    velSlider.addEventListener('input', () => {
      this.baseVelocity = parseFloat(velSlider.value);
      velVal.textContent = `${this.baseVelocity.toFixed(1)} m/s`;
      this._updateMuzzleVelocity();
    });

    // ── バレル長 スライダー ──
    const barrelSlider = document.getElementById('barrel-slider');
    const barrelVal    = document.getElementById('barrel-val');
    barrelSlider.addEventListener('input', () => {
      this.barrelMm = parseInt(barrelSlider.value, 10);
      barrelVal.textContent = `${this.barrelMm} mm`;
      this._updateMuzzleVelocity();
    });

    // ── 風速 スライダー ──
    const windSpdSlider = document.getElementById('wind-speed-slider');
    const windSpdVal    = document.getElementById('wind-speed-val');
    windSpdSlider.addEventListener('input', () => {
      this.windSpeed = parseFloat(windSpdSlider.value);
      windSpdVal.textContent = `${this.windSpeed.toFixed(1)} m/s`;
      sceneManager.updateWindArrow(this.windSpeed, this.windDirDeg);
    });

    // ── 風向き スライダー ──
    const windDirSlider = document.getElementById('wind-dir-slider');
    const windDirVal    = document.getElementById('wind-dir-val');
    windDirSlider.addEventListener('input', () => {
      this.windDirDeg = parseInt(windDirSlider.value, 10);
      windDirVal.textContent = `${this.windDirDeg}°`;
      this._updateWindDirIcon(this.windDirDeg);
      sceneManager.updateWindArrow(this.windSpeed, this.windDirDeg);
    });

    // 初期表示を更新
    this._updateMuzzleVelocity();
  }

  // ----------------------------------------------------------
  //  初速計算 (バレル補正 → 法的クランプ)
  // ----------------------------------------------------------
  _updateMuzzleVelocity() {
    const raw     = barrelCorrectedVelocity(this.baseVelocity, this.barrelMm);
    const vMax    = legalMaxVelocity(this.mass);
    const clamped = Math.min(raw, vMax);
    const over    = raw > vMax + 0.01;

    this.muzzleVelocity = clamped;

    // ── 法定上限速度の表示更新 ──
    const legalEl = document.getElementById('legal-max');
    if (legalEl) legalEl.textContent = `法定上限: ${vMax.toFixed(1)} m/s`;

    // ── スライダー上限をBB重量に合わせる ──
    const velSlider = document.getElementById('vel-slider');
    if (velSlider) {
      velSlider.max = vMax.toFixed(1);
      if (this.baseVelocity > vMax) {
        this.baseVelocity = vMax;
        velSlider.value = vMax;
        document.getElementById('vel-val').textContent = `${vMax.toFixed(1)} m/s`;
      }
    }

    // ── 初速・エネルギー表示 ──
    const mvEl  = document.getElementById('muzzle-velocity');
    const enEl  = document.getElementById('muzzle-energy');
    const warnEl = document.getElementById('legal-warning');
    const energy = 0.5 * this.mass * clamped * clamped;

    if (mvEl)   mvEl.textContent  = `${clamped.toFixed(2)} m/s`;
    if (enEl)   enEl.textContent  = `E = ${energy.toFixed(4)} J`;
    if (warnEl) {
      warnEl.style.display = over ? 'block' : 'none';
    }
  }

  // ----------------------------------------------------------
  //  風向きアイコン (矢印文字で表示)
  // ----------------------------------------------------------
  _updateWindDirIcon(deg) {
    const arrows = ['↑','↗','→','↘','↓','↙','←','↖'];
    const idx    = Math.round((deg % 360) / 45) % 8;
    const el     = document.getElementById('wind-dir-icon');
    if (el) el.textContent = arrows[idx];
  }

  // ----------------------------------------------------------
  //  スコープ ON/OFF トグル
  // ----------------------------------------------------------
  toggleScope() {
    this._scopeActive = !this._scopeActive;
    const overlay = document.getElementById('scope-overlay');

    if (this._scopeActive) {
      overlay.classList.remove('hidden');
      this._drawScopeOverlay();
      this._sceneManager.enterScopeView();
    } else {
      overlay.classList.add('hidden');
      this._sceneManager.exitScopeView();
    }
  }

  get scopeActive() { return this._scopeActive; }

  // ----------------------------------------------------------
  //  スコープオーバーレイ描画 (2D Canvas)
  //  円形マスク + グラデーション + クロスヘア + 赤い丸
  // ----------------------------------------------------------
  _drawScopeOverlay() {
    const ctx = this._scopeCtx;
    const W   = this._scopeCanvas.width;
    const H   = this._scopeCanvas.height;
    const cx  = W / 2;
    const cy  = H / 2;
    const R   = Math.min(W, H) * 0.40;

    ctx.clearRect(0, 0, W, H);

    // ① 全体を暗くする
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, W, H);

    // ② スコープ円をくり抜く (destination-out)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ③ 内部ビネット (ラジアルグラデーション)
    ctx.save();
    const grad = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    grad.addColorStop(0,   'rgba(0,0,0,0)');
    grad.addColorStop(0.8, 'rgba(0,0,0,0.1)');
    grad.addColorStop(1,   'rgba(0,0,0,0.6)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ④ クロスヘア (細い暗緑線、中心付近に隙間)
    const gap = 20;
    ctx.save();
    ctx.strokeStyle = 'rgba(20,100,20,0.75)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    // 水平
    ctx.moveTo(cx - R, cy);  ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + R, cy);
    // 垂直
    ctx.moveTo(cx, cy - R);  ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + R);
    ctx.stroke();

    // ミル目盛り (5 段階)
    ctx.strokeStyle = 'rgba(30,120,30,0.5)';
    for (let i = 1; i <= 5; i++) {
      const off = (R / 5) * i;
      const hw  = (i % 5 === 0) ? 12 : 6;
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy - off); ctx.lineTo(cx + hw, cy - off);
      ctx.moveTo(cx - hw, cy + off); ctx.lineTo(cx + hw, cy + off);
      ctx.moveTo(cx - off, cy - hw); ctx.lineTo(cx - off, cy + hw);
      ctx.moveTo(cx + off, cy - hw); ctx.lineTo(cx + off, cy + hw);
      ctx.stroke();
    }
    ctx.restore();

    // ⑤ 赤い丸 (中心)
    ctx.save();
    ctx.fillStyle   = 'rgba(255,0,0,0.92)';
    ctx.shadowColor = 'rgba(255,0,0,0.6)';
    ctx.shadowBlur  = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ⑥ スコープ枠
    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _resizeScopeCanvas() {
    this._scopeCanvas.width  = window.innerWidth;
    this._scopeCanvas.height = window.innerHeight;
    if (this._scopeActive) this._drawScopeOverlay();
  }

  // ----------------------------------------------------------
  //  毎フレーム HUD 更新
  // ----------------------------------------------------------
  updateHUD(lastShotRange) {
    // FPS 計測
    const now = performance.now();
    const dt  = now - this._lastT;
    this._lastT = now;
    this._fpsBuf.push(1000 / dt);
    if (this._fpsBuf.length > 60) this._fpsBuf.shift();
    const fps = Math.round(
      this._fpsBuf.reduce((a, b) => a + b, 0) / this._fpsBuf.length
    );

    const fpsEl = document.getElementById('hud-fps');
    if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;

    if (lastShotRange !== null) {
      this._lastRange = lastShotRange;
    }
    const rangeEl = document.getElementById('hud-range');
    if (rangeEl && this._lastRange !== null) {
      rangeEl.textContent = `射程: ${this._lastRange.toFixed(1)} m`;
    }

    const hopEl = document.getElementById('hud-hopup');
    if (hopEl) hopEl.textContent = `HopUp: ${this.hopupPct}%`;
  }

  // ----------------------------------------------------------
  //  現在の風速ベクトル [wx, wy, wz] を返す
  // ----------------------------------------------------------
  getWindVelocity() {
    const rad = this.windDirDeg * Math.PI / 180;
    return [
      this.windSpeed * Math.sin(rad),
      0,
      this.windSpeed * Math.cos(rad),
    ];
  }
}

const uiManager = new UIManager();
