# Handover: where things stand (3 Nov 2026)

For the next session. Read this first, then `README.md` and `docs/deploy.md`.

## How this project runs

- **Repo** `factoryjersey/visitor`. Next 15 (App Router), Drizzle, postgres.js, custom `server.mjs`.
- **Live site** https://guide.je (Railway, project `8083bfa9-b526-4ff5-b99a-213fd8798502`,
  env `0ba82705-a83b-49e8-a5d6-5d5bfa3129ff`, web service `c68628b6-545f-4caa-b5a6-736d2e4cfc6a`).
  `visitor.je` and `www.guide.je` redirect to guide.je.
- **Deploys**: Railway builds the web service from branch **`claude/zen-faraday-0sj5n7`**. Pushing
  there deploys live. Work branch `claude/modest-clarke-rqmeni` does not deploy. Push both:
  `git fetch origin claude/zen-faraday-0sj5n7 && git merge origin/claude/zen-faraday-0sj5n7`
  then `git push origin HEAD:claude/zen-faraday-0sj5n7 HEAD:claude/modest-clarke-rqmeni`.
  (Another session may push to the deploy branch too: always fetch and merge first.)
- **Database**: Supabase project `aizoxhgkbbeerxpsqvdc`. Schema changes are Drizzle migrations
  (`pnpm db:generate`, file in `lib/db/migrations`); Railway runs `pnpm db:migrate` as the
  pre-deploy step. New tables get `ENABLE ROW LEVEL SECURITY` appended to their migration.
- **Build gotcha**: `next build` runs *before* the migration. A page built ahead (ISR, e.g. the
  front page) must not query a column a pending migration adds, or the build fails. Wrap such
  queries with `.catch(() => [])` (see `app/(site)/page.tsx`, New this season).
- **Local preview**: Postgres at `postgres://postgres:postgres@localhost:5432/guide`
  (`service postgresql start`; it is a stale copy, not production). Build with
  `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co`, keys `x`,
  `NEXT_PUBLIC_APP_URL=https://guide.je`, then `PORT=4300 node server.mjs`. Admin and account
  pages need a sign-in; for a local look, temporarily short-circuit `getUser` in
  `lib/auth/session.ts` and the middleware (and `git checkout` both before committing).
- **Rules the owner has set**: never ask for secrets (they set them in Railway); don't block
  crawlers outright; don't route blocked hosts through Railway; the client tag and booking data
  are admin-only; commits end with the Co-Authored-By / Claude-Session trailer, no model names.

## Built in the last stretch (all live)

- **Front page** as a magazine: hero, Coming up (dated events only), Tours (dated only),
  Exhibitions (ongoing arts and heritage), New this season, Places to go. Filters are a slide-in
  panel on every listing. Times show as 7.30pm; events order by day then time.
- **Print guide** (Admin > Guide): Ongoing events on their own pages; New this season page;
  Looking ahead; venue boxes print the phone on its own line; bigger venue boxes have 1.2 line
  spacing; the quarter box fits its words to the column beside its picture.
- **Editorial proofs** (Admin > Proofs): everyone with space booked in an edition (listing box
  up to full page), per edition. Send by email (nobody ticked to start; Select all), remind,
  review and take or turn down changes. Clients' links sign them in to their own listing
  (never a staff address). Space requests ("Ask about this space") appear at the top.
- **Client admin** (`/account`): tabs for Your venue, Events (theirs, plus what is already
  listed at their venue from feeds), Tours if any, Team. The venue page is one form: picture,
  details, opening hours, "What you'd like to say" with "How we'll put it" beside it (Claude
  writes the card line, website text and print copy to the measured space), advert artwork,
  then previews of the website card and the guide entry, and every size they could book.
- **New this season** (Admin > New): pick places new to the jersey.com feed per edition.

## Map pages (built, not yet deployed)

Admin > Guide > **Maps** (`/admin/guide/maps`): the island map and St Helier, each a spread drawn
from OpenStreetMap, with the entries to edit beneath (add a venue or a named pin, reorder, name it
on the map, set a pin), an index CSV and an SVG of the artwork for InDesign.

- **Data**: the sandbox cannot reach OSM, so `.github/workflows/fetch-osm.yml` downloads Geofabrik's
  `guernsey-jersey` extract on GitHub and commits it to `data/osm/` (run it by hand to refresh).
  `pnpm maps:build` (needs `pip install osmium`) turns it into `lib/maps/island.json` and
  `lib/maps/st-helier.json`: layers pre-projected to mm (`lib/domain/map-frame.ts`).
- **Entries**: table `map_entries` (migration 0033). The island starts from the Summer 2026 index
  with the "Start from the Summer 2026 index" button (`lib/domain/map-seed.ts`); St Helier from
  "Add booked venues" for an edition. Numbers are the order in each category; grid refs (A–M, 1–11)
  come from position.
- **Still to pin** on the island (not in our data or OSM): The Old Sail Loft, The Surfyard,
  Acorn Enterprises, Indigo's. The admin page lists them in amber.
- **Not done**: the King Street / Queen Street inset; the map spreads are not yet placed among the
  guide's own pages (they render on their own page with a chosen folio, `?page=`).

## Loose ends

- Proofs: six booked venues have no email (The Jersey National Park, iQ Apple Premium Reseller,
  Drew & May, Indigo's, Les Quesne Garden Centre, Phire); type one in their row before sending.
- Bookings look copied per client onto every venue (Autumn 2026 shows a full page on each of a
  client's venues). Worth checking how spaces are entered before the next edition.
- Same-site pairs left in on purpose: Jersey War Tunnels and its Escape Rooms; Jersey Zoo and
  Durrell Wildlife Hostel. Dropped: Moorings Restaurant (kept the Hotel), Club Hotel's Winter
  space (kept Bohemia).
- Check the AI drafting works live (the venue form's "How we'll put it"): if it says it could not
  write our version, the web service lacks the Anthropic key.
- Events on proofs (highlights) still use the older single-box editor.
