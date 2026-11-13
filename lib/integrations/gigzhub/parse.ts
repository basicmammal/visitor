import type { EventDate } from '@/lib/db/schema';
import type { VjEvent } from '@/lib/integrations/jersey-com/parse';

/**
 * Gigz Hub (gigzhub.je): Jersey's live-music listings, bands and venues
 * posting their own gigs. It has no feed; its What's On page carries
 * every coming gig in the data the page is drawn from, written out as
 * JavaScript object literals ({id:"…",venue:"…",band_name:"…",…}).
 * This reads those objects without running anything.
 *
 * Their posters are signed links that expire within the week, so they are
 * not kept: the venue's picture, or stock, stands in.
 */

export const GIGZHUB = 'https://gigzhub.je';
export const WHATS_ON = `${GIGZHUB}/whats-on`;

export type Gig = {
  id: string;
  venue: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  bandName: string;
  date: string;
  startTime: string | null;
  genre: string | null;
  price: string | null;
  ticketUrl: string | null;
  blurb: string | null;
  status: string | null;
};

type Value = string | number | boolean | null | Value[] | { [k: string]: Value };

/** A small reader for the object literals the page is drawn from: strings, numbers, null, !0/!1, arrays, objects, and $R[n]= labels. */
class Reader {
  i: number;
  constructor(readonly s: string, start: number) {
    this.i = start;
  }
  ws() {
    while (/\s/.test(this.s[this.i] ?? '')) this.i += 1;
  }
  value(): Value {
    this.ws();
    // $R[12]= labels a value for reuse; the value follows. A bare $R[12] is a reference: nothing we need.
    const ref = /^\$R\[\d+\](=?)/.exec(this.s.slice(this.i, this.i + 16));
    if (ref) {
      this.i += ref[0].length;
      if (!ref[1]) return null;
      return this.value();
    }
    const c = this.s[this.i];
    if (c === '"') return this.string();
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '!') {
      const v = this.s[this.i + 1] === '0';
      this.i += 2;
      return v;
    }
    const lit = /^(null|undefined|void 0|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i.exec(this.s.slice(this.i, this.i + 32));
    if (lit) {
      this.i += lit[0].length;
      return /^-?\d/.test(lit[0]) ? Number(lit[0]) : null;
    }
    throw new Error(`unexpected ${JSON.stringify(this.s.slice(this.i, this.i + 20))}`);
  }
  string(): string {
    let out = '';
    this.i += 1;
    for (;;) {
      const c = this.s[this.i];
      if (c === undefined) throw new Error('unterminated string');
      this.i += 1;
      if (c === '"') return out;
      if (c !== '\\') {
        out += c;
        continue;
      }
      const e = this.s[this.i]!;
      this.i += 1;
      if (e === 'n') out += '\n';
      else if (e === 't') out += '\t';
      else if (e === 'r') out += '\r';
      else if (e === 'x') {
        out += String.fromCharCode(parseInt(this.s.slice(this.i, this.i + 2), 16));
        this.i += 2;
      } else if (e === 'u') {
        const braced = this.s[this.i] === '{';
        const end = braced ? this.s.indexOf('}', this.i) : this.i + 4;
        out += String.fromCodePoint(parseInt(this.s.slice(braced ? this.i + 1 : this.i, end), 16));
        this.i = braced ? end + 1 : end;
      } else out += e;
    }
  }
  object(): { [k: string]: Value } {
    const out: { [k: string]: Value } = {};
    this.i += 1;
    for (;;) {
      this.ws();
      if (this.s[this.i] === '}') {
        this.i += 1;
        return out;
      }
      if (this.s[this.i] === ',') {
        this.i += 1;
        continue;
      }
      let key: string;
      if (this.s[this.i] === '"') key = this.string();
      else {
        key = /^[\w$]+/.exec(this.s.slice(this.i, this.i + 64))?.[0] ?? '';
        if (!key) throw new Error(`bad key at ${this.i}`);
        this.i += key.length;
      }
      this.ws();
      if (this.s[this.i] !== ':') throw new Error(`expected : after ${key}`);
      this.i += 1;
      out[key] = this.value();
    }
  }
  array(): Value[] {
    const out: Value[] = [];
    this.i += 1;
    for (;;) {
      this.ws();
      if (this.s[this.i] === ']') {
        this.i += 1;
        return out;
      }
      if (this.s[this.i] === ',') {
        this.i += 1;
        continue;
      }
      out.push(this.value());
    }
  }
}

