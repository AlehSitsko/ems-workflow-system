"""
Copy the local SQLite database into backend/backups/ with a timestamped filename.
Run before applying migrations or any risky bulk change:

    python scripts/backup_db.py
    flask --app app db upgrade
"""
import os
import shutil
import sys
from datetime import datetime

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BACKEND_DIR, "instance", "database.db")
BACKUP_DIR = os.path.join(BACKEND_DIR, "backups")


def backup_db():
    if not os.path.exists(DB_PATH):
        print(f"No database found at {DB_PATH} — nothing to back up.")
        sys.exit(1)

    os.makedirs(BACKUP_DIR, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_path = os.path.join(BACKUP_DIR, f"database_{timestamp}.db")

    shutil.copy2(DB_PATH, backup_path)
    print(f"Backed up database to: {backup_path}")
    return backup_path


if __name__ == "__main__":
    backup_db()
