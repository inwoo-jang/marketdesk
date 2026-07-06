ALTER TABLE "reports" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "reports_user_hash_idx" ON "reports" USING btree ("user_id","content_hash");