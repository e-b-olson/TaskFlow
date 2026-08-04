#!/usr/bin/env bash
#
# Backup the PostgreSQL database from the Docker container.
# Dumps to scripts/backups/<timestamp>.sql.gz
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backups"

# Load env vars from .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-todo_user}"
POSTGRES_DB="${POSTGRES_DB:-todo_db}"
CONTAINER_NAME="${DB_CONTAINER:-$(docker compose -f "$PROJECT_DIR/docker-compose.yml" ps -q db)}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate filename with timestamp
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/${TIMESTAMP}.sql.gz"

echo "Backing up database '$POSTGRES_DB'..."
docker exec "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

echo "Backup saved to: $BACKUP_FILE"
echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"
