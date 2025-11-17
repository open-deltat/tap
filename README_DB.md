# Database Setup

## Quick Start with Docker

```bash
# Start Postgres (or tests will auto-start it)
docker compose up -d

# Run migrations
cd packages/db
DATABASE_URL="postgresql://tap:tap@localhost:5432/tap" bun run migrate

# Run tests (automatically starts DB if needed)
bun test
# Or from root:
bun test packages/db
```

**Note**: Tests automatically start the database if it's not running. The `ensure-db.sh` script checks Docker and starts the Postgres container before running tests.

## Manual Setup

If you have Postgres installed locally:

```bash
# Create database
createdb tap

# Set environment variable
export DATABASE_URL="postgresql://localhost:5432/tap"

# Run migrations
cd packages/db
bun run migrate
```

## Docker Compose Details

- **Image**: `postgres:16-alpine`
- **Port**: `5432`
- **User**: `tap`
- **Password**: `tap`
- **Database**: `tap`
- **Volume**: `postgres_data` (persists data)

## Environment Variables

Set `DATABASE_URL` or `POSTGRES_URL`:

```bash
export DATABASE_URL="postgresql://tap:tap@localhost:5432/tap"
```

Or create a `.env` file:

```
DATABASE_URL=postgresql://tap:tap@localhost:5432/tap
```

