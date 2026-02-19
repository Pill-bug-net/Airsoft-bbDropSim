# AWS デプロイガイド — Airsoft BB Drop Sim

## 方法 1: AWS Amplify (最も簡単 ★推奨)

ビルド不要の静的サイトを GitHub から自動デプロイ。

### 手順

1. **GitHub にプッシュ済みであることを確認**
   ```bash
   git push origin claude/bb-ballistics-simulator-VtRqc
   ```

2. **AWS Amplify Console を開く**
   - [https://console.aws.amazon.com/amplify/](https://console.aws.amazon.com/amplify/)

3. **「New app」→「Host web app」を選択**

4. **「GitHub」を選択してリポジトリを連携**
   - リポジトリ: `Pill-bug-net/Airsoft-bbDropSim`
   - ブランチ: `claude/bb-ballistics-simulator-VtRqc`

5. **ビルド設定を確認** (amplify.yml が自動検出される)

6. **「Save and deploy」をクリック**

7. **数分後に URL が発行される**
   ```
   https://XXXXXXXXXX.amplifyapp.com
   ```

**特徴:**
- HTTPS 自動設定
- プッシュするたびに自動デプロイ
- 無料枠: 月 5GB データ転送、1000 ビルド分

---

## 方法 2: S3 + CloudFront (細かい制御が必要な場合)

### 前提条件

```bash
# AWS CLI v2 インストール確認
aws --version

# 認証情報設定
aws configure
# AWS Access Key ID: <your-key>
# AWS Secret Access Key: <your-secret>
# Default region: ap-northeast-1
```

### デプロイ手順

```bash
# リポジトリルートに移動
cd /path/to/Airsoft-bbDropSim

# スクリプトに実行権限を付与
chmod +x deploy/s3-deploy.sh
chmod +x deploy/cloudfront-setup.sh

# S3 バケット作成 + ファイルアップロード
BUCKET_NAME=airsoft-bb-drop-sim ./deploy/s3-deploy.sh

# (オプション) CloudFront で HTTPS を設定
BUCKET_NAME=airsoft-bb-drop-sim ./deploy/cloudfront-setup.sh
```

### ファイル更新時

```bash
# ファイルだけ再アップロード (バケット設定はそのまま)
BUCKET_NAME=airsoft-bb-drop-sim ./deploy/s3-deploy.sh --update

# CloudFront キャッシュを無効化
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths '/*'
```

### 料金目安 (東京リージョン)

| サービス | 無料枠 | 超過料金 |
|---------|--------|---------|
| S3 ストレージ | 5 GB/月 | $0.025/GB |
| S3 データ転送 | 1 GB/月 | $0.09/GB |
| CloudFront    | 1 TB/月 | $0.114/GB |

---

## 方法 3: ローカル確認 (開発・テスト用)

```bash
cd /path/to/Airsoft-bbDropSim

# Python (最もシンプル)
python3 -m http.server 8000

# Node.js の場合
npx serve .

# ブラウザで開く
open http://localhost:8000
```

---

## よくある質問

### Q: index.html をダブルクリックするだけで動く?
**A: はい、ほとんどの場合動きます。**
- Three.js は CDN から読み込むためインターネット接続が必要
- Chrome/Firefox/Edge で動作確認済み
- ローカルファイルに `fetch()` や `import` を使っていないため `file://` でも動作

### Q: HTTPS が必要ですか?
A: このアプリは WebGL を使うだけで、マイク・カメラ・位置情報などを使わないため HTTPS は必須ではありません。ただし本番公開には CloudFront や Amplify での HTTPS を推奨します。

### Q: カスタムドメインを設定したい
A: Amplify Console または CloudFront の「Alternate Domain Names」で独自ドメインを設定できます。Route 53 との連携も可能です。
