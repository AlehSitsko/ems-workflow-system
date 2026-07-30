#!/usr/bin/env sh
# Restore the production Postgres database from a dump made by backup-db.sh.
#
#   ./scripts/restore-db.sh backups/ems-ems-20260101-120000.sql.gz
#
# The dump was taken with --clean --if-exists, so it drops and recreates each
# object — restoring onto the live database REPLACES its contents. Like the backup
# script it talks to the db container directly and needs no app secrets.
set -eu

FILE="${1:-}"
if [ -z "${FILE}" ] || [ ! -f "${FILE}" ]; then
    echo "usage: $0 <dump.sql.gz>" >&2
    exit 1
fi

PROJECT="${COMPOSE_PROJECT:-ems-prod}"
DB_USER="${POSTGRES_USER:-ems}"
DB_NAME="${POSTGRES_DB:-ems}"

CID=$(docker ps -q \
    -f "label=com.docker.compose.project=${PROJECT}" \
    -f "label=com.docker.compose.service=db")
if [ -z "${CID}" ]; then
    echo "restore-db: no running 'db' container for project '${PROJECT}'." >&2
    exit 1
fi

echo "restore-db: restoring ${FILE} into ${DB_NAME} (this replaces current data)..."
gunzip -c "${FILE}" | docker exec -i "${CID}" psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" >/dev/null
echo "restore-db: done."
