CREATE TABLE "company_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"norm_name" text NOT NULL,
	"name" text NOT NULL,
	"group_name" text NOT NULL,
	"source" text DEFAULT 'kftc' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_groups_norm_name_unique" UNIQUE("norm_name")
);
--> statement-breakpoint
CREATE INDEX "company_groups_group_idx" ON "company_groups" USING btree ("group_name");