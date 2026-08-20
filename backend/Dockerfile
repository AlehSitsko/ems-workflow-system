# Development image for the Flask backend.
#
# Development only. It runs the Flask development server, keeps the source
# bind-mounted for reload, and makes no attempt at the things a production image
# would need (Gunicorn, a non-root user, a build/runtime split, pinned base
# digests) — see docs/PRODUCTION_READINESS.md.

FROM python:3.14-slim

# Faster, quieter installs; unbuffered output so logs appear as they happen
# rather than when the buffer fills.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Requirements are copied on their own so that editing application code does not
# invalidate the dependency layer.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# The instance folder holds the SQLite file. It is a named volume in compose, so
# the database survives a rebuild.
RUN mkdir -p /app/instance

EXPOSE 5050

# Migrations first, then serve: a fresh volume gets a schema without a manual
# step, and an existing one is upgraded in place. Demo data is never seeded
# automatically — `flask --app app seed-demo` stays an explicit choice.
CMD ["sh", "-c", "flask --app app db upgrade && python app.py"]
