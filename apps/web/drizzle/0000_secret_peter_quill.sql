CREATE TABLE IF NOT EXISTS "analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"resume_id" text NOT NULL,
	"job_description" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"validation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resumes" (
	"id" text PRIMARY KEY NOT NULL,
	"r2_key" text NOT NULL,
	"parsed" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rewrites" (
	"id" text PRIMARY KEY NOT NULL,
	"analysis_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"accepted_bullets" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analyses_resume_idx" ON "analyses" USING btree ("resume_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analyses_expires_idx" ON "analyses" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resumes_expires_idx" ON "resumes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rewrites_analysis_idx" ON "rewrites" USING btree ("analysis_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rewrites_expires_idx" ON "rewrites" USING btree ("expires_at");