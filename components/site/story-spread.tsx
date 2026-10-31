import Link from 'next/link';
import type { Image } from '@/lib/db/schema';
import { webImage } from '@/lib/domain/images';

/** One story on the front page: what kind of thing it is (leading to more of them), its headline, when and where, and a line or two. */
export type Story = { key: string; kicker: string; kickerHref: string; title: string; href: string; meta: string | null; blurb: string | null; image: Image };

function Picture({ image, w, h, className, eager }: { image: Image; w: number; h: number; className: string; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={webImage(image, w, h)} alt={image.alt ?? ''} loading={eager ? 'eager' : 'lazy'} className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.02] ${className}`} />
  );
}

function Kicker({ s }: { s: Story }) {
  return (
    <Link href={s.kickerHref} className="text-xs font-semibold uppercase tracking-[0.18em] text-brand hover:underline">
      {s.kicker}
    </Link>
  );
}

/** The lead: a big picture, the headline large, and its standfirst. */
function Lead({ s }: { s: Story }) {
  return (
    <article className="group">
      <Link href={s.href} className="block overflow-hidden rounded-lg">
        <div className="aspect-[4/3] overflow-hidden lg:aspect-[16/11]">
          <Picture image={s.image} w={1200} h={825} className="" eager />
        </div>
      </Link>
      <div className="mt-4">
        <Kicker s={s} />
        <h3 className="mt-1 font-display text-3xl font-semibold leading-tight text-ink lg:text-4xl">
          <Link href={s.href} className="hover:text-brand">{s.title}</Link>
        </h3>
        {s.meta && <p className="mt-2 text-sm font-medium text-sea">{s.meta}</p>}
        {s.blurb && <p className="mt-3 max-w-prose text-lg leading-relaxed text-harbour/80">{s.blurb}</p>}
      </div>
    </article>
  );
}

/** Beside the lead: a picture to one side, the words to the other. */
function Side({ s }: { s: Story }) {
  return (
    <article className="group grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
      <Link href={s.href} className="block aspect-square overflow-hidden rounded-lg">
        <Picture image={s.image} w={480} h={480} className="" />
      </Link>
      <div>
        <Kicker s={s} />
        <h3 className="mt-1 font-display text-xl font-semibold leading-snug text-ink">
          <Link href={s.href} className="hover:text-brand">{s.title}</Link>
        </h3>
        {s.meta && <p className="mt-1 text-sm text-sea">{s.meta}</p>}
        {s.blurb && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-harbour/75">{s.blurb}</p>}
      </div>
    </article>
  );
}

/** In the row beneath: a picture above, a short headline and a line. */
function Card({ s }: { s: Story }) {
  return (
    <article className="group">
      <Link href={s.href} className="block aspect-[3/2] overflow-hidden rounded-lg">
        <Picture image={s.image} w={640} h={427} className="" />
      </Link>
      <div className="mt-3">
        <Kicker s={s} />
        <h3 className="mt-1 font-display text-lg font-semibold leading-snug text-ink">
          <Link href={s.href} className="hover:text-brand">{s.title}</Link>
        </h3>
        {s.meta && <p className="mt-1 text-sm text-sea">{s.meta}</p>}
        {s.blurb && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-harbour/75">{s.blurb}</p>}
      </div>
    </article>
  );
}

/**
 * A spread of stories, laid out as a magazine's: the first as the lead
 * with two beside it, the rest in a row beneath; or, with `cards`, all in
 * a row. A heading, a word on it, and the way to everything of its kind.
 */
export function StorySpread(props: { title: string; intro?: string; more: { label: string; href: string }; stories: Story[]; cards?: boolean; children?: React.ReactNode }) {
  if (!props.stories.length) return null;
  const [lead, ...rest] = props.stories;
  const side = props.cards ? [] : rest.slice(0, 2);
  const row = props.cards ? props.stories : rest.slice(2);
  return (
    <section className="mb-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-harbour/15 pb-3">
        <div>
          <h2 className="font-display text-3xl font-semibold text-ink">{props.title}</h2>
          {props.intro && <p className="mt-1 text-harbour/65">{props.intro}</p>}
        </div>
        <Link href={props.more.href} className="text-sm font-medium text-sea hover:text-brand">{props.more.label} →</Link>
      </div>
      {props.children}
      {!props.cards && lead && (
        <div className="mb-10 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Lead s={lead} />
          </div>
          {side.length > 0 && (
            <div className="flex flex-col gap-8 lg:col-span-5">
              {side.map((s) => <Side key={s.key} s={s} />)}
            </div>
          )}
        </div>
      )}
      {row.length > 0 && <div className={`grid gap-8 sm:grid-cols-2 ${row.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>{row.map((s) => <Card key={s.key} s={s} />)}</div>}
    </section>
  );
}
