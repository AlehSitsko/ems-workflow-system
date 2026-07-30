"""WSGI entrypoint for a production server (Gunicorn/uWSGI).

The development server calls `create_app()` itself in `app.py`'s `__main__`
block; a WSGI server needs a module-level callable to import, which is this.

    gunicorn wsgi:app
"""

from app import create_app

app = create_app()
