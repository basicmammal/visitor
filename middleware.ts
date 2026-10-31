import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { isProtectedPath } from '@/lib/auth/public-paths';
import { typeFromSlug } from '@/lib/domain/landing';

const SESSION_PATHS = /^\/(admin|account|login|logout|auth|invite)(\/|$)/;

/** Pages with a Markdown version: the public site's sections and listings. */
const MARKDOWN_PATHS = /^\/($|whats-on(\/[^/]+)?$|tours(\/[^/]+)?$|venues(\/[^/]+)?$|organisers(\/[^/]+)?$|list$)/;

/** Asked for Markdown before HTML: an agent, not a browser. */
const wantsMarkdown = (accept: string | null) => {
  if (!accept) return false;
  const q = (type: string) => {
    const part = accept.split(',').map((p) => p.trim()).find((p) => p.split(';')[0] === type);
    if (!part) return -1;
    const m = /;\s*q=([\d.]+)/.exec(part);
    return m ? Number(m[1]) : 1;
  };
  return q('text/markdown') > Math.max(q('text/html'), -0.5);
};

/**
 * The public site for agents: /whats-on/x.md, or /whats-on/x asked
 * for as text/markdown, is the Markdown version; every HTML page says
 * where its Markdown is, in a Link header. No session, no database.
 */
function forAgents(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const asMd = path.endsWith('.md') ? (path === '/index.md' ? '/' : path.slice(0, -3)) : null;
  const page = asMd ?? path;
  if (!MARKDOWN_PATHS.test(page)) return NextResponse.next();
  if (asMd !== null || wantsMarkdown(request.headers.get('accept'))) {
    const url = request.nextUrl.clone();
    url.pathname = `/md${page === '/' ? '' : page}`;
    return NextResponse.rewrite(url);
  }
  const response = NextResponse.next();
  response.headers.set('Link', `<${page === '/' ? '/index' : page}.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"; type="text/markdown", </openapi.json>; rel="service-desc"; type="application/json"`);
  response.headers.set('Vary', 'Accept');
  return response;
}

/** A crawler, by its own say-so: search engines, AI agents, link previewers. */
const CRAWLER = /bot|crawl|spider|slurp|externalagent|externalhit|facebookcatalog|preview|scrape/i;

/**
 * Search is for people. Each query trawls the database afresh and the
 * result pages never end, so a crawler working through them can swamp
 * the site; robots.txt asks them not to, and this answers those that
 * ask anyway at once, without touching the database.
 */
const crawlingSearch = (request: NextRequest) =>
  /^\/search(\/|$)/.test(request.nextUrl.pathname) && CRAWLER.test(request.headers.get('user-agent') ?? '');

/**
 * Refreshes the Supabase session and sends anyone under /admin or
 * /account who is not signed in to /login. The public site needs no
 * session. Whether the person has an account here, and which role, is
 * checked by the pages: this runs at the edge, without the database.
 */
/**
 * A kind of event's page lives at /whats-on/music; it is built at
 * /whats-on/type/music. The short address is served from there, and the
 * long one leads to the short, so a page has one address.
 */
function kindPage(request: NextRequest) {
  const m = /^\/whats-on\/(type\/)?([a-z-]+)$/.exec(request.nextUrl.pathname);
  if (!m || !typeFromSlug(m[2]!)) return null;
  const url = request.nextUrl.clone();
  if (m[1]) {
    url.pathname = `/whats-on/${m[2]}`;
    return NextResponse.redirect(url, 308);
  }
  url.pathname = `/whats-on/type/${m[2]}`;
  return NextResponse.rewrite(url);
}

export async function middleware(request: NextRequest) {
  // A sign-in Supabase sent to the Site URL rather than back to us: finish it. (The front page is built ahead, so it cannot.)
  if (request.nextUrl.pathname === '/' && request.nextUrl.searchParams.has('code')) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    return NextResponse.redirect(url);
  }
  const kind = kindPage(request);
  if (kind) return kind;
  if (crawlingSearch(request)) {
    return new NextResponse('Search is for people: see /sitemap.xml for every page.', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400', 'x-robots-tag': 'noindex' },
    });
  }
  if (!SESSION_PATHS.test(request.nextUrl.pathname)) return forAgents(request);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Admin pages read the session; a cached one can show the wrong state.
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  return response;
}

// Only the editing side, a provider's pages and the sign-in flow need the session; the public
// pages pass through forAgents above. Assets, the API and the agent files skip middleware.
export const config = {
  matcher: ['/((?!_next/|api/|md/|mcp|\\.well-known/|favicon|guide/|.*\\.(?:svg|png|jpe?g|webp|ico|css|js|txt|xml|json)$).*)'],
};
