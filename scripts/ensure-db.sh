#!/bin/bash
set -e

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
fi

# Check if container exists and is running
if docker ps --format '{{.Names}}' | grep -q "^tap-postgres$"; then
  echo "✅ Postgres container is already running"
  exit 0
fi

# Check if container exists but is stopped
if docker ps -a --format '{{.Names}}' | grep -q "^tap-postgres$"; then
  echo "🔄 Starting existing Postgres container..."
  docker start tap-postgres
else
  echo "🚀 Starting new Postgres container..."
  docker compose up -d postgres
fi

# Wait for Postgres to be healthy
echo "⏳ Waiting for Postgres to be ready..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
  if docker exec tap-postgres pg_isready -U tap > /dev/null 2>&1; then
    # Give it extra time to be fully ready for connections
    sleep 4
    # Verify we can actually connect
    if docker exec tap-postgres psql -U tap -d tap -c "SELECT 1" > /dev/null 2>&1; then
      echo "✅ Postgres is ready!"
      exit 0
    fi
  fi
  attempt=$((attempt + 1))
  sleep 1
done

echo "❌ Postgres failed to start within ${max_attempts} seconds"
echo "💡 Try running: docker compose up -d"
exit 1

