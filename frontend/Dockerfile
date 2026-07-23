# Development image for the Vite frontend.
#
# Development only: this runs the Vite dev server with hot reload. A production
# frontend image would build the static bundle and serve it from Nginx, which is
# a separate concern — see docs/PRODUCTION_READINESS.md.

FROM node:22-alpine

WORKDIR /app

# package.json + lockfile first, so editing source does not reinstall
# dependencies on every build.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host binds 0.0.0.0 so the port is reachable from the host; without it Vite
# listens on localhost inside the container and nothing can connect.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
