# TAP App - Next.js Frontend (standalone build)

# Stage 1: Build
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Build arg for API URL (NEXT_PUBLIC_ vars must be set at build time)
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

# Copy source packages
COPY packages/app ./packages/app
COPY packages/client ./packages/client
COPY packages/core ./packages/core
COPY packages/protocol ./packages/protocol

# Create workspace package.json
RUN echo '{"name":"tap","private":true,"workspaces":["packages/app","packages/client","packages/core","packages/protocol"]}' > package.json

# Patch package.json files to use src instead of dist
RUN sed -i 's|"./dist/index.js"|"./src/index.ts"|g' packages/protocol/package.json
RUN sed -i 's|"./dist/index.js"|"./src/index.ts"|g' packages/core/package.json
RUN sed -i 's|"./dist/index.js"|"./src/index.ts"|g' packages/client/package.json
RUN sed -i 's|"./dist/openapi.js"|"./src/openapi.ts"|g' packages/protocol/package.json

# Install dependencies
RUN bun install

# Build Next.js app (standalone output)
WORKDIR /app/packages/app
RUN echo "Building with API URL: ${NEXT_PUBLIC_API_BASE_URL}"
RUN bun run build

# Stage 2: Production
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy standalone build (preserves monorepo structure)
COPY --from=builder /app/packages/app/.next/standalone ./
COPY --from=builder /app/packages/app/.next/static ./packages/app/.next/static
COPY --from=builder /app/packages/app/public ./packages/app/public

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "run", "packages/app/server.js"]

