#!/bin/bash
# ============================================================
#  Airsoft BB Drop Sim — AWS S3 + CloudFront デプロイスクリプト
#
#  必要なもの:
#    - AWS CLI v2 (設定済み: aws configure)
#    - 適切な IAM 権限 (S3, CloudFront)
#
#  使い方:
#    chmod +x deploy/s3-deploy.sh
#    ./deploy/s3-deploy.sh
#
#  または既存バケットへ更新のみ:
#    ./deploy/s3-deploy.sh --update
# ============================================================

set -euo pipefail

# ── 設定 ──────────────────────────────────────────────────────
BUCKET_NAME="${BUCKET_NAME:-airsoft-bb-drop-sim}"
REGION="${REGION:-ap-northeast-1}"   # 東京リージョン
PROFILE="${AWS_PROFILE:-default}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPDATE_ONLY="${1:-}"

echo "============================================"
echo " Airsoft BB Drop Sim — AWS デプロイ"
echo " Bucket : $BUCKET_NAME"
echo " Region : $REGION"
echo " Profile: $PROFILE"
echo "============================================"

# ── 初回セットアップ (--update 以外) ──────────────────────────
if [[ "$UPDATE_ONLY" != "--update" ]]; then
  echo ""
  echo "[1/5] S3 バケット作成..."
  if aws s3 ls "s3://$BUCKET_NAME" --profile "$PROFILE" 2>/dev/null; then
    echo "  バケット '$BUCKET_NAME' は既に存在します。"
  else
    if [[ "$REGION" == "us-east-1" ]]; then
      aws s3api create-bucket \
        --bucket "$BUCKET_NAME" \
        --region "$REGION" \
        --profile "$PROFILE"
    else
      aws s3api create-bucket \
        --bucket "$BUCKET_NAME" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION" \
        --profile "$PROFILE"
    fi
    echo "  バケット作成完了"
  fi

  echo ""
  echo "[2/5] パブリックアクセスブロックを解除..."
  aws s3api put-public-access-block \
    --bucket "$BUCKET_NAME" \
    --public-access-block-configuration \
      BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false \
    --profile "$PROFILE"

  echo ""
  echo "[3/5] バケットポリシー設定 (パブリック読み取り)..."
  POLICY=$(cat <<POLICY_EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
    }
  ]
}
POLICY_EOF
)
  aws s3api put-bucket-policy \
    --bucket "$BUCKET_NAME" \
    --policy "$POLICY" \
    --profile "$PROFILE"

  echo ""
  echo "[4/5] 静的ウェブサイトホスティング設定..."
  aws s3 website "s3://$BUCKET_NAME" \
    --index-document index.html \
    --error-document index.html \
    --profile "$PROFILE"
fi

# ── ファイルアップロード ──────────────────────────────────────
echo ""
echo "[5/5] ファイルをアップロード中..."
aws s3 sync "$REPO_ROOT" "s3://$BUCKET_NAME" \
  --profile "$PROFILE" \
  --exclude ".git/*" \
  --exclude "deploy/*" \
  --exclude "*.md" \
  --exclude "*.sh" \
  --exclude "node_modules/*" \
  --exclude ".DS_Store" \
  --delete \
  --cache-control "max-age=3600" \
  --content-type-mapping '{"html":"text/html","css":"text/css","js":"application/javascript"}'

echo ""
echo "============================================"
echo " デプロイ完了!"
echo ""
echo " S3 ウェブサイト URL:"
echo " http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"
echo ""
echo " ※ HTTPS + CDN を使うには CloudFront を設定してください。"
echo "   ./deploy/cloudfront-setup.sh を実行してください。"
echo "============================================"
