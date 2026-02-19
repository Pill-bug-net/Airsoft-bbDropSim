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
//  銃機種プリセット (実在機種を参考にしたスペック)
//  barrelMm    : インナーバレル長さ
//  boreMm      : ボア内径 (実測値の代表値)
//  baseVelocity: 0.20g BB での代表初速 m/s (0.98J 以下)
// ============================================================
const GUN_PRESETS = {
  custom:    { name: 'カスタム',              barrelMm: 300, boreMm: 6.08, baseVelocity: 90 },
  tm_m4a1:   { name: 'Tokyo Marui M4A1',     barrelMm: 509, boreMm: 6.08, baseVelocity: 88 },
  tm_akm:    { name: 'Tokyo Marui AKM',      barrelMm: 455, boreMm: 6.08, baseVelocity: 87 },
  gg_cm16:   { name: 'G&G CM16 Raider',      barrelMm: 363, boreMm: 6.03, baseVelocity: 90 },
  ca_m15a4:  { name: 'Classic Army M15A4',   barrelMm: 509, boreMm: 6.04, baseVelocity: 91 },
  tm_mp5a5:  { name: 'Tokyo Marui MP5A5',    barrelMm: 229, boreMm: 6.08, baseVelocity: 85 },
  kwa_mp7:   { name: 'KWA MP7A1',            barrelMm: 180, boreMm: 6.05, baseVelocity: 78 },
  well_mb01: { name: 'WELL MB01 スナイパー',  barrelMm: 650, boreMm: 6.01, baseVelocity: 95 },
};

// ============================================================
//  ボア径別仕様
//    velBonus   : ボア速度補正率 (タイトボアは気密↑→初速わずかに向上)
//    scatter    : 角度散布 σ (度) — BB径ばらつき・バレル直進度誤差
//    velScatter : 速度散布 σ (率) — 気密一貫性・BB重量誤差
// ============================================================
const BORE_SPECS = {
  6.01: { label: 'タイトボア',  velBonus: 0.025, scatter: 0.04, velScatter: 0.004 },
  6.03: { label: 'タイト',      velBonus: 0.015, scatter: 0.07, velScatter: 0.007 },
  6.04: { label: '精密',        velBonus: 0.008, scatter: 0.09, velScatter: 0.009 },
  6.05: { label: '標準+',       velBonus: 0.003, scatter: 0.11, velScatter: 0.011 },
  6.08: { label: 'ノーマルボア', velBonus: 0.000, scatter: 0.15, velScatter: 0.015 },
};

// boreMm に最も近いキーの仕様を返す
function getBoreSpec(boreMm) {
  const keys = Object.keys(BORE_SPECS).map(Number);
  const closest = keys.reduce((a, b) =>
    Math.abs(a - boreMm) <= Math.abs(b - boreMm) ? a : b
  );
  return BORE_SPECS[closest];
}

// ボア種別の速度ボーナス係数
function boreVelocityBonus(boreMm) {
  return getBoreSpec(boreMm).velBonus;
}

// ============================================================
//  製造誤差 + BB 個体差による 1 発ごとのスキャター
//
//  モデル化した誤差要因:
//    ・ボア内径公差 (±0.01mm) → BB ガタつき → 角度散布
//    ・バレル直進度誤差        → 角度散布 (短いほど大)
//    ・BB 重量ばらつき         → 速度散布
//    ・Hop-Up ゴム一貫性       → 散布 (ここではボア径で近似)
//
//  @param {number} boreMm    - ボア内径 mm
//  @param {number} barrelMm  - バレル長 mm
//  @returns {{ dPitch: rad, dYaw: rad, velFactor: number }}
// ============================================================
function shotScatter(boreMm, barrelMm) {
  const spec = getBoreSpec(boreMm);

  // バレルが短いほど散布増加 (基準 300mm)
  const barrelFactor = Math.sqrt(300 / Math.max(barrelMm, 50));
  const scatterRad   = spec.scatter * barrelFactor * Math.PI / 180;

  // Box-Muller 法でガウス乱数 2 個生成
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  const r  = Math.sqrt(-2 * Math.log(u1));
  const n1 = r * Math.cos(2 * Math.PI * u2);
  const n2 = r * Math.sin(2 * Math.PI * u2);

  return {
    dPitch:    n1 * scatterRad,                                          // rad
    dYaw:      n2 * scatterRad,                                          // rad
    velFactor: 1.0 + (Math.random() - 0.5) * 2 * spec.velScatter,       // 倍率
  };
}

// ============================================================
class BBPhysics {
  /**
   * @param {number}   initialSpeed  - 初速 m/s (バレル補正・法的クランプ済)
   * @param {number}   omega         - 角速度 rad/s (HopUp 強度)
   * @param {number[]} direction     - 発射方向の単位ベクトル [x,y,z]
   * @param {number}   mass          - BB質量 kg
   * @param {number[]} windVelocity  - 風速ベクトル [wx,wy,wz] m/s
   * @param {number}   spinTiltDeg   - HopUp スピン軸の傾き(度)
   *                                   0=純粋バックスピン(上方向揚力)
   *                                  +45=右傾き(左方向カーブ)
   *                                  -45=左傾き(右方向カーブ)
   */
  constructor(initialSpeed, omega, direction, mass, windVelocity, spinTiltDeg) {
    this.mass         = mass;
    this.omega        = omega;
    this.wind         = windVelocity || [0, 0, 0];
    this.spinTiltRad  = (spinTiltDeg || 0) * Math.PI / 180;

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
  //  マグナス力 (HopUp スピン → 揚力)
  //
  //  スピン軸: spinAxis = [cos(α), sin(α), 0]
  //    α=0   → [1,0,0] = 純粋バックスピン → 上方向揚力
  //    α>0   → 軸が上方向へ傾く → 揚力が左方向へシフト (右ホップ)
  //    α<0   → 軸が下方向へ傾く → 揚力が右方向へシフト (左ホップ)
  //
  //  揚力方向 = cross(spinAxis, velocity)
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

    const S      = (this.omega * C.radius) / vMag;
    const CL     = 2 * S;
    const FLMag  = 0.5 * C.airDensity * vMag * vMag * CL * C.crossArea;

    // スピン軸 (傾き角 α を考慮した汎用計算)
    const sx = Math.cos(this.spinTiltRad);  // cos(α)
    const sy = Math.sin(this.spinTiltRad);  // sin(α)
    // sz = 0 (スピン軸は XY 平面内で回転)

    // cross([sx,sy,0], [vx,vy,vz])
    //   lx = sy*vz - 0*vy = sy*vz
    //   ly = 0*vx  - sx*vz = -sx*vz
    //   lz = sx*vy - sy*vx
    const lx = sy * vz;
    const ly = -sx * vz;
    const lz = sx * vy - sy * vx;
    const lMag = Math.sqrt(lx * lx + ly * ly + lz * lz);
    if (lMag < 1e-6) return [0, 0, 0];

    return [
      FLMag * (lx / lMag),
      FLMag * (ly / lMag),
      FLMag * (lz / lMag),
    ];
  }
}
