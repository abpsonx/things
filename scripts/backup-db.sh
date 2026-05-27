#!/bin/sh
# Daily Postgres backup for Things (dothings.id).
#
# Dumps the running `db` container using its OWN credentials (so it works
# whether the DB is named thingsapp or cicleapp), gzips it into ~/app/backups,
# and keeps the last RETENTION_DAYS days. Designed to run from cron as root
# (/etc/cron.daily) or manually via sudo.
#
#   sudo sh /home/things/app/scripts/backup-db.sh
#
# NOTE: backups live on the same disk as the server. For real safety, also
# copy them off-box (e.g. rclone to Google Drive) — see the README note.
set -eu

APP_DIR="${APP_DIR:-/home/things/app}"
BACKUP_DIR="$APP_DIR/backups"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

STAMP="$(date +%Y%m%d-%H%M)"
OUT="$BACKUP_DIR/things-$STAMP.sql.gz"
TMP="$OUT.partial"

# Find the running Postgres container by name (works even if it was recreated
# with a hash-prefixed name, e.g. <hash>_things-db). `docker compose exec db`
# can miss it when the container name drifts from the compose service.
DB_CONTAINER="$(docker ps --filter 'name=things-db' --format '{{.Names}}' | head -n1)"
if [ -z "$DB_CONTAINER" ]; then
  echo "[backup] FAILED: Postgres container (name~things-db) tidak ditemukan/berjalan" >&2
  exit 1
fi

# Dump via the container's own env so user/db are always correct.
docker exec -i "$DB_CONTAINER" sh -c 'pg_dump --no-owner --clean -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$TMP"

# Validate: a real dump carries the pg_dump header. This catches the silent
# "empty 20-byte gzip" failure mode so we never publish a useless backup.
if ! gzip -dc "$TMP" 2>/dev/null | head -c 500 | grep -q "PostgreSQL database dump"; then
  rm -f "$TMP"
  echo "[backup] FAILED: dump kosong/tidak valid (DB container: $DB_CONTAINER)" >&2
  exit 1
fi

mv "$TMP" "$OUT"
echo "[backup] wrote $OUT ($(du -h "$OUT" | cut -f1)) from $DB_CONTAINER"

# Rotate local: drop dumps older than RETENTION_DAYS.
find "$BACKUP_DIR" -name 'things-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

# Offsite copy (optional): if RCLONE_REMOTE is set and rclone is installed,
# upload the new dump and prune old ones on the remote too. Survives total
# server loss. Example: RCLONE_REMOTE="gdrive:things-backups"
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  if rclone copy "$OUT" "$RCLONE_REMOTE" >/dev/null 2>&1; then
    echo "[backup] uploaded to $RCLONE_REMOTE"
    rclone delete "$RCLONE_REMOTE" --min-age "${RETENTION_DAYS}d" \
      --include 'things-*.sql.gz' >/dev/null 2>&1 || true
  else
    echo "[backup] WARNING: rclone upload to $RCLONE_REMOTE failed" >&2
  fi
fi
