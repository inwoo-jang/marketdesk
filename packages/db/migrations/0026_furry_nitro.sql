ALTER TABLE "usage_daily" ADD COLUMN "input_tokens" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD COLUMN "output_tokens" bigint DEFAULT 0 NOT NULL;