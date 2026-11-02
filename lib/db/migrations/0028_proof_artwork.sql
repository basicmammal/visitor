ALTER TABLE "proofs" ADD COLUMN "artwork" text;--> statement-breakpoint
ALTER TABLE "proofs" ADD COLUMN "artwork_files" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "proofs" ADD COLUMN "artwork_due" date;