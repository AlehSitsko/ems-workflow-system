import sqlite3

conn = sqlite3.connect("instance/database.db")
cur = conn.cursor()

# daily_crew_unit migrations
dcu_cols = [row[1] for row in cur.execute("PRAGMA table_info(daily_crew_unit)").fetchall()]
if "dispatch_status" not in dcu_cols:
    cur.execute("ALTER TABLE daily_crew_unit ADD COLUMN dispatch_status VARCHAR(50) DEFAULT 'available'")
    print("Added dispatch_status to daily_crew_unit")
else:
    print("dispatch_status already exists")

# call_assignment table
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

# call migrations — structured intake fields
call_cols = [row[1] for row in cur.execute("PRAGMA table_info(call)").fetchall()]
if "caller_phone" not in call_cols:
    cur.execute("ALTER TABLE call ADD COLUMN caller_phone VARCHAR(30)")
    print("Added caller_phone to call")
else:
    print("caller_phone already exists")

if "caller_note" not in call_cols:
    cur.execute("ALTER TABLE call ADD COLUMN caller_note TEXT")
    print("Added caller_note to call")
else:
    print("caller_note already exists")

conn.commit()
conn.close()
print("Migration complete")
