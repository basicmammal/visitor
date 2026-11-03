CREATE TABLE IF NOT EXISTS "map_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"map" text NOT NULL,
	"category" text NOT NULL,
	"position" integer NOT NULL,
	"place_id" uuid,
	"label" text,
	"lat" double precision,
	"lon" double precision,
	"labelled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "map_entries" ADD CONSTRAINT "map_entries_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
ALTER TABLE "map_entries" ENABLE ROW LEVEL SECURITY;
