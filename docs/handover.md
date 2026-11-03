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

## In progress: map pages (not started in code)

The owner wants the guide's two map pages recreated, drawn from **OpenStreetMap** and styled
like the old ones, with an index generated from our data.

**Blocker**: the sandbox could not fetch OSM data. `overpass-api.de` and
`download.geofabrik.de` were added to the environment's allowed domains, but connections were
reset mid-transfer (`ws_closed_mid_exchange`). Check first, in the new session:

```
curl -sS -m 60 -o /dev/null -w '%{http_code}\n' "https://overpass-api.de/api/interpreter?data=%5Bout%3Ajson%5D%3Bnode(49.18,-2.13,49.19,-2.10)%5Bamenity%3Dcafe%5D%3Bout%201%3B"
```

If it still fails, report it as a proxy problem; do not fetch it via Railway.

**The old maps** (Summer 2026 package on Drive, folder `1iiIh_ZFFCiyTfxzU40DQ60CRZDZvtSsp`):

- *Island map* (`vjvg_island map details_26_1.idml`, art `vjvm_island_map_*.ai`): six colour-coded
  categories, each numbered 1 to 10, an index column per category, numbered markers on the map,
  a dozen with a label on the map ("1. Valley Adventure"), National Park areas in green,
  Les Écréhous and Les Minquiers noted. Index (mirror it, per the owner):
  - Attractions: Jersey Zoo, Jersey War Tunnels, C.I. Military Museum, La Mare Wine Estate,
    Eric Young Orchid Foundation, Pallot Steam Museum, Jersey Lavender, Jersey Museum,
    Samarès Manor, Maritime Museum
  - Heritage/culture: Hamptonne, Elizabeth Castle, Mont Orgueil, Maritime Museum, La Hougue Bie,
    Tesson Mill, Le Moulin de Quétivel, Wetland Centre, Grosnez Castle, Corbière Lighthouse
  - Shopping: Catherine Best, Jersey Pearl, Les Quesnes Garden Centre, The Trading Point,
    Harbour Gallery, Jane James, The Old Sail Loft, The Surfyard, Acorn Enterprises,
    St Peter's Garden Centre
  - Restaurants: Indigo's, The Moorings, Sumas, The Poplars Tea Room, The Windmill, The Loft,
    El Tico, Watersplash, Ocean Restaurant, Le Braye
  - Activity: Valley Adventures, Jersey Duchess, RIB Trips, Jersey Sea Sport Centre,
    Splash Surf Centre, Jersey Surf School, Absolute Adventures, Jersey Bowl, Jump Jersey,
    Les Mielles
  - Pubs: Old Court House Inn, Trinity Arms, St Mary's Pub, The Seymour, The Dolphin,
    The Beaumont Inn, Old Smugglers Inn, Farmers Inn, Victoria in the Valley, The Rozel
  - Matching to `places`: 51 of 60 match a venue with a location. Not in the database: Tesson
    Mill, St Mary's Pub, Farmers Inn, Victoria in the Valley, The Old Sail Loft, The Surfyard,
    Acorn Enterprises, St Peter's Garden Centre (map entries need their own pin). No location:
    Indigo's, Les Quesne Garden Centre. Ambiguous: RIB Trips, Surf School, The Dolphin,
    The Beaumont, Jersey Pearl (use the main site, not King Street), Les Mielles (golf club).
- *St Helier map* (`vjvg_26_1_sthelier map details.idml`, art `vmj_layout_front_2026.pdf`, the
  Visit Jersey VisitorMap's St Helier panel): grid A–M by 1–11, a "Place locator" index in two
  columns by category (Shopping, Heritage & Culture, Activity & Travel, Restaurants, Bars,
  Coffees & Cakes, Pubs) with grid refs, and a King Street / Queen Street shopping inset. The
  owner said: **start it from the booked clients in St Helier** (space booked in the edition),
  by category, with grid refs; staff add others later. The art PDFs are over the 10 MB Drive
  download limit, so the old list could not be read.

**Plan agreed**: fetch Jersey's OSM data once (coastline, land use, parks, roads by class,
St Helier streets and buildings) and save it in the repo; render both maps as SVG in the
guide's page frame, styled like the old ones; a `map_entries`-style table (map, category,
position, place or own pin, label, labelled-on-map) seeded as above; generate the numbered
index (island) and grid references (St Helier) from coordinates; an admin page per map to add,
remove and reorder; the pages in Admin > Guide and an export for InDesign. Attribution:
"© OpenStreetMap contributors".

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
