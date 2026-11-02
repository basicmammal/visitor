import type { WeekHours } from '@/lib/domain/opening';
import type { Genre } from '@/lib/domain/genre';
import type { Occurrence } from '@/lib/domain/occurrence';
import {
  type AnyPgColumn,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * The canonical record. One row per front door, separate from every
 * source: a Visit Jersey listing, a factoryOS contact, a delivery stop
 * and a UPRN are four keys for the same place, and they all hang off
 * this row rather than any one of them being the place.
 */

export type Image = {
  url: string;
  publicId: string | null;
  alt: string | null;
  originalFilename: string | null;
  /** A stock picture's photographer and where it came from, when it is not the listing's own. */
  credit?: { name: string; url: string | null; source: string } | null;
  /**
   * Whether the picture is words as much as a photograph (a poster, a
   * flyer, a title over the image): the guide does not print those, as
   * they crop badly. Checked once per picture (lib/integrations/claude/image-text.ts).
   */
  text?: { found: boolean; url: string; at: string } | null;
};

/** Where one field's current value came from. */
export type FieldSource = { source: string; ref: string; at: string };
export type FieldSources = Record<string, FieldSource>;

export type EventDate = { date: string; start: string | null; end: string | null };

export const CATEGORIES = ['stay', 'eat-drink', 'see', 'do', 'shop'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Whether a place goes in the guide. A person sets it; an import never does. */
export const INCLUSIONS = ['candidate', 'included', 'excluded'] as const;

/**
 * How much room a venue gets, as the guide sells it: a line in the
 * area directory, a listing with its category label, or a 2/3 or full
 * entry with copy and a photo.
 */
/**
 * The space a venue has in the printed guide, on the grid of eight (two
 * boxes across, four down): a directory line; a listing, one box (an
 * eighth); a quarter, a row across both columns; a half; three-quarters;
 * or a page of its own. Earned by the edition's booking: a DPS a page, a
 * full page three-quarters, a half page a half, a quarter page a quarter,
 * a banner or square a box.
 */
export const LISTING_SIZES = ['directory', 'listing', 'quarter', 'half', 'three-quarters', 'full'] as const;
export type ListingSize = (typeof LISTING_SIZES)[number];
export type Inclusion = (typeof INCLUSIONS)[number];

/**
 * Whether a listing may be shown at all. Imported ones arrive approved;
 * one a provider adds waits for staff, hidden from the site and the
 * guide until then. Separate from inclusion, which is about the guide.
 */
export const REVIEWS = ['pending', 'approved', 'rejected'] as const;
export type Review = (typeof REVIEWS)[number];

/**
 * A business that lists with us: a hotel, a venue, a tour operator. Its
 * people sign in and look after its listings. Not the same as a tour
 * `provider`, which is what the guide prints in its key; a business that
 * runs tours gets one, linked here.
 */
export const businesses = pgTable('businesses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  website: text('website'),
  providerId: uuid('provider_id').references((): AnyPgColumn => providers.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * superadmin  everything, including who else is staff
 * staff       the editing side: review, inclusion, the guide, provider accounts
 * provider    their own business's listings, and its team
 */
export const ROLES = ['superadmin', 'staff', 'provider'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Who may sign in, and as what. Supabase only proves who somebody is;
 * an account here is what lets them in. Keyed by email, because an
 * invite exists before the person has ever signed in; `authId` is filled
 * on their first sign-in.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  authId: uuid('auth_id').unique(),
  name: text('name'),
  role: text('role').$type<Role>().notNull(),
  /** Required for a provider, empty for staff. */
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'restrict' }),
  invitedBy: text('invited_by'),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  /** Set to stop somebody signing in without losing who they were. */
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A link that makes an account. Only its hash is stored: the link is
 * shown once, to whoever sent the invite.
 */
export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  role: text('role').$type<Role>().notNull(),
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').$type<Category>().notNull(),

  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  postcode: text('postcode'),
  parish: text('parish'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),

  phone: text('phone'),
  website: text('website'),
  /** The public enquiries address. Fine in a visitor guide; never an invoice address. */
  email: text('email'),

  /** Source copy, as text. Their voice and their length. */
  summary: text('summary'),
  description: text('description'),
  /** Our copy. Never touched by an import. */
  guideCopy: text('guide_copy'),
  /**
   * One sentence in the guide's voice, what a listing box on the grid of
   * eight prints: Claude writes it from our copy or the source's, and
   * again when those words change (guideLineKey); one a person writes is
   * locked ('guideLine').
   */
  guideLine: text('guide_line'),
  guideLineKey: text('guide_line_key'),
  /**
   * For an activity provider in the guide's Do section: its short marker
   * (SSC, JSS, BBDC), printed in each activity's box and against its
   * line in the providers' index, and the activities it offers (slugs of
   * do_activities). Ours.
   */
  activityCode: text('activity_code'),
  activities: text('activities').array().notNull().default([]),
  /** Where it sits in the guide: section "Eat", area "West", label "CASUAL". Ours. */
  guideSection: text('guide_section'),
  guideArea: text('guide_area'),
  guideLabel: text('guide_label'),
  listingSize: text('listing_size').$type<ListingSize>().notNull().default('listing'),

  facilities: text('facilities').array().notNull().default([]),
  accessibility: text('accessibility').array().notNull().default([]),
  /** Months open, 1–12. Empty means the source did not say. */
  openMonths: integer('open_months').array().notNull().default([]),
  /** Opening and closing times through the week, as the source lists them. Null when it does not, or hides them. */
  openingHours: jsonb('opening_hours').$type<WeekHours | null>(),
  lowRatePence: integer('low_rate_pence'),
  highRatePence: integer('high_rate_pence'),
  aaRating: text('aa_rating'),
  /** What kind of place to stay, as Visit Jersey types it: Hotel, Guest house, Self-catering, Camping & glamping, Hostel. Null for anything else. */
  stayType: text('stay_type'),
  /**
   * Its place on Google Maps, for the reviews panel. Google's terms allow
   * keeping the ID; the rating and reviews themselves are fetched live and
   * never stored. Matched nightly by name and distance; a person can set
   * or clear it, which locks it (googleLocked).
   */
  googlePlaceId: text('google_place_id'),
  /** When the nightly match last looked, found or not, so an unmatched venue is retried monthly rather than every night. */
  googleCheckedAt: timestamp('google_checked_at', { withTimezone: true }),
  googleLocked: boolean('google_locked').notNull().default(false),
  /** Addresses it had before two listings of it were merged into this one: they lead here. */
  formerSlugs: text('former_slugs').array().notNull().default([]),

  headerImage: jsonb('header_image').$type<Image | null>(),
  gallery: jsonb('gallery').$type<Image[]>().notNull().default([]),
  /** The picture an event here shows when it has none of its own and its organiser sets none. Ours. */
  fallbackImage: jsonb('fallback_image').$type<Image | null>(),
  /**
   * Visitor guide featured: featured in the printed guide, shown on the site.
   * Holds the latest edition it was in ("Autumn 2026"); null when it was
   * in none. Ours.
   */
  recommendedIn: text('recommended_in'),
  /** The edition of the Visitor Map it is on ("2026"), from its booking; shown on its page. Null when it is on none. Ours. */
  visitorMap: text('visitor_map'),
  /**
   * When it was first listed: the day Visit Jersey first published it on
   * jersey.com, or, for one we added ourselves, the day we did. What makes
   * a venue new (lib/domain/new-venue.ts). Null for the printed guide's own
   * entries from before we kept it.
   */
  firstListedAt: timestamp('first_listed_at', { withTimezone: true }).defaultNow(),
  /**
   * The space each edition of the printed guide gives it, as the bookings
   * for that edition earn it: { "Autumn 2026": "full", "Winter 2026": "listing" }.
   * listingSize is the edition in hand; this keeps the ones before. Ours.
   */
  spaceByEdition: jsonb('space_by_edition').$type<Record<string, ListingSize>>().notNull().default({}),
  /** Has worked with us. Internal: the admin only, never the public site. Ours. */
  client: boolean('client').notNull().default(false),
  clientNote: text('client_note'),
  sourceLink: text('source_link'),

  /** The business that looks after it, when one does. */
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'set null' }),
  review: text('review').$type<Review>().notNull().default('approved'),
  /** Why staff turned a provider's listing down, shown to them. */
  reviewNote: text('review_note'),

  inclusion: text('inclusion').$type<Inclusion>().notNull().default('candidate'),
  inclusionNote: text('inclusion_note'),
  /** Who decided, and when. The signed-in email. */
  inclusionSetBy: text('inclusion_set_by'),
  inclusionSetAt: timestamp('inclusion_set_at', { withTimezone: true }),
  /** Who last changed our copy, note or a locked field. */
  editedBy: text('edited_by'),
  editedAt: timestamp('edited_at', { withTimezone: true }),

  /** Join keys to systems this one does not own. */
  uprn: text('uprn'),
  factoryosContactId: text('factoryos_contact_id'),

  fieldSources: jsonb('field_sources').$type<FieldSources>().notNull().default({}),
  /** Fields a person has corrected. An import reads them and leaves them alone. */
  lockedFields: text('locked_fields').array().notNull().default([]),
  /** The newest modification any source reports for this place. */
  sourceModifiedAt: timestamp('source_modified_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary'),
  description: text('description'),
  guideCopy: text('guide_copy'),

  venue: text('venue'),
  venueName: text('venue_name'),
  addressLine1: text('address_line_1'),
  parish: text('parish'),
  postcode: text('postcode'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  eventTypes: text('event_types').array().notNull().default([]),
  free: boolean('free').notNull().default(false),
  /** One-off, specific dates, regular or ongoing: computed from the dates, lockable. See lib/domain/occurrence.ts. */
  occurrence: text('occurrence').$type<Occurrence>().notNull().default('one-off'),
  placeId: uuid('place_id').references(() => places.id, { onDelete: 'set null' }),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),

  dates: jsonb('dates').$type<EventDate[]>().notNull().default([]),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  fromPricePence: integer('from_price_pence'),
  toPricePence: integer('to_price_pence'),

  /**
   * What the guide prints instead of the computed dates, times or price,
   * when the computed one is wrong for print ("Every Saturday"). Ours;
   * an import never writes them.
   */
  printDates: text('print_dates'),
  printTimes: text('print_times'),
  printPrice: text('print_price'),
  /**
   * The guide's shortest copy: one sentence that fits the smallest printed
   * frame. Written by Claude from the listing's words after each import,
   * again when those words change (printLineKey), never once a person has
   * set it (a locked field).
   */
  printLine: text('print_line'),
  printLineKey: text('print_line_key'),
  /** A highlight: a full page in the guide with the extended listing and a large image, featured first online. Ours. */
  highlight: boolean('highlight').notNull().default(false),
  /** The picture a page of the guide's grid layout shows beside this listing, chosen by staff ahead of the rest. Ours. */
  guidePicture: boolean('guide_picture').notNull().default(false),

  headerImage: jsonb('header_image').$type<Image | null>(),
  /** More pictures from the source, after the header. */
  gallery: jsonb('gallery').$type<Image[]>().notNull().default([]),
  sourceLink: text('source_link'),
  /** Who puts it on, as the source names them: the organisers page groups by it. */
  organiser: text('organiser'),

  /** The business that looks after it, when one does. */
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'set null' }),
  review: text('review').$type<Review>().notNull().default('approved'),
  /** Why staff turned a provider's listing down, shown to them. */
  reviewNote: text('review_note'),

  inclusion: text('inclusion').$type<Inclusion>().notNull().default('candidate'),
  inclusionNote: text('inclusion_note'),
  /** Who decided, and when. The signed-in email. */
  inclusionSetBy: text('inclusion_set_by'),
  inclusionSetAt: timestamp('inclusion_set_at', { withTimezone: true }),
  /** Who last changed our copy, note or a locked field. */
  editedBy: text('edited_by'),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  fieldSources: jsonb('field_sources').$type<FieldSources>().notNull().default({}),
  lockedFields: text('locked_fields').array().notNull().default([]),
  sourceModifiedAt: timestamp('source_modified_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every record a source has given us, kept whole. The raw payload is
 * the answer to "what did they say?" after we have changed our mind
 * about how to read it, and `modified_gmt` / `portal_last_synced` make
 * "what changed since the last edition?" a query rather than a diff.
 */
export const sourceRecords = pgTable(
  'source_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    externalType: text('external_type').notNull(),
    externalId: text('external_id').notNull(),
    placeId: uuid('place_id').references(() => places.id, { onDelete: 'set null' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    experienceId: uuid('experience_id').references(() => experiences.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull(),
    modifiedAt: timestamp('modified_at', { withTimezone: true }),
    portalSyncedAt: timestamp('portal_synced_at', { withTimezone: true }),
    /** False once a source stops returning the record. Kept, not deleted. */
    present: boolean('present').notNull().default(true),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySourceKey: uniqueIndex('source_records_source_key').on(t.source, t.externalType, t.externalId),
  }),
);

/**
 * Whoever runs a tour. The guide prints them once, in a key, with the
 * short code each tour entry refers to ("AA Absolute Adventures"). Codes
 * are ours and kept between editions.
 */
export const providers = pgTable('providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  code: text('code').unique(),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  /** Their own directory listing, when there is one. */
  placeId: uuid('place_id').references(() => places.id, { onDelete: 'set null' }),
  /** Other names the source gives the same business, merged into this one by staff: the import finds this provider by any of them, so a merge stays merged. */
  aliases: text('aliases').array().notNull().default([]),
  /** The edition of the Visitor Map it is on ("2026"), from its booking; shown on its tours. Null when it is on none. Ours. */
  visitorMap: text('visitor_map'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A tour or experience. Providers list everything they offer the same
 * way, so `occurrence` separates the ones on particular dates (printed
 * as dated listings) from the ones bookable any day (printed under
 * their genre, "on demand").
 */
export const experiences = pgTable('experiences', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'set null' }),
  summary: text('summary'),
  description: text('description'),
  guideCopy: text('guide_copy'),

  duration: text('duration'),
  tags: text('tags').array().notNull().default([]),
  genre: text('genre').$type<Genre>(),
  dates: jsonb('dates').$type<EventDate[]>().notNull().default([]),
  occurrence: text('occurrence').$type<Occurrence>().notNull().default('ongoing'),
  fromPricePence: integer('from_price_pence'),
  toPricePence: integer('to_price_pence'),
  meetingPoint: text('meeting_point'),
  parish: text('parish'),
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  lat: doublePrecision('lat'),
  lon: doublePrecision('lon'),

  printDates: text('print_dates'),
  printTimes: text('print_times'),
  highlight: boolean('highlight').notNull().default(false),
  /** The picture a page of the guide's tour grid shows beside this listing, chosen by staff ahead of the rest. Ours. */
  guidePicture: boolean('guide_picture').notNull().default(false),
  headerImage: jsonb('header_image').$type<Image | null>(),
  /** More pictures from the source, after the header. */
  gallery: jsonb('gallery').$type<Image[]>().notNull().default([]),
  sourceLink: text('source_link'),

  /** The business that looks after it, when one does. */
  businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'set null' }),
  review: text('review').$type<Review>().notNull().default('approved'),
  /** Why staff turned a provider's listing down, shown to them. */
  reviewNote: text('review_note'),

  inclusion: text('inclusion').$type<Inclusion>().notNull().default('candidate'),
  inclusionNote: text('inclusion_note'),
  inclusionSetBy: text('inclusion_set_by'),
  inclusionSetAt: timestamp('inclusion_set_at', { withTimezone: true }),
  editedBy: text('edited_by'),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  fieldSources: jsonb('field_sources').$type<FieldSources>().notNull().default({}),
  lockedFields: text('locked_fields').array().notNull().default([]),
  sourceModifiedAt: timestamp('source_modified_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const LISTING_KINDS = ['venue', 'event', 'experience'] as const;
export type ListingKind = (typeof LISTING_KINDS)[number];

/**
 * A provider's edit to a listing that is already public. It waits here
 * for staff instead of changing the listing; approving writes it and
 * locks the fields, so an import keeps the provider's answer. One open
 * change per listing: a second edit replaces the first.
 */
export const listingChanges = pgTable('listing_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').$type<ListingKind>().notNull(),
  listingId: uuid('listing_id').notNull(),
  businessId: uuid('business_id').notNull().references(() => businesses.id, { onDelete: 'cascade' }),
  changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
  status: text('status').$type<Review>().notNull().default('pending'),
  submittedBy: text('submitted_by').notNull(),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  oneOpen: uniqueIndex('listing_changes_one_open').on(t.kind, t.listingId).where(sql`${t.status} = 'pending'`),
}));

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Provider = typeof providers.$inferSelect;
/**
 * Somebody on the public site saying "this is ours": a venue, an event or
 * a tour we already list, or (no listing) a business that wants to add
 * its own. Staff decide. Approving gives the listing to a business and,
 * for someone without an account, makes their invite.
 */
