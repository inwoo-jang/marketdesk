CREATE TYPE "public"."auth_provider" AS ENUM('google', 'kakao');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('draft', 'saved');--> statement-breakpoint
CREATE TYPE "public"."export_scope" AS ENUM('entry', 'rollup');--> statement-breakpoint
CREATE TYPE "public"."fact_type" AS ENUM('common', 'conflict');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."llm_provider" AS ENUM('gemini', 'claude', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."llm_tier" AS ENUM('default', 'byo', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('pending', 'parsing', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."period_type" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('broker', 'public');--> statement-breakpoint
CREATE TABLE "lenses" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_preset" boolean DEFAULT true NOT NULL,
	"sort" integer
);
--> statement-breakpoint
CREATE TABLE "user_lenses" (
	"user_id" uuid NOT NULL,
	"lens_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "user_lenses_user_id_lens_key_pk" PRIMARY KEY("user_id","lens_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cognito_sub" text NOT NULL,
	"email" text,
	"provider" "auth_provider",
	"display_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_cognito_sub_unique" UNIQUE("cognito_sub")
);
--> statement-breakpoint
CREATE TABLE "industries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon_color" text,
	"sort" integer,
	CONSTRAINT "industries_user_slug_uq" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "user_industries" (
	"user_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	"sort" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_industries_user_id_industry_id_pk" PRIMARY KEY("user_id","industry_id")
);
--> statement-breakpoint
CREATE TABLE "report_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"page_no" integer NOT NULL,
	"text" text,
	CONSTRAINT "report_pages_report_page_uq" UNIQUE("report_id","page_no")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"industry_id" uuid,
	"title" text,
	"broker" text,
	"analyst" text,
	"pub_date" date,
	"source_type" "source_type",
	"file_key" text,
	"file_size" integer,
	"page_count" integer,
	"parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"industry_id" uuid,
	"lens_key" text NOT NULL,
	"entry_date" date NOT NULL,
	"frame" jsonb,
	"status" "entry_status" DEFAULT 'draft' NOT NULL,
	"provider" "llm_provider",
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "entries_report_lens_uq" UNIQUE("report_id","lens_key")
);
--> statement-breakpoint
CREATE TABLE "entry_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"label" text,
	"value" text,
	"page_no" integer,
	"verified" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rollup_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rollup_id" uuid NOT NULL,
	"fact_type" "fact_type" NOT NULL,
	"content" text,
	"sort" integer
);
--> statement-breakpoint
CREATE TABLE "rollup_sources" (
	"rollup_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	CONSTRAINT "rollup_sources_rollup_id_entry_id_pk" PRIMARY KEY("rollup_id","entry_id")
);
--> statement-breakpoint
CREATE TABLE "rollups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"industry_id" uuid,
	"lens_key" text NOT NULL,
	"period_type" "period_type" NOT NULL,
	"period_key" text NOT NULL,
	"one_liner" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "rollups_scope_period_uq" UNIQUE("user_id","industry_id","lens_key","period_type","period_key")
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" "export_scope" NOT NULL,
	"ref_id" uuid,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"file_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_llm_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"tier" "llm_tier" DEFAULT 'default' NOT NULL,
	"claude_key_enc" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "user_lenses" ADD CONSTRAINT "user_lenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lenses" ADD CONSTRAINT "user_lenses_lens_key_lenses_key_fk" FOREIGN KEY ("lens_key") REFERENCES "public"."lenses"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "industries" ADD CONSTRAINT "industries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_industries" ADD CONSTRAINT "user_industries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_industries" ADD CONSTRAINT "user_industries_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_pages" ADD CONSTRAINT "report_pages_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_lens_key_lenses_key_fk" FOREIGN KEY ("lens_key") REFERENCES "public"."lenses"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_numbers" ADD CONSTRAINT "entry_numbers_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_facts" ADD CONSTRAINT "rollup_facts_rollup_id_rollups_id_fk" FOREIGN KEY ("rollup_id") REFERENCES "public"."rollups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_sources" ADD CONSTRAINT "rollup_sources_rollup_id_rollups_id_fk" FOREIGN KEY ("rollup_id") REFERENCES "public"."rollups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_sources" ADD CONSTRAINT "rollup_sources_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollups" ADD CONSTRAINT "rollups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollups" ADD CONSTRAINT "rollups_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollups" ADD CONSTRAINT "rollups_lens_key_lenses_key_fk" FOREIGN KEY ("lens_key") REFERENCES "public"."lenses"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_llm_settings" ADD CONSTRAINT "user_llm_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_user_industry_date_idx" ON "reports" USING btree ("user_id","industry_id","pub_date");--> statement-breakpoint
CREATE INDEX "entries_user_industry_lens_date_idx" ON "entries" USING btree ("user_id","industry_id","lens_key","entry_date");