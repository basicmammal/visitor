'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { GuideEvent, GuideVenue, VenueFrame } from '@/lib/domain/guide-entry';
import { EVENTS, Frame, HighlightBody, VenueBox, VenueFullBody, venueSection } from './book';

export type ProofSubject = { kind: 'venue'; venue: GuideVenue } | { kind: 'event'; event: GuideEvent };

/** How the words sit in their frame: they fit, or run over by about so many characters. */
export type Fit = { fits: true } | { fits: false; over: number };

const COPY = '.gp-venue-copy, .gp-highlight-copy, .gp-event-copy';

/**
 * Whether the frame overflows with the given words, measured on a copy of
 * the page laid out off screen, so the page the client sees is never
 * touched: how many characters must go, found by halving.
 */
function measure(page: HTMLElement, copy: string): Fit {
  const ghost = page.cloneNode(true) as HTMLElement;
  ghost.style.cssText += ';position:absolute;left:-10000px;top:0;visibility:hidden;';
  document.body.appendChild(ghost);
  try {
    const frame = ghost.querySelector<HTMLElement>('[data-measure]') ?? ghost.querySelector<HTMLElement>('.gp-content');
    const words = ghost.querySelector<HTMLElement>(COPY);
    if (!frame || !words) return { fits: true };
    const over = () => frame.scrollHeight > frame.clientHeight + 1;
    words.textContent = copy;
    if (!over()) return { fits: true };
    let lo = 0;
    let hi = copy.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      words.textContent = copy.slice(0, mid);
      if (over()) hi = mid - 1;
      else lo = mid;
    }
    return { fits: false, over: copy.length - lo };
  } finally {
    ghost.remove();
  }
}

/**
 * A client's entry as the edition prints it, on its page: a full-page
 * venue, a box at the size booked, or an event's highlight page, with the
 * words and picture as they stand in the editor. Reports whether the
 * words fit as they change.
 */
export function ProofPage({ subject, copy, picture, onFit }: { subject: ProofSubject; copy: string; picture: string; onFit: (f: Fit) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fonts, setFonts] = useState(false);
  useLayoutEffect(() => {
    void document.fonts.ready.then(() => setFonts(true));
  }, []);
  useLayoutEffect(() => {
    const page = ref.current?.querySelector<HTMLElement>('.gp-page');
    if (page) onFit(measure(page, copy));
  }, [copy, picture, fonts, onFit, subject]);

  let body: React.ReactNode;
  let section = EVENTS;
  if (subject.kind === 'event') {
    body = <HighlightBody e={{ ...subject.event, extendedCopy: copy, preview: picture }} />;
  } else {
    const v = { ...subject.venue, copy, options: [copy], preview: picture };
    section = venueSection(v.section);
    body =
      v.size === 'full' ? (
        <VenueFullBody v={v} />
      ) : (
        <div className="gp-content gp-grid gp-grid8 gp-venue-grid">
          <VenueBox c={{ ...v, frame: v.size as VenueFrame }} strict />
        </div>
      );
  }
  return (
    <div ref={ref} className="guide-proof">
      <Frame page={{ section, body }} n={1} />
    </div>
  );
}

/**
 * A venue's entry as the guide would set it from the words given: at the
 * size booked, or as a listing box on the grid of sixteen when nothing is
 * booked. The copy is fitted as the guide fits it, the fullest run of
 * whole sentences the frame takes; our editors write the printed words,
 * so this shows the shape, not the final wording.
 */
export function GuidePreview({ venue, picture }: { venue: GuideVenue; picture: string }) {
  const v = { ...venue, preview: picture };
  const section = venueSection(v.section);
  const body =
    v.size === 'full' ? (
      <VenueFullBody v={v} />
    ) : v.size === 'listing' || v.size === 'directory' ? (
      <div className="gp-content gp-grid gp-grid16 gp-venue-grid">
        <VenueBox c={{ ...v, frame: 'listing' }} />
      </div>
    ) : (
      <div className="gp-content gp-grid gp-grid8 gp-venue-grid">
        <VenueBox c={{ ...v, frame: v.size as VenueFrame }} />
      </div>
    );
  return (
    <div className="guide-proof">
      <Frame page={{ section, body }} n={1} />
    </div>
  );
}
