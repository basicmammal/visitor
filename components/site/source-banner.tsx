import { publicSourceCounts } from '@/lib/db/public';
import { busiestSources } from '@/lib/domain/listing-sources';

/**
 * Where the listings come from: the busiest sources' logos, greyed out
 * and linking to each, under What's on. Each logo is drawn as a flat grey
 * shape, whatever its own colours (Gigz Hub's is made for a dark
 * background), and comes up a little on hover. A source with no logo file
 * yet shows its name in the same grey.
 */
export async function SourceBanner({ className = '' }: { className?: string }) {
  let sources: ReturnType<typeof busiestSources> = [];
  try {
    sources = busiestSources(await publicSourceCounts());
  } catch {
    // The banner is a credit, not the page: without the counts, no banner.
    return null;
  }
  if (sources.length < 2) return null;
  return (
    <section aria-labelledby="sources-heading" className={`border-t border-harbour/10 pt-8 ${className}`}>
      <h2 id="sources-heading" className="text-center text-xs font-medium uppercase tracking-[0.2em] text-harbour/50">
        Listings from
      </h2>
      <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {sources.map((s) => (
          <li key={s.source}>
            <a
              href={s.href}
              target="_blank"
              rel="noopener"
              title={`${s.name}: ${s.events} event${s.events === 1 ? '' : 's'} on the guide`}
              className="block opacity-40 grayscale transition-opacity hover:opacity-75 focus-visible:opacity-75"
            >
              {s.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo.src} alt={s.name} width={s.logo.width} height={s.logo.height} loading="lazy" className="h-7 w-auto brightness-0" />
              ) : (
                <span className="font-display text-lg leading-7 text-harbour">{s.name}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
