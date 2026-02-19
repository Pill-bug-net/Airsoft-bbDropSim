'use strict';

// ============================================================
//  BBProjectile — 物理計算 (BBPhysics) と Three.js を橋渡し
//  球メッシュ + 3D トレイル + 2D グラフ用ログ を管理
// ============================================================

// BB の色セット (発射ごとに順番に使う)
const BB_COLORS = [0x00ff88, 0xff9900, 0xff44aa, 0x44aaff, 0xffff00];
let _bbColorIndex = 0;

class BBProjectile {
  /**
   * @param {THREE.Scene}  scene
   * @param {number}       initialSpeed  - 初速 m/s (法的クランプ済)
   * @param {number}       omega         - HopUp 角速度 rad/s
   * @param {THREE.Camera} camera        - 発射方向の取得元
   * @param {number}       mass          - BB 質量 kg
   * @param {number[]}     windVelocity  - 風速ベクトル [wx,wy,wz]
   */
  constructor(scene, initialSpeed, omega, camera, mass, windVelocity) {
    this.scene  = scene;
    this.alive  = true;
    this.color  = BB_COLORS[_bbColorIndex % BB_COLORS.length];
    _bbColorIndex++;

    // カメラ正面方向を発射方向に使う
    const dir3 = new THREE.Vector3();
    camera.getWorldDirection(dir3);
    const direction = [dir3.x, dir3.y, dir3.z];

    // 物理エンジン
    this.physics = new BBPhysics(initialSpeed, omega, direction, mass, windVelocity);

    // ── 3D 球メッシュ (視覚サイズは少し大きめ r=0.015m) ──
    const geo = new THREE.SphereGeometry(0.015, 8, 6);
    const mat = new THREE.MeshPhongMaterial({
      color:     this.color,
      shininess: 80,
      emissive:  new THREE.Color(this.color).multiplyScalar(0.15),
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    // ── 3D トレイル (ローリングバッファ) ──
    this._trailMax      = 120;
    this._trailPos      = new Float32Array(this._trailMax * 3);
    this._trailCount    = 0;
    this._trailGeo      = new THREE.BufferGeometry();
    this._trailGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this._trailPos, 3)
    );
    this._trailGeo.setDrawRange(0, 0);
    this._trailMat  = new THREE.LineBasicMaterial({
      color:       this.color,
      transparent: true,
      opacity:     0.5,
    });
    this._trailLine = new THREE.Line(this._trailGeo, this._trailMat);
    scene.add(this._trailLine);

    // ── 2D グラフ用 位置ログ ──
    // 全フレームの [x,y,z] を蓄積 (TrajectoryGraph が参照)
    this.positionLog = [];
    this._finalRange = 0;
  }

  // ----------------------------------------------------------
  //  1フレーム更新
  //  戻り値: true=生存 / false=消滅
  // ----------------------------------------------------------
  update() {
    const stillAlive = this.physics.step();

    const [px, py, pz] = this.physics.position;

    // 位置ログを蓄積 (2D グラフ用; 全軌跡)
    this.positionLog.push([px, py, pz]);

    if (!stillAlive) {
      this.alive       = false;
      this._finalRange = this.physics.distanceTravelled;
      // 最終位置をメッシュに反映
      this.mesh.position.set(px, py, pz);
      return false;
    }

    this.mesh.position.set(px, py, pz);
    this._updateTrail(px, py, pz);

    return true;
  }

  // ----------------------------------------------------------
  //  3D トレイルをローリングバッファで更新
  // ----------------------------------------------------------
  _updateTrail(px, py, pz) {
    const max = this._trailMax;
    const pos = this._trailPos;

    if (this._trailCount < max) {
      const i   = this._trailCount * 3;
      pos[i]    = px;
      pos[i+1]  = py;
      pos[i+2]  = pz;
      this._trailCount++;
    } else {
      // バッファが満杯 → 先頭を捨てて末尾に追記
      pos.copyWithin(0, 3);
      const i   = (max - 1) * 3;
      pos[i]    = px;
      pos[i+1]  = py;
      pos[i+2]  = pz;
    }

    this._trailGeo.attributes.position.needsUpdate = true;
    this._trailGeo.setDrawRange(0, this._trailCount);
  }

  // ----------------------------------------------------------
  //  GPU リソースを解放してシーンから除去
  // ----------------------------------------------------------
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();

    this.scene.remove(this._trailLine);
    this._trailGeo.dispose();
    this._trailMat.dispose();
  }

  /** 着弾時の水平距離 (m) */
  get range() {
    return this._finalRange;
  }
}
