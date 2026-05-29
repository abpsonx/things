#!/bin/bash
# Things deploy — handle pull + build + recreate dengan urutan yang aman.
#
# Latar belakang: `docker compose up -d --build backend` kadang bikin
# container db/redis ke-rename hash-prefix (mis. `fe28f11_things-db`)
# karena compose detect "config drift" mid-build. Akibatnya backend
# crash-loop dengan "Temporary failure in name resolution" — DNS
# alias `things-db` hilang.
#
# Fix: selalu `down --remove-orphans` sebelum `up -d`. Volume named
# (`app_postgres_data`, `app_redis_data`) tetap aman karena terpisah
# dari container. Trade-off: ~10 detik downtime per deploy (vs crash
# loop yang butuh recovery manual 5+ menit).
#
# Usage:
#   ./deploy.sh                    # rebuild semua service + restart full
#   ./deploy.sh backend            # rebuild backend saja + restart full
#   ./deploy.sh backend frontend   # rebuild dua-duanya + restart full
#
# Apapun argumen build, `down` + `up -d` selalu menyentuh semua service
# (itu yang bikin urutan ini aman dari hash-prefix bug).

set -e

cd "$(dirname "$0")"

# Tolak deploy kalau ada perubahan uncommitted — biasanya itu artinya
# lupa commit / dibuat di branch lain. Lebih aman fail dulu.
if [[ -n $(git status --porcelain) ]]; then
  echo "✋ Ada perubahan uncommitted di repo. Stash / commit dulu sebelum deploy."
  git status --short
  exit 1
fi

echo "▶ git pull..."
git pull

# Default: build semua service yang punya Dockerfile (backend + frontend).
BUILD_TARGETS=("$@")
if [ ${#BUILD_TARGETS[@]} -eq 0 ]; then
  BUILD_TARGETS=(backend frontend)
fi

echo "▶ Build image: ${BUILD_TARGETS[*]}..."
sudo docker compose build "${BUILD_TARGETS[@]}"

echo "▶ Stop semua container + remove orphans (VOLUME AMAN, TANPA -v)..."
sudo docker compose down --remove-orphans

echo "▶ Start ulang semua service..."
sudo docker compose up -d

echo "▶ Tunggu 10 detik biar healthcheck warmup..."
sleep 10

echo
echo "════════ Status ════════"
sudo docker compose ps

echo
echo "════════ Backend log (last 20) ════════"
sudo docker logs things-backend --tail 20 2>&1 | sed 's/^/  /'

echo
echo "✅ Deploy selesai. Refresh browser kalau perlu."