/**
 * What we keep about an organiser. Organisers are the names events give
 * (events.organiser), matched loosely (lib/domain/organiser.ts), so this
 * is keyed by that match, not by an id an event points to.
 */
/**
 * The guide's Do section is set by activity: a box for each (Surf, SUP,
 * Golf), its short piece, and the markers of the providers who offer it,
 * on the water first, then on land, a picture a page; then the
 * providers' index. Staff choose which activities an edition carries, to
 * fill its pages. Ours: no import touches them.
 */
export const DO_SIDES = ['water', 'land'] as const;
export type DoSide = (typeof DO_SIDES)[number];
export const doActivities = pgTable('do_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  side: text('side').$type<DoSide>().notNull(),
  blurb: text('blurb'),
  image: jsonb('image').$type<Image | null>(),
  position: integer('position').notNull().default(0),
  included: boolean('included').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export type DoActivity = typeof doActivities.$inferSelect;

export const organiserProfiles = pgTable('organiser_profiles', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  /** The picture their events show when they have none of their own. */
  fallbackImage: jsonb('fallback_image').$type<Image | null>(),
  editedBy: text('edited_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const claims = pgTable(
  'claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** What is claimed; both empty for a request to list something new. */
    kind: text('kind').$type<ListingKind>(),
    listingId: uuid('listing_id'),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    businessName: text('business_name').notNull(),
    /** "Owner", "Manager", "Organiser": how they are connected to it. */
    relationship: text('relationship'),
    message: text('message'),
    status: text('status').$type<Review>().notNull().default('pending'),
    /** The business the listing went to, on approval. */
    businessId: uuid('business_id').references(() => businesses.id, { onDelete: 'set null' }),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStatus: index('claims_status').on(t.status, t.createdAt),
  }),
);

