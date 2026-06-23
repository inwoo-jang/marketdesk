CREATE TYPE "public"."doc_type" AS ENUM('industry', 'company', 'news');--> statement-breakpoint
CREATE TYPE "public"."input_format" AS ENUM('pdf', 'text', 'image');--> statement-breakpoint
CREATE TYPE "public"."user_plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_daily_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "user_lenses" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan" "user_plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "industry_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "doc_type" "doc_type";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "input_format" "input_format" DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_daily" ADD CONSTRAINT "usage_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;