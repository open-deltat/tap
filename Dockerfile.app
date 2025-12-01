# Use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Copy root configuration files
COPY package.json bun.lock ./
COPY turbo.json tsconfig.json ./

# Copy package.json files for all relevant workspaces
COPY packages/app/package.json ./packages/app/
COPY packages/client/package.json ./packages/client/
COPY packages/core/package.json ./packages/core/
COPY packages/protocol/package.json ./packages/protocol/

# Install dependencies
RUN bun install

# Copy source code
COPY packages/app ./packages/app
COPY packages/client ./packages/client
COPY packages/core ./packages/core
COPY packages/protocol ./packages/protocol

# Build the app
WORKDIR /usr/src/app/packages/app
RUN bun run build

EXPOSE 3001
CMD ["bun", "run", "start", "-p", "3001"]

