#!/usr/bin/env sh
# Back up the production Postgres database to a timestamped, gzipped SQL dump.
#
# Talks to the running db container directly (found by its Compose labels), so it
# needs none of the app's secrets — only Docker. pg_dump runs inside the container
# over the local socket (trust auth), so no DB password is needed either.
#
#   ./scripts/backup-db.sh                 # → backups/ems-ems-YYYYmmdd-HHMMSS.sql.gz
#   BACKUP_DIR=/mnt/backups ./scripts/backup-db.sh
#
# Restore with scripts/restore-db.sh. Schedule from cron/systemd for real use.
set -eu

PROJECT="${COMPOSE_PROJECT:-ems-prod}"
DB_USER="${POSTGRES_USER:-ems}"
DB_NAME="${POSTGRES_DB:-ems}"
OUT_DIR="${BACKUP_DIR:-backups}"

CID=$(docker ps -q \
    -f "label=com.docker.compose.project=${PROJECT}" \
    -f "label=com.docker.compose.service=db")
if [ -z "${CID}" ]; then
    echo "backup-db: no running 'db' container for project '${PROJECT}'." >&2
    echo "  Start the stack first, or set COMPOSE_PROJECT." >&2
    exit 1
fi

mkdir -p "${OUT_DIR}"
STAMP=$(date +%Y%m%d-%H%M%S)
FILE="${OUT_DIR}/ems-${DB_NAME}-${STAMP}.sql.gz"

# --clean --if-exists makes the dump self-contained: restoring it drops existing
# objects first, so it lands cleanly on a non-empty database.
docker exec "${CID}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists \
    | gzip > "${FILE}"

echo "backup-db: wrote ${FILE} ($(wc -c < "${FILE}") bytes)"
