#!/bin/bash
# deploy_dm_ws.sh
# Deploy native WebSocket DM feature (mengganti Socket.IO pada DM private chat)
# Jalankan dari root project di VPS: bash deploy_dm_ws.sh

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 Deploy: Native WebSocket DM Chat"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Copy file ke dalam container backend ──────────────────────────────────
echo ""
echo "▶ [1/5] Update backend files..."

# dm_ws.py — WebSocket manager baru
sudo docker exec things-backend bash -c "mkdir -p app/sockets"
cat backend/app/sockets/dm_ws.py | sudo docker exec -i things-backend bash -c "cat > app/sockets/dm_ws.py"

# dm.py — endpoint + broadcast via native WS
cat backend/app/api/dm.py | sudo docker exec -i things-backend bash -c "cat > app/api/dm.py"

# security.py — tambah verify_token
cat backend/app/core/security.py | sudo docker exec -i things-backend bash -c "cat > app/core/security.py"

echo "   ✅ Backend files updated"

# ── 2. Install websockets package ────────────────────────────────────────────
echo ""
echo "▶ [2/5] Install websockets package..."
sudo docker exec things-backend pip install websockets==13.1 --quiet
echo "   ✅ websockets installed"

# ── 3. Restart backend ───────────────────────────────────────────────────────
echo ""
echo "▶ [3/5] Restart backend..."
sudo docker compose restart backend
echo "   Waiting 5s for backend to start..."
sleep 5
echo "   ✅ Backend restarted"

# ── 4. Rebuild & restart frontend ────────────────────────────────────────────
echo ""
echo "▶ [4/5] Rebuild frontend..."
sudo docker compose build --no-cache frontend
sudo docker compose up -d frontend
echo "   Waiting 10s for frontend to start..."
sleep 10
echo "   ✅ Frontend rebuilt and started"

# ── 5. Reload nginx (update nginx config) ────────────────────────────────────
echo ""
echo "▶ [5/5] Reload nginx config..."
sudo docker exec things-nginx nginx -t && sudo docker exec things-nginx nginx -s reload
echo "   ✅ Nginx reloaded"

# ── Health check ─────────────────────────────────────────────────────────────
echo ""
echo "▶ Health check..."
sleep 2
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://dothings.id/api/health)
if [ "$STATUS" = "200" ]; then
  echo "   ✅ API healthy (HTTP $STATUS)"
else
  echo "   ⚠️  API returned HTTP $STATUS — cek logs: docker compose logs backend --tail=50"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deploy selesai!"
echo ""
echo "  Test WebSocket DM:"
echo "  wss://dothings.id/api/dm/ws/<channel_id>?token=<jwt>"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
