# Build and run the deltat examples app (a bun-workspace member) with its custom Next.js +
# WebSocket server. The build CONTEXT is the repo ROOT, because the workspace lockfile and the
# workspace deps (@open-deltat/client, @open-deltat/shared in packages/*) live there. The compose uses
# { context: ., dockerfile: demo/Dockerfile } so these COPY paths resolve from the root.
FROM oven/bun:1

WORKDIR /app

# Copy the whole workspace so `workspace:*` deps resolve, then install.
# (.dockerignore keeps node_modules/.next/.git/data out of the build context.)
# Not --frozen-lockfile: the committed lock drifts across bun versions, and a deploy build
# should reconcile it rather than hard-fail (bun's own advice when the lock has changes).
COPY . .
RUN bun install

# @open-deltat/client publishes from dist/ (tsc output, gitignored), so it isn't in the clone and
# `bun install` only symlinks it. Build it before the app imports it. (@open-deltat/shared ships
# raw .ts and needs no build.)
RUN cd packages/client && bun run build

# Production Next build for the demo (output lands in demo/.next).
RUN cd demo && bun run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
WORKDIR /app/demo
# server.ts serves Next in production mode (NODE_ENV=production) plus the /ws proxy to deltat.
CMD ["bun", "run", "server.ts"]
