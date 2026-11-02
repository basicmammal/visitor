'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** The client's admin, a tab a part: the one they are in marked. */
export function AccountTabs({ tabs }: { tabs: { href: string; label: string; match: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 text-sm" aria-label="Your account">
      {tabs.map((t) => {
        const on = path === t.match || path.startsWith(`${t.match}/`);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined} className={`rounded-full px-3 py-1.5 ${on ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
