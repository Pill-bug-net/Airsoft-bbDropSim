'use strict';

// ============================================================
//  BBPhysics — 純粋物理計算クラス (Three.js 依存なし)
//  BB弾: 0.20g / 0.25g / 0.28g, 直径 6mm
//  物理: 重力 + 空気抵抗(風相対速度) + マグナス力(HopUp)
//  日本法律: 運動エネルギー < 0.98 J (銃刀法)
// ============================================================

const BB_CONST = {
  radius:      0.003,                           // m (直径 6mm)
  airDensity:  1.293,                           // kg/m³
  Cd:          0.47,                            // 球の抗力係数
  crossArea:   Math.PI * 0.003 * 0.003,         // ≈ 2.827e-5 m²
  gravity:     9.8,                             // m/s²
  dt:          1 / 60,                          // s/ティック
  maxRange:    100,                             // m (これを超えたら廃棄)
  legalMaxJ:   0.98,                            // J (銃刀法上限)
};

// BB重量ごとの法定上限初速を計算して返す
function legalMaxVelocity(massKg) {
  return Math.sqrt(2 * BB_CONST.legalMaxJ / massKg);
}

// BBの重さ定数
const BB_WEIGHTS = {
  '0.20': 0.0002,
  '0.25': 0.00025,
  '0.28': 0.00028,
};

// バレル長 → 初速補正係数
// v_actual = baseVelocity * sqrt(barrelMm / 300)
function barrelCorrectedVelocity(baseVelocity, barrelMm) {
  return baseVelocity * Math.sqrt(barrelMm / 300);
}

// ============================================================
class BBPhysics {
  /**
   * @param {number}   initialSpeed  - 初速 m/s (バレル補正・法的クランプ済)
   * @param {number}   omega         - 角速度 rad/s (HopUp 回転)
   * @param {number[]} direction     - 発射方向の単位ベクトル [x,y,z]
   * @param {number}   mass          - BB質量 kg
   * @param {number[]} windVelocity  - 風速ベクトル [wx,wy,wz] m/s
   */
  constructor(initialSpeed, omega, direction, mass, windVelocity) {
    this.mass = mass;
    this.omega = omega;
    this.wind = windVelocity || [0, 0, 0];

    // 状態ベクトル (プレーン配列で Three.js に依存しない)
    this.position = [0, 1.5, 0];  // 目線高さ 1.5m からスタート
    this.velocity = [
      direction[0] * initialSpeed,
      direction[1] * initialSpeed,
      direction[2] * initialSpeed,
    ];

    this.alive             = true;
    this.distanceTravelled = 0;   // 水平距離 m
    this.age               = 0;   // 経過秒数
  }

  // ----------------------------------------------------------
  //  メインの物理ステップ (1/60 s)
  //  戻り値: true = 生存中 / false = 消滅
  // ----------------------------------------------------------
  step() {
    if (!this.alive) return false;

    const C  = BB_CONST;
    const dt = C.dt;

    const Fg = this._gravityForce();
    const Fd = this._dragForce();
    const FL = this._magnusForce();

    const ax = (Fg[0] + Fd[0] + FL[0]) / this.mass;
    const ay = (Fg[1] + Fd[1] + FL[1]) / this.mass;
    const az = (Fg[2] + Fd[2] + FL[2]) / this.mass;

    this.velocity[0] += ax * dt;
    this.velocity[1] += ay * dt;
    this.velocity[2] += az * dt;

    this.position[0] += this.velocity[0] * dt;
    this.position[1] += this.velocity[1] * dt;
    this.position[2] += this.velocity[2] * dt;

    this.age += dt;
    this.distanceTravelled = Math.sqrt(
      this.position[0] * this.position[0] +
      this.position[2] * this.position[2]
    );

    // 終了判定: 地面接触 or 最大射程超過
    if (this.position[1] <= 0 || this.distanceTravelled > C.maxRange) {
      this.position[1] = Math.max(0, this.position[1]);
      this.alive = false;
      return false;
    }

    return true;
  }

  // ----------------------------------------------------------
  //  重力 F = [0, -m*g, 0]
  // ----------------------------------------------------------
  _gravityForce() {
    return [0, -this.mass * BB_CONST.gravity, 0];
  }

  // ----------------------------------------------------------
  //  空気抵抗 (風に対する相対速度ベース)
  //  F = -0.5 * ρ * |v_rel|² * Cd * A * normalize(v_rel)
  // ----------------------------------------------------------
  _dragForce() {
    const C = BB_CONST;
    const [vx, vy, vz] = this.velocity;
    const [wx, wy, wz] = this.wind;

    // 相対速度 = BB速度 - 風速度
    const rx = vx - wx;
    const ry = vy - wy;
    const rz = vz - wz;
    const rMag = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rMag < 1e-6) return [0, 0, 0];

    const FdMag = 0.5 * C.airDensity * rMag * rMag * C.Cd * C.crossArea;
    return [
      -FdMag * (rx / rMag),
      -FdMag * (ry / rMag),
      -FdMag * (rz / rMag),
    ];
  }

  // ----------------------------------------------------------
  //  マグナス力 (HopUp バックスピン → 揚力)
  //  回転軸: +X (バックスピン)
  //  揚力方向: cross([1,0,0], velocity) を正規化
  //  S  = ω * r / |v|
  //  CL = 2 * S  (簡略モデル)
  //  FL = 0.5 * ρ * |v|² * CL * A * liftDir
  // ----------------------------------------------------------
  _magnusForce() {
    const C = BB_CONST;
    if (this.omega === 0) return [0, 0, 0];

    const [vx, vy, vz] = this.velocity;
    const vMag = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (vMag < 1e-6) return [0, 0, 0];

    const S  = (this.omega * C.radius) / vMag;
    const CL = 2 * S;

    const FLMag = 0.5 * C.airDensity * vMag * vMag * CL * C.crossArea;

    // cross([1,0,0], [vx,vy,vz]) = [0*vz-0*vy, 0*vx-1*vz, 1*vy-0*vx]
    //                             = [0, -vz, vy]
    const lx = 0;
    const ly = -vz;
    const lz = vy;
    const lMag = Math.sqrt(ly * ly + lz * lz);
    if (lMag < 1e-6) return [0, 0, 0];

    return [
      FLMag * (lx / lMag),
      FLMag * (ly / lMag),
      FLMag * (lz / lMag),
    ];
  }
}
