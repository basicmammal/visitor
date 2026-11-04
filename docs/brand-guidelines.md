# The Visitor Guide: brand guidelines

How the printed Visitor Guide and guide.je follow the **Jersey Brand Guidelines** (Visit Jersey, 2026).
Theirs set the brand; this sets how the guide applies it. Where the two differ, the guide's format
(a 115 × 165mm pocket book full of small listings) is the reason, and the difference is noted.

The code follows this file: `lib/domain/guide-colours.ts` (colours), `app/globals.css` (print
and site type), `tailwind.config.ts` (site type), `components/guide/maps.tsx` (maps).

## Type

| Use | Jersey | The guide, print | guide.je |
|---|---|---|---|
| Headlines, section and index headings | GT Flaire Extra Regular | GT Flaire Extra Regular | GT Flaire Extra Regular |
| Taglines (opener pages) | GT Flaire Extra, uppercase | the same | the same |
| Body copy | Google Sans Flex Light | Google Sans Flex Light, 87.5% width | Google Sans Flex Light |
| Picking things out (names, dates, labels) | Google Sans Flex Medium | Medium; never bold | Medium |

- **GT Flaire never sets body copy**, and only comes in Regular: never bold, never faked bold.
- Headline line height 110%, letter spacing 0. Body line height 140% on the site and in longer copy
  (highlights, full-page venues). **Print exception:** listing boxes and directory lines are set at
  104–120% to fit the grid, as the guide always has been.
- **Print exception:** the guide's copy is Google Sans Flex at 87.5% width (its width axis), which
  keeps a listing box's words in its box the way the old condensed face did. Headlines stay normal width.
- **Licences:** Google Sans Flex is free (SIL Open Font License); the site serves it itself.
  GT Flaire Extra is Grilli Type's and needs a desktop licence for InDesign and a web licence for
  guide.je. Until the web files are in `public/fonts` (see `app/globals.css`), guide.je and the
  proofs set headings in Google Sans Flex. They use GT Flaire wherever it is installed.

## Colour

The Jersey palette, as the guidelines give it. CMYK is converted from RGB: **confirm it with Visit
Jersey or the printer before press.**

| Colour | Hex | RGB | CMYK (converted) | In the guide |
|---|---|---|---|---|
| Sand | `#F4F2DC` | 244 242 220 | 0 1 10 4 | Map land; panels behind text |
| Light blue | `#A4FEFF` | 164 254 255 | 36 0 0 0 | Map pages' tab; the sea, tinted |
| Green | `#A4C43C` | 164 196 60 | 16 0 69 23 | **Eat**; tour markers; map green spaces |
| Orange | `#F64E16` | 246 78 22 | 0 68 91 4 | **What's On**, **New this season**; main roads |
| Deep blue | `#022E3C` | 2 46 60 | 97 23 0 76 | **All text**; **Do**; folios |
| Blue | `#2A55EB` | 42 85 235 | 82 64 0 8 | **Visit** |
| Dark green | `#1D521E` | 29 82 30 | 65 0 63 68 | **Walks and tours** |
| Maroon | `#61140C` | 97 20 12 | 0 79 88 62 | **Buy** |

**Primary pairings** (Jersey's two lead combinations, for covers, openers and adverts): blue with
light blue; green with dark green.

### Rules for colour

1. **Text is deep blue, or white on a dark colour.** No text in orange, green, blue or the rest,
   however small. Section colour goes on the tab, the rules, the chips and the markers, not on names.
2. On a coloured tab or chip, the type is white on blue, dark green, maroon and deep blue, and deep
   blue on light blue, green, orange and sand (`onColour` in the code works this out).
3. Light blue and sand are backgrounds only: as rules or type on white paper they disappear.
4. Tints (for chips and second tabs) are the section colour at 20% and 60%, as before.

## The guide's sections

| Section | Colour | Tab type |
|---|---|---|
| What's On (events) | Orange | Deep blue |
| Walks and tours | Dark green (rules), green (markers) | White |
| New this season | Orange | Deep blue |
| Visit | Blue | White |
| Eat | Green | Deep blue |
| Do | Deep blue | White |
| Buy | Maroon | White |
| Maps | Light blue | Deep blue |

## Maps

Drawn from OpenStreetMap in the palette: sand land, light blue sea (45% tint), green spaces in
green tints, the National Park in green with a dark green dashed edge, main roads orange cased in
maroon, place names in deep blue. Index markers by category: Attractions orange, Heritage & culture
maroon, Shopping blue, Restaurants dark green, Activity deep blue, Pubs green (St Helier: Bars
orange, Coffee & cakes green, Activity & travel deep blue). Index headings in GT Flaire with a rule in
the category's colour. Credit: "Map data © OpenStreetMap contributors".

## Layout and imagery

- Keep each page to a few things, with room around them; let headlines be large.
- Photography shows the experience: close, bright, candid ("proximity over observation").
- Illustration (Jersey's library) adds personality on openers and covers; never as icons for
  activities. The guide's small key icons are UI icons, kept for function only.
- The Jersey logo: top left, or bottom left when it is the only brand; top left with partners.
  Minimum 30mm wide in print, clear space of two "J"s.

## What changed from the 2026 editions

- Type: Proxima Nova and Proxima Nova Condensed become Google Sans Flex and GT Flaire Extra.
- Bold becomes Medium throughout.
- Names, titles and prices are no longer printed in the section colour, but in deep blue.
- Section colours: Visit teal becomes blue; Eat field green becomes Jersey green; Do midnight blue
  becomes deep blue; Buy plum becomes maroon; events orange becomes Jersey orange; tours green
  becomes dark green.
- Black (folios, captions) becomes deep blue.
