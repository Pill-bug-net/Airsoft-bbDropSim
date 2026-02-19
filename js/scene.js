'use strict';

// ============================================================
//  SceneManager — Three.js シーン管理
//  1人称視点カメラ、地面、5m距離マーカー、風矢印、FOVアニメーション
// ============================================================

class SceneManager {
  constructor() {
    this.renderer     = null;
    this.scene        = null;
    this.camera       = null;
    this._windArrow   = null;
    this._normalFOV   = 75;
    this._targetFOV   = 75;
    this._tweening    = false;
  }

  // ----------------------------------------------------------
  //  初期化
  // ----------------------------------------------------------
  init() {
    // WebGL レンダラー
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    // シーン (空色背景 + フォグ)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 130);

    // カメラ: 1人称視点 (目線高さ 1.5m)
    this.camera = new THREE.PerspectiveCamera(
      this._normalFOV,
      window.innerWidth / window.innerHeight,
      0.01,
      500
    );
    this.camera.position.set(0, 1.5, 0);
    this.camera.lookAt(0, 1.5, -100);

    this._buildLighting();
    this._buildGround();
    this._buildWindArrow();

    window.addEventListener('resize', () => this._onResize());
  }

  // ----------------------------------------------------------
  //  ライティング
  // ----------------------------------------------------------
  _buildLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(10, 30, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.width  = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far  = 200;
    dir.shadow.camera.left = dir.shadow.camera.bottom = -80;
    dir.shadow.camera.right = dir.shadow.camera.top   =  80;
    this.scene.add(dir);
  }

  // ----------------------------------------------------------
  //  地面 + グリッド + 5m 距離マーカー
  // ----------------------------------------------------------
  _buildGround() {
    // 緑の地面 (200m × 200m)
    const gGround = new THREE.PlaneGeometry(200, 200);
    const mGround = new THREE.MeshLambertMaterial({ color: 0x3d7a46 });
    const ground  = new THREE.Mesh(gGround, mGround);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // グリッド: 5m セル × 20 分割 = 100m 幅、奥行き中央を -50m にオフセット
    const grid = new THREE.GridHelper(100, 20, 0x1a4d22, 0x2d6e35);
    grid.position.set(0, 0.005, -50);
    this.scene.add(grid);

    // 距離マーカー: 5m ごと
    for (let d = 5; d <= 100; d += 5) {
      const isMajor = (d % 10 === 0);

      // 横線 (幅 ±4m)
      const pts = [
        new THREE.Vector3(-4, 0.015, -d),
        new THREE.Vector3(4,  0.015, -d),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: isMajor ? 0xffffff : 0x999999,
      });
      this.scene.add(new THREE.Line(lineGeo, lineMat));

      // テキストスプライト
      const sprite = this._makeLabel(`${d}m`, isMajor);
      sprite.position.set(4.8, 0.8, -d);
      const sw = isMajor ? 2.0 : 1.2;
      const sh = isMajor ? 1.0 : 0.6;
      sprite.scale.set(sw, sh, 1);
      this.scene.add(sprite);
    }
  }

  // 2D Canvas テキスト → THREE.Sprite
  _makeLabel(text, bold) {
    const canvas = document.createElement('canvas');
    canvas.width  = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 64);
    ctx.font         = `${bold ? 'bold ' : ''}28px monospace`;
    ctx.fillStyle    = bold ? '#ffffff' : '#cccccc';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    return new THREE.Sprite(mat);
  }

  // ----------------------------------------------------------
  //  風向き矢印 (ArrowHelper)
  // ----------------------------------------------------------
  _buildWindArrow() {
    const dir    = new THREE.Vector3(0, 0, -1);
    const origin = new THREE.Vector3(-8, 0.05, -8);
    this._windArrow = new THREE.ArrowHelper(dir, origin, 0.01, 0x00e5ff, 0.4, 0.3);
    this.scene.add(this._windArrow);

    // 風なし = 非表示
    this._windArrow.visible = false;
  }

  /**
   * 風設定が変わったときに呼ぶ
   * @param {number} windSpeed   - m/s
   * @param {number} windDirDeg  - 度 (0=正面から, 90=右から)
   */
  updateWindArrow(windSpeed, windDirDeg) {
    if (windSpeed < 0.01) {
      this._windArrow.visible = false;
      return;
    }

    const rad = windDirDeg * Math.PI / 180;
    // wind_velocity = [sin, 0, cos] — 風が「この方向から」吹いてくる方向を矢印で表示
    const dir = new THREE.Vector3(Math.sin(rad), 0, Math.cos(rad)).normalize();
    this._windArrow.setDirection(dir);
    this._windArrow.setLength(Math.min(windSpeed * 0.4 + 0.5, 6), 0.4, 0.3);
    this._windArrow.visible = true;
  }

  // ----------------------------------------------------------
  //  スコープビュー: FOV を 75 ↔ 30 でアニメーション
  // ----------------------------------------------------------
  enterScopeView() {
    this._targetFOV = 30;
    this._tweening  = true;
  }

  exitScopeView() {
    this._targetFOV = this._normalFOV;
    this._tweening  = true;
  }

  _updateFOV() {
    if (!this._tweening) return;
    const diff = this._targetFOV - this.camera.fov;
    if (Math.abs(diff) < 0.25) {
      this.camera.fov = this._targetFOV;
      this._tweening  = false;
    } else {
      this.camera.fov += diff * 0.14;
    }
    this.camera.updateProjectionMatrix();
  }

  // ----------------------------------------------------------
  //  ウィンドウリサイズ
  // ----------------------------------------------------------
  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ----------------------------------------------------------
  //  毎フレーム呼ぶ
  // ----------------------------------------------------------
  renderFrame() {
    this._updateFOV();
    this.renderer.render(this.scene, this.camera);
  }
}

const sceneManager = new SceneManager();
