# TAP App - Next.js Frontend

FROM oven/bun:1-alpine AS builder
WORKDIR /app

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

# Build Next.js app
WORKDIR /app/packages/app
RUN bun run build

# Runtime stage
FROM oven/bun:1-alpine
WORKDIR /app

# Copy built app and dependencies
COPY --from=builder /app/packages/app/.next ./.next
COPY --from=builder /app/packages/app/public ./public
COPY --from=builder /app/packages/app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Environment
ENV NODE_ENV=production

EXPOSE 3001
CMD ["bun", "run", "start", "-p", "3001"]