/**
 * People who asked for the weekly What's On email. Double opt-in: an
 * address is `pending` until its owner follows the link we send it, and
 * only `subscribed` ones get the email. Leaving keeps the row, marked
 * `unsubscribed`, so a second sign-up asks again rather than starting over.
 */
export const SUBSCRIBER_STATUSES = ['pending', 'subscribed', 'unsubscribed'] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export const subscribers = pgTable(
  'subscribers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Lower case, trimmed. */
    email: text('email').notNull(),
    status: text('status').$type<SubscriberStatus>().notNull().default('pending'),
    /** In the confirm and unsubscribe links. Secret, and the only way to act on the row from outside. */
    token: text('token').notNull(),
    /** Where they signed up: `popover`, `page`. */
    source: text('source'),
    confirmSentAt: timestamp('confirm_sent_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    /** The first day of the last weekly email sent to them, so a second run that week sends nothing. */
    lastSentFor: date('last_sent_for'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEmail: uniqueIndex('subscribers_email').on(t.email),
    byToken: uniqueIndex('subscribers_token').on(t.token),
    byStatus: index('subscribers_status').on(t.status),
  }),
);

export type Experience = typeof experiences.$inferSelect;
export type Business = typeof businesses.$inferSelect;
export type User = typeof users.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type ListingChange = typeof listingChanges.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type Subscriber = typeof subscribers.$inferSelect;

