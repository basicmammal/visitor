'use client';

/** Saves the map's artwork as an SVG file, at size in millimetres, for InDesign or Illustrator. */
export function MapDownload({ target, name }: { target: string; name: string }) {
  const save = () => {
    const svg = document.querySelector(`#${target} svg.gp-map`);
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    // The page's typeface by name, since the SVG leaves the page's styles behind.
    clone.setAttribute('font-family', "'Proxima Nova Condensed', 'Barlow Semi Condensed', sans-serif");
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${clone.outerHTML}`], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <button type="button" onClick={save} className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">
      Map artwork (SVG)
    </button>
  );
}
