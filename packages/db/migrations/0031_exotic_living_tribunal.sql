ALTER TABLE "paper_positions" ADD COLUMN "side" text DEFAULT 'buy' NOT NULL;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD COLUMN "reason" text;