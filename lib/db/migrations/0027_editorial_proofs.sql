CREATE TABLE IF NOT EXISTS "proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"edition" text NOT NULL,
	"kind" text NOT NULL,
	"listing_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"former_token_hashes" text[] DEFAULT '{}'::text[] NOT NULL,
	"deadline" date NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"proposed_copy" text,
	"proposed_image" jsonb,
	"note" text,
	"sent_by" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proofs_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "proofs_one_per_edition" ON "proofs" USING btree ("edition","kind","listing_id");--> statement-breakpoint
-- Read and written only by the server; closed to Supabase's public API, as every table is.
ALTER TABLE "proofs" ENABLE ROW LEVEL SECURITY;
