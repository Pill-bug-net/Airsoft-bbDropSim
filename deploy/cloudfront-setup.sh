#!/bin/bash
# ============================================================
#  Airsoft BB Drop Sim — CloudFront ディストリビューション設定
#
#  S3 の前に CloudFront を配置して HTTPS + CDN を実現する。
#  事前に s3-deploy.sh を実行しておくこと。
#
#  使い方:
#    chmod +x deploy/cloudfront-setup.sh
#    BUCKET_NAME=airsoft-bb-drop-sim ./deploy/cloudfront-setup.sh
# ============================================================

set -euo pipefail

BUCKET_NAME="${BUCKET_NAME:-airsoft-bb-drop-sim}"
REGION="${REGION:-ap-northeast-1}"
PROFILE="${AWS_PROFILE:-default}"

ORIGIN_DOMAIN="${BUCKET_NAME}.s3-website-${REGION}.amazonaws.com"
COMMENT="Airsoft BB Drop Sim"

echo "============================================"
echo " CloudFront ディストリビューション作成"
echo " Origin: $ORIGIN_DOMAIN"
echo "============================================"

DIST_CONFIG=$(cat <<CF_EOF
{
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "S3-Website",
      "DomainName": "${ORIGIN_DOMAIN}",
      "CustomOriginConfig": {
        "HTTPPort": 80,
        "HTTPSPort": 443,
        "OriginProtocolPolicy": "http-only"
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-Website",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true,
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"]
    }
  },
  "DefaultRootObject": "index.html",
  "CustomErrorResponses": {
    "Quantity": 1,
    "Items": [{
      "ErrorCode": 403,
      "ResponseCode": "200",
      "ResponsePagePath": "/index.html",
      "ErrorCachingMinTTL": 10
    }]
  },
  "Comment": "${COMMENT}",
  "Enabled": true,
  "PriceClass": "PriceClass_200",
  "HttpVersion": "http2and3"
}
CF_EOF
)

RESULT=$(aws cloudfront create-distribution \
  --distribution-config "$DIST_CONFIG" \
  --profile "$PROFILE" \
  --output json)

DIST_ID=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Distribution']['Id'])")
DOMAIN=$(echo "$RESULT"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Distribution']['DomainName'])")

echo ""
echo "============================================"
echo " CloudFront 作成完了!"
echo ""
echo " Distribution ID: $DIST_ID"
echo " ドメイン       : https://$DOMAIN"
echo ""
echo " ※ 反映まで 5〜15 分かかります。"
echo ""
echo " キャッシュ無効化 (更新時):"
echo "   aws cloudfront create-invalidation \\"
echo "     --distribution-id $DIST_ID \\"
echo "     --paths '/*'"
echo "============================================"
