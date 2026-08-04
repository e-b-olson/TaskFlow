#!/usr/bin/env bash
#
# Restore the PostgreSQL database from a backup file.
#
# Usage:
#   ./db-restore.sh            Restore from the latest backup
#   ./db-restore.sh -f FILE    Restore from a specific file
#   ./db-restore.sh ~1         Restore from the latest backup (same as no args)
#   ./db-restore.sh ~2         Restore from the second-most-recent backup
#   ./db-restore.sh ~N         Restore from the Nth-most-recent backup
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

# Parse arguments
BACKUP_FILE=""

if [ $# -eq 0 ]; then
  # No args — use latest backup
  OFFSET=1
elif [ "$1" = "-f" ]; then
  # Specific file
  if [ -z "${2:-}" ]; then
    echo "Error: -f requires a filename argument"
    exit 1
  fi
  BACKUP_FILE="$2"
  if [ ! -f "$BACKUP_FILE" ]; then
    # Try relative to backup dir
    if [ -f "$BACKUP_DIR/$2" ]; then
      BACKUP_FILE="$BACKUP_DIR/$2"
    else
      echo "Error: File not found: $2"
      exit 1
    fi
  fi
elif [[ "$1" =~ ^~([0-9]+)$ ]]; then
  # Relative offset ~N
  OFFSET="${BASH_REMATCH[1]}"
else
  echo "Usage: $0 [-f FILE | ~N]"
  echo ""
  echo "  (no args)   Restore from the latest backup"
  echo "  -f FILE     Restore from a specific backup file"
  echo "  ~N          Restore from the Nth-most-recent backup (~1 = latest)"
  exit 1
fi

# Resolve backup file from offset if not set by -f
if [ -z "$BACKUP_FILE" ]; then
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "Error: No backups directory found at $BACKUP_DIR"
    exit 1
  fi

  # List backups sorted newest first
  mapfile -t BACKUPS < <(ls -1t "$BACKUP_DIR"/*.sql.gz 2>/dev/null)

  if [ ${#BACKUPS[@]} -eq 0 ]; then
    echo "Error: No backup files found in $BACKUP_DIR"
    exit 1
  fi

  INDEX=$((OFFSET - 1))
  if [ $INDEX -ge ${#BACKUPS[@]} ]; then
    echo "Error: Only ${#BACKUPS[@]} backup(s) available, cannot go back ~$OFFSET"
    echo "Available backups:"
    for i in "${!BACKUPS[@]}"; do
      echo "  ~$((i + 1))  $(basename "${BACKUPS[$i]}")"
    done
    exit 1
  fi

  BACKUP_FILE="${BACKUPS[$INDEX]}"
fi

echo "Restoring from: $BACKUP_FILE"
echo ""
echo "WARNING: This will DROP and recreate the '$POSTGRES_DB' database."
read -p "Continue? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Drop and recreate the database, then restore
echo "Dropping database '$POSTGRES_DB'..."
docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";"
docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"

echo "Restoring..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" --quiet

echo "Restore complete."
echo ""
echo "Restarting API to re-run migrations..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" restart api

echo "Done."
