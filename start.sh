#!/bin/bash
# ============================================================
#  Airsoft BB Drop Sim — ローカルサーバー起動スクリプト
#  使い方: chmod +x start.sh && ./start.sh
# ============================================================
cd "$(dirname "$0")"

PORT=8000

echo "======================================"
echo "  Airsoft BB Drop Sim"
echo "  http://localhost:$PORT"
echo "  終了: Ctrl+C"
echo "======================================"

# ブラウザを自動で開く (環境依存)
if command -v xdg-open &>/dev/null; then
  sleep 0.5 && xdg-open "http://localhost:$PORT" &
elif command -v open &>/dev/null; then
  sleep 0.5 && open "http://localhost:$PORT" &
fi

# Python 3 を優先、なければ Python 2
if command -v python3 &>/dev/null; then
  python3 -m http.server $PORT
elif command -v python &>/dev/null; then
  python -m SimpleHTTPServer $PORT
else
  echo "エラー: Python が見つかりません。"
  echo "以下のいずれかをインストールしてください:"
  echo "  sudo apt install python3"
  exit 1
fi
