CREATE TABLE "paper_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"note_date" date NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"security_id" uuid,
	"name" text NOT NULL,
	"buy_date" date NOT NULL,
	"shares" double precision NOT NULL,
	"buy_price" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_bars" (
	"security_id" uuid NOT NULL,
	"period" text NOT NULL,
	"date" date NOT NULL,
	"close" double precision NOT NULL,
	"open" double precision,
	"high" double precision,
	"low" double precision,
	"volume" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_bars_security_id_period_date_pk" PRIMARY KEY("security_id","period","date")
);
--> statement-breakpoint
CREATE TABLE "price_sync" (
	"security_id" uuid NOT NULL,
	"period" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_sync_security_id_period_pk" PRIMARY KEY("security_id","period")
);
--> statement-breakpoint
CREATE TABLE "securities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"market" text NOT NULL,
	"is_overseas" boolean DEFAULT false NOT NULL,
	"excd" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "securities_code_market_uk" UNIQUE("code","market")
);
--> statement-breakpoint
ALTER TABLE "paper_notes" ADD CONSTRAINT "paper_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_notes" ADD CONSTRAINT "paper_notes_position_id_paper_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."paper_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_positions" ADD CONSTRAINT "paper_positions_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_bars" ADD CONSTRAINT "price_bars_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_sync" ADD CONSTRAINT "price_sync_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "paper_notes_position_idx" ON "paper_notes" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "securities_name_norm_idx" ON "securities" USING btree ("name_norm");