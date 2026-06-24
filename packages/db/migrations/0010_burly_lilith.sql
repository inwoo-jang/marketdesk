ALTER TABLE "reports" ADD COLUMN "company" text;--> statement-breakpoint
ALTER TABLE "rollups" ADD COLUMN "scope" text DEFAULT 'industry' NOT NULL;--> statement-breakpoint
ALTER TABLE "rollups" ADD COLUMN "company_name" text;