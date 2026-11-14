#!/bin/sh
# Daily logical backups of both databases (keeps 7 days). Example crontab entry:
#   30 3 * * * /opt/qa-commerce-lab/deploy/vps/backup.sh >> /var/log/qacl-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
DEST="${BACKUP_DIR:-/var/backups/qacl}"
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)
for db in qacl_demo qacl_testing; do
  docker compose exec -T db pg_dump -U postgres -Fc "$db" > "$DEST/$db-$STAMP.dump"
done
find "$DEST" -name '*.dump' -mtime +7 -delete
echo "Backup completed: $STAMP"
