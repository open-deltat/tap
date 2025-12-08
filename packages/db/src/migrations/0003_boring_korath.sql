ALTER TABLE "offers" ADD COLUMN "buffer_before_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "buffer_after_minutes" integer DEFAULT 0 NOT NULL;