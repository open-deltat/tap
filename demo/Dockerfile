# Build and run the deltat examples app (a bun-workspace member) with its custom Next.js +
# WebSocket server. The build CONTEXT is the repo ROOT, because the workspace lockfile and the
# workspace deps (@open-tap/client, @open-tap/shared in packages/*) live there. The compose uses
# { context: ., dockerfile: demo/Dockerfile } so these COPY paths resolve from the root.
FROM oven/bun:1

WORKDIR /app

# Copy the whole workspace so `workspace:*` deps resolve, then install against the root lockfile.
# (.dockerignore keeps node_modules/.next/.git/data out of the build context.)
COPY . .
RUN bun install --frozen-lockfile

# Production Next build for the demo (output lands in demo/.next).
RUN cd demo && bun run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
WORKDIR /app/demo
# server.ts serves Next in production mode (NODE_ENV=production) plus the /ws proxy to deltat.
CMD ["bun", "run", "server.ts"]
