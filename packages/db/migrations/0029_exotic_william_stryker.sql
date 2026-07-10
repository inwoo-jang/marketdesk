ALTER TABLE "paper_notes" DROP CONSTRAINT "paper_notes_position_id_paper_positions_id_fk";
--> statement-breakpoint
DROP INDEX "paper_notes_position_idx";--> statement-breakpoint
ALTER TABLE "paper_notes" ALTER COLUMN "position_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "paper_notes" ADD COLUMN "security_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "paper_notes" ADD CONSTRAINT "paper_notes_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_notes" ADD CONSTRAINT "paper_notes_position_id_paper_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."paper_positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paper_notes_security_idx" ON "paper_notes" USING btree ("security_id");