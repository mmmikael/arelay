CREATE TABLE "rate_limit_buckets" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_rate_limit_buckets_window_start" ON "rate_limit_buckets" USING btree ("window_start");
