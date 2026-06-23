ALTER TABLE "rollups" ALTER COLUMN "lens_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rollups" ADD COLUMN "status" "job_status" DEFAULT 'pending' NOT NULL;