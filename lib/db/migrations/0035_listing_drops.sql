CREATE TABLE IF NOT EXISTS "listing_drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"external_type" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"link" text,
	"place_id" uuid,
	"experience_id" uuid,
	"event_id" uuid,
	"dropped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"returned_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listing_drops" ADD CONSTRAINT "listing_drops_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listing_drops" ADD CONSTRAINT "listing_drops_experience_id_experiences_id_fk" FOREIGN KEY ("experience_id") REFERENCES "public"."experiences"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "listing_drops" ADD CONSTRAINT "listing_drops_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listing_drops_source" ON "listing_drops" USING btree ("source","external_type","external_id");--> statement-breakpoint
ALTER TABLE "listing_drops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- The listings already gone when the log began: dropped the day after they were last seen.
INSERT INTO "listing_drops" ("source", "external_type", "external_id", "name", "link", "place_id", "experience_id", "event_id", "dropped_at", "last_seen_at")
SELECT s."source", s."external_type", s."external_id",
  replace(replace(replace(replace(replace(replace(coalesce(s."payload"->'title'->>'rendered', s."payload"->>'title', s."payload"->>'name', s."external_id"),
    '&#038;', '&'), '&amp;', '&'), '&#8217;', '’'), '&#8216;', '‘'), '&#8211;', '–'), '&#8220;', '“'),
  s."payload"->>'link', s."place_id", s."experience_id", s."event_id", s."fetched_at" + interval '1 day', s."fetched_at"
FROM "source_records" s WHERE NOT s."present";
