CREATE TABLE "user_securities" (
	"user_id" uuid NOT NULL,
	"security_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_securities_user_id_security_id_pk" PRIMARY KEY("user_id","security_id")
);
--> statement-breakpoint
ALTER TABLE "user_securities" ADD CONSTRAINT "user_securities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_securities" ADD CONSTRAINT "user_securities_security_id_securities_id_fk" FOREIGN KEY ("security_id") REFERENCES "public"."securities"("id") ON DELETE cascade ON UPDATE no action;