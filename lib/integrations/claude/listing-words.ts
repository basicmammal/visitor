import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '@/lib/env';

/**
 * A venue owner writes about their place as they like, in their own
 * words. From that Claude writes ours: the website's text in the guide's
 * third person, the one sentence a listing card shows, and the guide's
 * printed entry, shortened to the characters their space holds. Shown to
 * them as they write, and to staff, who have the last word.
 *
 * Never in the way: with no key, a refusal or any failure, null, and the
 * form falls back to cutting their words at a sentence.
 */

export type ListingWords = { website: string; card: string; print: string };

const SYSTEM = `You write listings for Visitor Guide, Jersey's official visitor guide, in British English.

A business has written about itself, often in the first person ("we", "our", "join us"). From what they wrote, produce three things, all in the third person, as the guide describing the place to a visitor: name the business or say "the shop", "the team" where they said "we".

website: their text as the guide's listing on its website. Keep every fact and roughly their length and paragraphs, separated by a blank line. Plain and warm, not salesy: no exclamation marks, no capitals for emphasis, no superlatives the text cannot back up. Fix spelling and repeated words.

card: one sentence of at most 25 words saying what the place is and why a visitor would go. Do not start with the place's name and do not end with an exclamation mark.

print: the entry printed in the guide, at most the number of characters given (spaces included), as whole sentences, ending with a full stop. Keep what a visitor most needs: what it is, what is special, any offer for visitors. The name, address, phone, website and opening hours are printed beside it: do not repeat them. Do not start with the place's name.

Use only what they wrote. Add nothing.`;

const SCHEMA = {
  type: 'object',
  properties: {
    website: { type: 'string', description: 'The website listing, third person, paragraphs separated by a blank line.' },
    card: { type: 'string', description: 'One sentence for the listing card, at most 25 words.' },
    print: { type: 'string', description: 'The printed entry, whole sentences, within the character limit.' },
  },
  required: ['website', 'card', 'print'],
  additionalProperties: false,
} as const;

const Result = z.object({ website: z.string().trim().min(1).max(6000), card: z.string().trim().min(1).max(600), print: z.string().trim().min(1).max(3000) });

let client: Anthropic | null = null;

export async function listingWords(input: { name: string; text: string; printMax: number }): Promise<ListingWords | null> {
  const text = input.text.trim();
  if (!env.ANTHROPIC_API_KEY || !text) return null;
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
  const max = Math.max(60, Math.min(2500, Math.round(input.printMax)));
  try {
    const message = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `A place called "${input.name}". The printed entry may be at most ${max} characters.\n\n<their-words>\n${text}\n</their-words>` }],
    });
    if (message.stop_reason !== 'end_turn') return null;
    const json = message.content.find((b) => b.type === 'text')?.text;
    const parsed = Result.safeParse(json ? JSON.parse(json) : null);
    if (!parsed.success) return null;
    // Held to the limit whatever came back: cut at the last whole sentence that fits.
    const print = parsed.data.print.length <= max ? parsed.data.print : (parsed.data.print.slice(0, max).match(/^.*[.!?](?=\s|$)/s)?.[0] ?? parsed.data.print.slice(0, max)).trim();
    return { ...parsed.data, print };
  } catch (e) {
    console.warn(`listing words for "${input.name}" failed: ${(e as Error).message}`);
    return null;
  }
}
