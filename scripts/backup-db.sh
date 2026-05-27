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

# Dump via the container's own env so user/db are always correct.
docker compose exec -T db sh -c 'pg_dump --no-owner --clean -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$TMP"

# Only publish the file if the dump produced something non-trivial.
if [ -s "$TMP" ]; then
  mv "$TMP" "$OUT"
  echo "[backup] wrote $OUT ($(du -h "$OUT" | cut -f1))"
else
  rm -f "$TMP"
  echo "[backup] FAILED: empty dump" >&2
  exit 1
fi

# Rotate: drop dumps older than RETENTION_DAYS.
find "$BACKUP_DIR" -name 'things-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