/** Where a client's proof stands: sent, looked at, signed off as it is, changes sent, or (staff) the changes taken or turned down. */
export const PROOF_STATUSES = ['sent', 'opened', 'approved', 'changes', 'accepted', 'declined'] as const;
export type ProofStatus = (typeof PROOF_STATUSES)[number];

/**
 * An editorial proof: a client's entry in one edition of the guide, sent
 * on the artwork deadline by a link of its own, no password. The client
 * signs it off, or sends new words and a picture, which wait here until
 * staff take them (onto the listing, locked, for print and the website)
 * or turn them down. Only the token's hash is kept, as an invite's.
 */
export const proofs = pgTable(
  'proofs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    edition: text('edition').notNull(),
    kind: text('kind').$type<'venue' | 'event'>().notNull(),
    listingId: uuid('listing_id').notNull(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** Links sent before this one (a reminder sends a fresh link), which still open it. Hashes only. */
    formerTokenHashes: text('former_token_hashes').array().notNull().default(sql`'{}'::text[]`),
    /** The artwork deadline: the last day to reply. The link works a week past it. */
    deadline: date('deadline').notNull(),
    status: text('status').$type<ProofStatus>().notNull().default('sent'),
    /** What the client sent: their words, their picture, a note to us. */
    proposedCopy: text('proposed_copy'),
    proposedImage: jsonb('proposed_image').$type<Image | null>(),
    note: text('note'),
    sentBy: text('sent_by').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    /** Their advert: new artwork sent, new artwork on its way, or the same as last time. Null until they say. */
    artwork: text('artwork').$type<ArtworkPlan>(),
    /** The files they sent, in the private artwork bucket. */
    artworkFiles: jsonb('artwork_files').$type<ArtworkFile[]>().notNull().default([]),
    /** When artwork they said was coming should reach us. */
    artworkDue: date('artwork_due'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ onePerEdition: uniqueIndex('proofs_one_per_edition').on(t.edition, t.kind, t.listingId) }),
);
export type Proof = typeof proofs.$inferSelect;
/** What a client says of their advert in a proof. */
export const ARTWORK_PLANS = ['sent', 'coming', 'same'] as const;
export type ArtworkPlan = (typeof ARTWORK_PLANS)[number];
export type ArtworkFile = { path: string; name: string; size: number };
