ALTER TABLE "user_llm_settings" ADD COLUMN "alert_drop_pct" integer;--> statement-breakpoint
ALTER TABLE "user_llm_settings" ADD COLUMN "alert_stop_pct" integer;--> statement-breakpoint
ALTER TABLE "user_llm_settings" ADD COLUMN "alerts_off" boolean DEFAULT false NOT NULL;