const str = (v: Value | undefined) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : null);
const num = (v: Value | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Every gig on the page, once each, as Gigz Hub gives it. */
export function parseGigs(html: string): Gig[] {
  const seen = new Map<string, Gig>();
  for (let at = html.indexOf('{id:"'); at !== -1; at = html.indexOf('{id:"', at + 1)) {
    // Only the gigs: their objects name a band and a date within the first stretch.
    const head = html.slice(at, at + 600);
    if (!head.includes('gig_date:') && !head.includes('band_name:')) continue;
    let o: { [k: string]: Value };
    try {
      o = new Reader(html, at).object();
    } catch {
      continue;
    }
    const id = str(o.id);
    const bandName = str(o.band_name);
    const date = str(o.gig_date);
    const venue = str(o.venue);
    if (!id || !bandName || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !venue) continue;
    seen.set(id, {
      id,
      venue,
      address: str(o.address),
      lat: num(o.lat),
      lng: num(o.lng),
      bandName,
      date,
      startTime: str(o.start_time),
      genre: str(o.genre),
      price: str(o.price),
      ticketUrl: str(o.ticket_url),
      blurb: str(o.blurb),
      status: str(o.status),
    });
  }
  return [...seen.values()];
}

/**
 * "20.00", "2000", "8:00 pm", "8:00": a gig's start as 24-hour "20:00".
 * An hour from 1 to 11 with no "am" is the evening: nobody plays the pub at 8 in the morning.
 */
export function gigTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^\s*(\d{1,2})(?:[.:h]?(\d{2}))?\s*(am|pm)?\s*$/i.exec(raw.replace(/\s+/g, ' '));
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  else if (ap === 'am' && h === 12) h = 0;
  else if (!ap && h >= 1 && h <= 11) h += 12;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "Free", "FREE", "0", "Free entry"; "£5", "From £15", "£10 (£5 students)"; "Invites Only" is no public price. */
export function gigPrice(raw: string | null): { free: boolean; from: number | null; to: number | null } {
  const p = (raw ?? '').trim();
  if (/^(free\b.*|0|£?0(\.00)?)$/i.test(p)) return { free: true, from: null, to: null };
  const pounds = [...p.matchAll(/£\s?(\d+(?:\.\d{1,2})?)/g)].map((m) => Math.round(Number(m[1]) * 100));
  if (!pounds.length) return { free: false, from: null, to: null };
  return { free: false, from: Math.min(...pounds), to: pounds.length > 1 ? Math.max(...pounds) : null };
}

/** Not a night at the pub: a carol service, a church concert, a market stall. */
const NOT_A_GIG = /\b(church|chapel|cathedral|messiah|carol service|market)\b/i;

/** "Trafalgar Pub, Charing Cross, St Aubin, Jersey JE3 8AA, Jersey": the street, the parish and the postcode. */
function address(raw: string | null, venue: string): { line: string | null; parish: string | null; postcode: string | null } {
  if (!raw) return { line: null, parish: null, postcode: null };
  const postcode = /\bJE\d\s?\d[A-Z]{2}\b/i.exec(raw)?.[0]?.toUpperCase() ?? null;
  const parts = raw
    .split(',')
    .map((p) => p.replace(/\bJE\d\s?\d[A-Z]{2}\b/i, '').replace(/\bJersey\b/gi, '').trim())
    .filter((p) => p && p.toLowerCase() !== venue.toLowerCase());
  const PARISHES = /^(st\.? (helier|aubin|brelade|clement|john|lawrence|martin|mary|ouen|peter|saviour)|grouville|trinity|gorey)$/i;
  const parish = parts.find((p) => PARISHES.test(p)) ?? null;
  const line = parts.filter((p) => p !== parish)[0] ?? null;
  return { line, parish, postcode };
}

/** "PARISH 13" as "Parish 13": a band typed in capitals, not an acronym. */
export function shout(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length <= 4 || letters !== letters.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

export function gigLink(id: string) {
  return `${WHATS_ON}/${id}`;
}

export function toEvent(g: Gig): VjEvent | null {
  if (g.status && g.status !== 'approved') return null;
  // A private party posted for the band's diary: not for the public.
  if (/invite/i.test(g.price ?? '')) return null;
  const start = gigTime(g.startTime);
  const dates: EventDate[] = [{ date: g.date, start, end: null }];
  const price = gigPrice(g.price);
  const where = address(g.address, g.venue);
  const genre = g.genre && !/^a bit of everything$/i.test(g.genre) ? g.genre : null;
  const notAGig = NOT_A_GIG.test(`${g.venue} ${g.bandName}`);
  const blurb = g.blurb && g.blurb.length > 3 ? g.blurb : null;
  const summary = blurb ?? `${g.bandName}${genre ? `, ${genre.toLowerCase()}` : ''}, live at ${g.venue}.`;
  return {
    externalId: g.id,
    // The band is the event; where it plays is the venue's line.
    title: shout(g.bandName),
    summary,
    description: [blurb, genre ? `Genre: ${genre}.` : null].filter(Boolean).join('\n\n') || null,
    venue: g.venue,
    venueName: g.venue,
    addressLine1: where.line,
    parish: where.parish,
    postcode: where.postcode,
    phone: null,
    email: null,
    website: g.ticketUrl,
    eventTypes: notAGig ? ['Music'] : start && start >= '18:00' ? ['Music', 'Nightlife'] : ['Music'],
    free: price.free,
    occurrence: 'one-off',
    lat: g.lat,
    lon: g.lng,
    dates,
    startsOn: g.date,
    endsOn: g.date,
    fromPricePence: price.from,
    toPricePence: price.to,
    headerImage: null,
    sourceLink: gigLink(g.id),
    // The band puts it on, not Gigz Hub: the page credits Gigz Hub as where it is listed (lib/domain/listed-by.ts).
    organiser: null,
    modifiedAt: null,
    portalSyncedAt: null,
  };
}
