import { SITE } from '@/lib/agents/data';

/**
 * Everyone welcome on the public site, the AI search and answer engines by
 * name, so a rule meant for one never reads as a ban on the rest. The
 * editing side and the sign-in flow are nobody's business. Content
 * Signals (contentsignals.org) say what the words may be used for: search,
 * answers that cite us, and training, since being known is the point.
 */
// The Google reviews endpoint costs a call to Google each time: for people, not crawlers. So does
// search: every query is a fresh trawl of the database, and its result pages never end.
const PRIVATE = ['/search', '/proof/', '/admin', '/account', '/login', '/logout', '/auth/', '/invite/', '/claim/', '/api/google-reviews/', '/subscribe/confirm/', '/subscribe/leave/', '/api/unsubscribe'];

// The listings' filters (dates, kinds, venue, a search) make endless addresses for the same events;
// each filtered page names the plain one as canonical, and crawlers are asked to keep to that.
const FILTERED = ['/whats-on?', '/tours?', '/venues?'];

const AI_AGENTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'Amazonbot', 'meta-externalagent', 'MistralAI-User', 'DuckAssistBot', 'cohere-ai',
];

export function GET() {
  const group = (agents: string[]) => [
    ...agents.map((a) => `User-agent: ${a}`),
    'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
    'Allow: /',
    ...PRIVATE.map((p) => `Disallow: ${p}`),
    ...FILTERED.map((p) => `Disallow: ${p}`),
  ];
  const body = [
    `# ${SITE}: Jersey’s What’s On Guide. For agents: ${SITE}/llms.txt`,
    '',
    ...group(['*']),
    '',
    ...group(AI_AGENTS),
    '',
    `Sitemap: ${SITE}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
