CREATE TABLE "public_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"industry_id" uuid,
	"doc_type" "doc_type",
	"pub_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_contents_source_url_unique" UNIQUE("source_url")
);
--> statement-breakpoint
CREATE TABLE "user_public_bookmark" (
	"user_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_public_bookmark_user_id_content_id_pk" PRIMARY KEY("user_id","content_id")
);
--> statement-breakpoint
CREATE TABLE "user_public_hidden" (
	"user_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	CONSTRAINT "user_public_hidden_user_id_content_id_pk" PRIMARY KEY("user_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "public_contents" ADD CONSTRAINT "public_contents_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_public_bookmark" ADD CONSTRAINT "user_public_bookmark_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_public_bookmark" ADD CONSTRAINT "user_public_bookmark_content_id_public_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."public_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_public_hidden" ADD CONSTRAINT "user_public_hidden_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_public_hidden" ADD CONSTRAINT "user_public_hidden_content_id_public_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."public_contents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "public_contents_industry_idx" ON "public_contents" USING btree ("industry_id","pub_date");