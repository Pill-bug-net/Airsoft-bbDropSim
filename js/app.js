'use strict';

// ============================================================
//  App — メインアプリケーション
//  ・requestAnimationFrame ループ
//  ・左クリック → 発射、右クリック → スコープ切替
//  ・BB 生存管理、2D グラフ更新
// ============================================================

class App {
  constructor() {
    this.activeBBs     = [];   // BBProjectile[]
    this._lastRange    = null; // 直近の着弾距離
    this._animFrameId  = null;
  }

  // ----------------------------------------------------------
  //  起動
  // ----------------------------------------------------------
  init() {
    sceneManager.init();
    uiManager.init(sceneManager);

    // 右クリックのブラウザメニューを抑制
    document.addEventListener('contextmenu', e => e.preventDefault());

    // マウスイベント
    document.addEventListener('mousedown', e => {
      // コントロールパネル上のクリックは無視
      if (e.target.closest('#property-panel') ||
          e.target.closest('#hud')) return;

      if (e.button === 0) this._shootBB();
      if (e.button === 2) uiManager.toggleScope();
    });

    // アニメーションループ開始
    this._animate();
  }

  // ----------------------------------------------------------
  //  BB 弾を発射
  // ----------------------------------------------------------
  _shootBB() {
    const bb = new BBProjectile(
      sceneManager.scene,
      uiManager.muzzleVelocity,
      uiManager.omega,
      sceneManager.camera,
      uiManager.mass,
      uiManager.getWindVelocity()
    );
    this.activeBBs.push(bb);
  }

  // ----------------------------------------------------------
  //  メインループ
  // ----------------------------------------------------------
  _animate() {
    this._animFrameId = requestAnimationFrame(() => this._animate());

    const toRemove = [];

    // 全 BB を 1 ティック進める
    for (const bb of this.activeBBs) {
      const alive = bb.update();
      if (!alive) {
        toRemove.push(bb);
        this._lastRange = bb.range;
        // 着弾軌跡を 2D グラフへ渡す
        uiManager.trajectoryGraph.addShot(bb.positionLog, bb.color);
      }
    }

    // 死んだ BB を除去
    for (const bb of toRemove) {
      bb.dispose();
      this.activeBBs.splice(this.activeBBs.indexOf(bb), 1);
    }

    // 2D 弾道グラフ更新 (毎フレーム)
    uiManager.trajectoryGraph.draw(this.activeBBs);

    // 3D シーン描画
    sceneManager.renderFrame();

    // HUD 更新
    uiManager.updateHUD(this._lastRange);
    // 表示後は null に戻す (毎フレーム射程を更新し続けない)
    this._lastRange = null;
  }
}

// ── エントリーポイント ──
const app = new App();
window.addEventListener('DOMContentLoaded', () => app.init());
