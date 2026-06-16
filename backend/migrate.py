import sqlite3

conn = sqlite3.connect("instance/database.db")
cur = conn.cursor()

cols = [row[1] for row in cur.execute("PRAGMA table_info(daily_crew_unit)").fetchall()]
if "dispatch_status" not in cols:
    cur.execute("ALTER TABLE daily_crew_unit ADD COLUMN dispatch_status VARCHAR(50) DEFAULT 'available'")
    print("Added dispatch_status column to daily_crew_unit")
else:
    print("dispatch_status already exists")

cur.execute("""
CREATE TABLE IF NOT EXISTS call_assignment (
    id INTEGER PRIMARY KEY,
    call_id INTEGER NOT NULL REFERENCES call(id),
    unit_id INTEGER NOT NULL REFERENCES daily_crew_unit(id),
    assigned_at VARCHAR(50),
    assigned_by VARCHAR(150),
    is_active BOOLEAN DEFAULT 1
)
""")
print("call_assignment table ready")

conn.commit()
conn.close()
print("Migration complete")
