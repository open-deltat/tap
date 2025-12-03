ALTER TABLE "resources" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "resources" ADD COLUMN "disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" DROP COLUMN IF EXISTS "capacity";