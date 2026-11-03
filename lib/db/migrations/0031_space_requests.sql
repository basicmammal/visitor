CREATE TABLE IF NOT EXISTS "space_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"edition" text NOT NULL,
	"size" text NOT NULL,
	"email" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "space_requests" ADD CONSTRAINT "space_requests_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Read and written only by the server; closed to Supabase's public API, as every table is.
ALTER TABLE "space_requests" ENABLE ROW LEVEL SECURITY;
