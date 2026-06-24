ALTER TABLE "reports" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "bookmarked" boolean DEFAULT false NOT NULL;