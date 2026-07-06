CREATE TABLE "notepads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_key" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notepads_scope_uq" UNIQUE("user_id","scope_type","scope_key")
);
--> statement-breakpoint
ALTER TABLE "notepads" ADD CONSTRAINT "notepads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;