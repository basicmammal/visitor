'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/** A choice in force, shown above the results: its words, and the address without it. */
export type ActiveChip = { label: string; href: string };

/**
 * The filters, the same on every listing and on search: a Filters button
 * and the choices in force, as chips that each take theirs away, sit above
 * the results; the filters themselves slide in from the side, at any
 * width, so the results start at the top of the page rather than under a
 * long menu.
 *
 * Picking a day, a kind or a category changes the page underneath without
 * closing the panel, so the visitor sees the new count and picks again.
 * The footer button shows the results, applying a typed word or chosen
 * dates first.
 */
export function FilterPane(props: {
  children: React.ReactNode;
  active: number;
  results: number;
  noun: string;
  /** The choices in force, each removable. */
  chips?: ActiveChip[];
  /** Where Clear all leads: the listing with nothing chosen. */
  clear?: string;
  /** Beside the count: the view switch. */
  aside?: React.ReactNode;
  /** The panel's name and its button's: Filters, or Search. */
  title?: string;
  /** The whole screen on a phone, not a drawer. */
  full?: boolean;
  /** Open as the page loads: the search, before anything is asked. */
  startOpen?: boolean;
  /** The footer button's words in place of "Show 12 events": the search's "Search" before anything is asked. */
  button?: string;
}) {
  const title = props.title ?? 'Filters';
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (props.startOpen) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While open: Escape closes, the page behind does not scroll, and focus starts in the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };
  // The footer button applies what the form says but the page does not yet show (a word typed, dates chosen), then closes.
  const settled = (p: URLSearchParams) =>
    [...p.entries()]
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('&');
  const show = () => {
    const f = panel.current?.querySelector('form');
    if (f && settled(new URLSearchParams(new FormData(f) as unknown as Record<string, string>)) !== settled(new URLSearchParams(window.location.search))) f.requestSubmit();
    close();
  };
  const what = `${props.results} ${props.results === 1 ? props.noun.replace(/s$/, '') : props.noun}`;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="filter-pane"
          className="inline-flex items-center gap-2 rounded-full bg-harbour px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sea"
        >
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          {title}
          {props.active > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[0.7rem] text-harbour">{props.active}</span>}
        </button>
        {(props.chips ?? []).map((c) => (
          <Link
            key={c.label + c.href}
            href={c.href}
            scroll={false}
            rel="nofollow"
            className="inline-flex items-center gap-1 rounded-full bg-white py-1.5 pl-3 pr-2 text-sm text-ink ring-1 ring-harbour/15 hover:ring-brand/50"
          >
            {c.label}
            <X aria-label="Remove" className="h-3.5 w-3.5 text-harbour/60" strokeWidth={2.5} />
          </Link>
        ))}
        {props.clear && (props.chips?.length ?? 0) > 1 && (
          <Link href={props.clear} scroll={false} className="px-1 text-sm text-harbour/60 underline">Clear all</Link>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-harbour/60">{what}</span>
          {props.aside}
        </div>
      </div>

      <div aria-hidden="true" onClick={close} className={`fixed inset-0 z-40 bg-harbour/40 transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />

      <div
        id="filter-pane"
        ref={panel}
        role="dialog"
        aria-modal={open ? true : undefined}
        aria-label={title}
        tabIndex={-1}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex flex-col bg-white outline-none transition-transform duration-300 ease-out ${props.full ? 'w-full sm:w-[min(30rem,92vw)]' : 'w-[min(30rem,92vw)]'} ${open ? 'shadow-2xl' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-harbour/10 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={close} aria-label={`Close ${title.toLowerCase()}`} className="rounded-full p-2 text-harbour hover:bg-harbour/5 hover:text-brand">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{props.children}</div>
        <div className="border-t border-harbour/10 p-4">
          <button type="button" onClick={show} className="w-full rounded-full bg-harbour px-4 py-3 text-sm font-semibold text-white hover:bg-sea">
            {props.button ?? `Show ${what}`}
          </button>
        </div>
      </div>
    </>
  );
}
