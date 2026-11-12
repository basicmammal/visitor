/**
 * Event types from what an event says about itself, for sources that give
 * none (Eventbrite, the charities' diary) or too few. Visit Jersey's own
 * labels are the vocabulary, so one filter covers every source, with a few
 * it lacks: Charity, Nightlife, Talks & learning, Markets & fairs, and
 * Business & networking, which marks what is not for visitors so it is
 * quick to turn down in review.
 *
 * Words, not guesses: each type is a list of patterns over the title and
 * copy, the title weighed first. Pure, so a misfiled event becomes a test.
 */

type Rule = { type: string; title?: RegExp; text?: RegExp };

const RULES: Rule[] = [
  {
    type: 'Business & networking',
    title: /\b(networking|conference|seminar|webinar|briefing|cpd|summit|agm|masterclass for|leadership|investor|wealth management|compliance|cyber[- ]security|tabletop exercise|awards? (ceremony|dinner)|policy|regulation|accountan|fintech|careers? fair|recruitment|business breakfast|chamber of commerce)\b/i,
  },
  {
    // Training and work: courses for nurses and carers, careers, employment law, start-ups. Aimed at people who live and work here, not visitors.
    type: 'Professional & training',
    title: /\b(training|study (day|session)|course for|nurses|hcas?|health ?care assistants?|gps|advance care|care planning|palliative|end of life|last days of life|symptom control|safe moving|moving (&|and) handling|safeguarding|first aid at work|rqf|level \d|makaton|catheter|stoma|nephrostomy|gastrostomy|bowel care|leg ulcer|epilepsy|midazolam|careers?|recruit\w*|apprentice\w*|disciplinar\w*|legal clinics?|annual reporting|toolkit|start-?ups?|pitch(es)?|business(es)?|invest(ing|ors?|ment)?|leading from within|communicators?|carbon literacy|media solutions|ined|lone working|professional|committee meeting|grant application)\b/i,
  },
  {
    type: 'Charity',
    title: /\b(charity|charities|fundrais\w*|in aid of|appeal|sponsored|raffle|hospice|cancer relief|macmillan|rnli|nspcc|blood cancer)\b/i,
    text: /\b(in aid of|all proceeds|raising (money|funds)|fundrais\w*|registered charity|charity (night|event|dinner|quiz))\b/i,
  },
  {
    type: 'Family friendly',
    title: /\b(family|families|kids?|children'?s?|toddlers?|junior|half[- ]term|storytime|story time|teddy|panto(mime)?|santa|easter egg|trick or treat|under (5|8|10|12)s?|baby|babies|youth|teens?)\b/i,
    text: /\b(suitable for (all ages|children|families)|all the family|family[- ]friendly|for kids|children (welcome|aged))\b/i,
  },
  {
    type: 'Music',
    title: /\b(music|concert|gig|live band|choir|choral|orchestra|symphon\w*|jazz|blues|folk|opera|acoustic|tribute|recital|singer|songwriter|band|unplugged|quartet|ensemble|ibiza|dj)\b/i,
    text: /\b(tribute (band|act|show)|live music|live band|in concert|the band|headlin\w*)\b/i,
  },
  {
    type: 'Nightlife',
    title: /\b(club night|disco|rave|party|dj|karaoke|after dark|ibiza|bottomless|silent disco|quiz( night)?|comedy (night|club)|stand[- ]up night|cabaret|drag|open mic|live music|gig|bingo night|late[- ]night|nightclub|shanty night|tribute night|(70s|80s|90s|00s) night|cocktail night)\b/i,
  },
  {
    type: 'Sports',
    title: /\b(parkrun|fun run|\d+ ?k (run|race)|running (club|race|festival|group|session)|marathon|triathlon|duathlon|swim(ming)?|golf|tennis|padel|football|rugby|cricket|hockey|netball|cycl\w*|sportive|regatta|sailing|race|tournament|match|boxing(?! day)|climbing|\bfc|home games?|surf\w*|paddleboard\w*|kayak\w*)\b/i,
  },
  {
    type: 'Health & wellbeing',
    title: /\b(yoga|pilates|meditation|sound bath|wellbeing|well-being|wellness|mindful\w*|breathwork|reiki|retreat|mental health|fitness|tai chi|qigong|parenting|parents?|dementia|bereavement|grief|anxiety|self[- ](harm|belief|esteem|care)|health ?care|nurs(es|ing)|therap(y|ies|ist)|catheter|diabetes|cancer support|healing|support group|counsell?ing|menopause|first aid)\b/i,
  },
  {
    type: 'Food & drink',
    title: /\b(food|dinner|lunch|brunch|breakfast|supper|tasting|wine|gin|cocktails?|beer|cider|whisky|menu|feast|afternoon tea|bbq|barbecue|chef|cookery|cooking|street food)\b/i,
  },
  {
    type: 'Arts & cultural',
    title: /\b(theatre|theater|musical|film|cinema|screening|exhibition|gallery|art|arts|artist|comedy|comedian|stand[- ]up|dance|ballet|poetry|book (launch|signing)|author|literary|drama|performance|play reading|ceramics|painting|life drawing|sculpture|photography)\b/i,
  },
  {
    type: 'Talks & learning',
    title: /\b(talk|lecture|workshop|course|class|classes|seminar|q&a|in conversation|introduction to|learn|learning|lesson)\b/i,
  },
  {
    type: 'History & Heritage',
    title: /\b(history|historic(al)?|heritage|castle|occupation|museum|archaeolog\w*|liberation|wartime|war tunnels|bunker|norman|medieval)\b/i,
  },
  {
    type: 'Outdoor',
    title: /\b(walk|walking|hike|ramble|beach|outdoor|garden|gardens|nature|wildlife|birds?|bats|bat[- ](?:walk|spotting|watch\w*|detect\w*)|foraging|forage|coastal|coast path|coastline|cliff|woodland|wood|trail|stargazing|rock ?pool\w*)\b/i,
  },
  {
    type: 'Seasonal',
    title: /\b(halloween|spooky|ghost|christmas|xmas|festive|santa|easter|bonfire|fireworks|new year|valentine'?s?|carols?|advent|harvest)\b/i,
  },
  { type: 'Festivals', title: /\b(festival|fête|fete|carnival)\b/i },
  { type: 'Markets & fairs', title: /\b(market|craft fair|fair|car boot|bazaar|pop[- ]up shop|makers)\b/i },
];

/** Every type an event can carry, for a person choosing them: the rules' own, and Visit Jersey's two for sport. */
export const EVENT_TYPES = [...new Set([...RULES.map((r) => r.type), 'Spectator', 'Participant'])].sort();

/**
 * What the printed guide, which is for visitors, leaves out: training and
 * work events and business ones, always; health and wellbeing (classes,
 * courses, support and care) unless the event is also something a visitor
 * comes for.
 */
const FOR_VISITORS = ['Outdoor', 'Sports', 'Food & drink', 'Music', 'Arts & cultural', 'History & Heritage', 'Festivals', 'Markets & fairs'];

/** Health and wellbeing that is not also something a visitor comes for: a yoga class or a nurses' course, not a half marathon. */
export const healthOnly = (types: readonly string[]) => types.includes('Health & wellbeing') && !types.some((t) => FOR_VISITORS.includes(t));

export const nonCore = (types: readonly string[]) => types.includes('Professional & training') || types.includes('Business & networking') || healthOnly(types);

/** An event's types as print and the site judge them: as staff set them by hand, or with what its own words add. */
export const judgedTypes = (e: { eventTypes: readonly string[]; lockedFields: readonly string[] } & Parameters<typeof categorise>[0]) =>
  e.lockedFields.includes('eventTypes') ? [...e.eventTypes] : withCategories(e.eventTypes, e);

/**
 * Left off the front page and out of What's on until the visitor picks
 * Health & wellbeing: health listings are for people who live here. A
 * staff highlight is a choice to show it, so it stays.
 */
export const hiddenByDefault = (e: Parameters<typeof judgedTypes>[0] & { highlight: boolean }) => !e.highlight && healthOnly(judgedTypes(e));

/** The types the site files an event under: its own, and Health & wellbeing for one it hides, so that tile is the way to find it. */
export const siteTypes = (e: Parameters<typeof hiddenByDefault>[0]) => (hiddenByDefault(e) && !e.eventTypes.includes('Health & wellbeing') ? [...e.eventTypes, 'Health & wellbeing'] : [...e.eventTypes]);

/** Types a source always means, whatever the event says. */
const BY_SOURCE: Record<string, string[]> = { 'jersey-charities': ['Charity'] };

export function categorise(e: { title: string; summary?: string | null; description?: string | null }, source?: string): string[] {
  const text = [e.summary, e.description].filter(Boolean).join(' ');
  const found = new Set<string>(source ? (BY_SOURCE[source] ?? []) : []);
  for (const r of RULES) {
    if (r.title?.test(e.title) || (r.text && r.text.test(text))) found.add(r.type);
  }
  return [...found];
}

/** The source's own types first, then any these rules add. */
export function withCategories(existing: readonly string[], e: Parameters<typeof categorise>[0], source?: string): string[] {
  return [...new Set([...existing, ...categorise(e, source)])];
}

/** What an event at a bar is not, for Nightlife: a walk that sets off from the pub, a talk, a class, work. */
const NOT_A_NIGHT_OUT = ['Outdoor', 'Talks & learning', 'Business & networking', 'Professional & training', 'Health & wellbeing', 'Family friendly'];

/**
 * Nightlife by where and when, not by name: an evening event (from 6pm) at
 * one of the guide's pubs and bars, unless it is a walk, a talk, a class or
 * work that happens to start there. A band at The Sundown, a quiz at the
 * Trafalgar, a DJ at Chambers.
 */
export function eveningAtBar(e: { dates: readonly { start: string | null }[]; eventTypes: readonly string[] }, venueSection: string | null | undefined): boolean {
  if (venueSection !== 'Pubs & bars') return false;
  if (e.eventTypes.some((t) => NOT_A_NIGHT_OUT.includes(t))) return false;
  const start = e.dates.find((d) => d.start)?.start;
  return !!start && start >= '18:00';
}
