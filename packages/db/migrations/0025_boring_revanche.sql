ALTER TABLE "rollups" ADD COLUMN "dirty" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rollups" ADD COLUMN "dirty_at" timestamp with time zone;