# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the standalone desktop backend (onedir).

Bundles desktop_server.py (Flask + waitress) with the Alembic migrations and the
crypto/push stack, so the packaged app needs no system Python. Built from the
backend/ directory:  pyinstaller ems-backend.spec  ->  dist/ems-backend/.
"""

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

hiddenimports = []
hiddenimports += collect_submodules("sqlalchemy")
hiddenimports += collect_submodules("alembic")
hiddenimports += [
    "waitress", "flask_migrate", "flask_sqlalchemy", "flask_cors", "flask_limiter",
    # Modules imported lazily inside route/util functions — pinned so static
    # analysis can never drop them from the bundle.
    "push_utils", "settings_utils", "tenant", "demo_data", "notification_utils",
    "audit_utils", "metrics", "logging_config", "limiter", "storage",
    "pywebpush", "py_vapid", "http_ece", "cryptography",
    # Alembic's env.py imports these stdlib submodules lazily; PyInstaller's static
    # scan can miss them, which surfaced as "No module named 'logging.config'".
    "logging.config", "logging.handlers",
]

# The migration scripts must ship as data (flask db upgrade reads them at runtime).
datas = [("migrations", "migrations")]
datas += collect_data_files("alembic")   # script.py.mako etc. — harmless if unused

a = Analysis(
    ["desktop_server.py"],
    pathex=["."],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "pytest", "pip", "PyInstaller"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="ems-backend",
    console=True,            # spawned hidden by Electron (windowsHide); logs to stdout
    disable_windowed_traceback=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="ems-backend")
