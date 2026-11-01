import Link from 'next/link';
import { SiteHeader } from '@/components/site/site-header';
import { Wordmark } from '@/components/site/wordmark';
import { FooterSignup } from '@/components/site/footer-signup';
import { emailEnabled } from '@/lib/email/send';

/** The public site: what visitors see. No sign-in, no editing. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-harbour">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="mt-16 border-t border-harbour/10 bg-white text-sm text-stone-500">
        {/* Not while nothing could send its confirmation. */}
        {emailEnabled() && <FooterSignup />}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8">
          <div className="flex items-center gap-4">
            <Wordmark tone="grey" size="footer" />
            <p>Published by Factory with Visit Jersey.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/list" className="font-medium text-harbour hover:text-brand">List your venue, event or tour</Link>
            <p>Check with the organiser before you travel.</p>
            {/* For staff and listing owners: sign-in sends each to their own home, the superadmin to the admin. */}
            <Link href="/login" rel="nofollow" className="text-stone-400 hover:text-harbour">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
