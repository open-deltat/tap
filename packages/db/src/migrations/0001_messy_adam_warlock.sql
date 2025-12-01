ALTER TABLE "offers" ADD COLUMN "type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "config" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "capacity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" DROP COLUMN IF EXISTS "days_of_week";--> statement-breakpoint
ALTER TABLE "offers" DROP COLUMN IF EXISTS "start_time";--> statement-breakpoint
ALTER TABLE "offers" DROP COLUMN IF EXISTS "end_time";