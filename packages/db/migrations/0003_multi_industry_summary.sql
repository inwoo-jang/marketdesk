CREATE TABLE "report_industries" (
	"report_id" uuid NOT NULL,
	"industry_id" uuid NOT NULL,
	CONSTRAINT "report_industries_report_id_industry_id_pk" PRIMARY KEY("report_id","industry_id")
);
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "report_industries" ADD CONSTRAINT "report_industries_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_industries" ADD CONSTRAINT "report_industries_industry_id_industries_id_fk" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE cascade ON UPDATE no action;