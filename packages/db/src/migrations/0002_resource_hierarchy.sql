-- Add parentId and disabled to resources table
ALTER TABLE resources ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES resources(id);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient hierarchy queries
CREATE INDEX IF NOT EXISTS idx_resources_parent_id ON resources(parent_id);
CREATE INDEX IF NOT EXISTS idx_resources_tenant_disabled ON resources(tenant_id, disabled);

