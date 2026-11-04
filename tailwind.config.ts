import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/view.ts'],
  theme: {
    extend: {
      fontFamily: {
        // The Jersey brand typefaces (docs/brand-guidelines.md): GT Flaire
        // Extra for headings, Google Sans Flex for everything else. GT Flaire
        // is licensed (Grilli Type): it is used where its files are present
        // (public/fonts, see app/globals.css), Google Sans Flex until then.
        display: ['"GT Flaire Extra"', '"Google Sans Flex Variable"', '"Google Sans Flex"', 'system-ui', 'sans-serif'],
        sans: ['"Google Sans Flex Variable"', '"Google Sans Flex"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // The public site: white, harbour navy, sea, and the logo's red for what to notice.
        harbour: '#0f2a44',
        // Headings: 80% grey.
        ink: '#333333',
        sea: '#1f6f8b',
        brand: '#cd1316',
      },
    },
  },
  plugins: [],
} satisfies Config;
