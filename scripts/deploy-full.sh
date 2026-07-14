#!/usr/bin/env bash
# 一鍵跑起 docker-compose.full.yml(palworld 伺服器 + dashboard)。
# 處理兩階段開機:第一次開機讓官方 image 用環境變數生成真正的
# PalWorldSettings.ini,健康檢查過了之後才鎖住 ini,只在需要鎖的時候重建一次。
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.full.yml"
INI_PATH="data/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini"
HEALTH_TIMEOUT=1800   # 秒。第一次開機要下載遊戲主程式,給足時間
MIN_INI_BYTES=100

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已從 .env.example 建立 .env,記得去改密碼欄位(PALWORLD_SERVER_PASSWORD 等)再重跑一次。"
  exit 1
fi

$COMPOSE up -d --build

echo "等待 palworld 開機並通過健康檢查(第一次會下載遊戲主程式,可能要幾分鐘到十幾分鐘)..."
elapsed=0
while true; do
  health="$(docker inspect palworld-server --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)"
  status="$(docker inspect palworld-server --format '{{.State.Status}}' 2>/dev/null || echo unknown)"

  if [ "$status" != "running" ]; then
    echo "palworld 容器不是 running 狀態(目前: $status),查看 log:"
    docker logs --tail 30 palworld-server 2>&1 || true
    exit 1
  fi

  if docker logs palworld-server 2>&1 | tail -5 | grep -q '^Killed$'; then
    echo "偵測到伺服器行程被系統砍掉(Killed),通常是記憶體不夠(Palworld 建議至少 8GB)。"
    echo "Mac/Windows 上如果用 colima,試試 colima start --cpu 4 --memory 8;Docker Desktop 則去設定調高記憶體。"
    exit 1
  fi

  [ "$health" = "healthy" ] && break

  if [ "$elapsed" -ge "$HEALTH_TIMEOUT" ]; then
    echo "等超過 ${HEALTH_TIMEOUT} 秒還沒 healthy,自己去看: docker logs -f palworld-server"
    exit 1
  fi

  sleep 15
  elapsed=$((elapsed + 15))
done

if [ ! -f "$INI_PATH" ] || [ "$(wc -c < "$INI_PATH")" -lt "$MIN_INI_BYTES" ]; then
  echo "palworld 顯示 healthy,但 $INI_PATH 看起來是空的,官方 image 可能還沒真正生成設定檔,稍等一下再重跑這個腳本。"
  exit 1
fi

echo "palworld 已 healthy,設定檔也已生成。"

if grep -q '^DISABLE_GENERATE_SETTINGS=false' .env; then
  echo "鎖定 ini,讓 dashboard 之後寫入的設定不會被環境變數蓋掉..."
  sed -i.bak 's/^DISABLE_GENERATE_SETTINGS=false/DISABLE_GENERATE_SETTINGS=true/' .env
  rm -f .env.bak
  $COMPOSE up -d --force-recreate palworld
  echo "已鎖定。"
else
  echo "ini 先前已經鎖定過,不需要重建。"
fi

echo ""
echo "完成。Dashboard: http://localhost:3000"
echo "登入時 Server IP 填 palworld,REST API Port 填 8212,Admin Password 用 .env 裡的 PALWORLD_ADMIN_PASSWORD。"
