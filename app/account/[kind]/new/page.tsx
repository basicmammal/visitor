import { and, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireProvider } from '@/lib/auth/session';
import { JERSEY_PARISHES, kindFromPath } from '@/lib/account-paths';
import { ListingForm } from '@/components/account/listing-form';
import { formDefaults, formOptions } from '@/components/account/form-setup';
import type { FormDefaults } from '@/components/account/listing-form';
import { db } from '@/lib/db';
import { TABLES } from '@/lib/listings';

export const dynamic = 'force-dynamic';

const TITLE = { venue: 'Add a venue', event: 'Add an event', experience: 'Add a tour or experience' } as const;

/**
 * A new listing, blank or copied from one of the business's own
 * (?from=slug): the same event on new dates, the dates left for them.
 */
export default async function NewListingPage({ params, searchParams }: { params: Promise<{ kind: string }>; searchParams: Promise<{ from?: string }> }) {
  const kind = kindFromPath((await params).kind);
  if (!kind) notFound();
  const user = await requireProvider();
  const options = await formOptions(kind, user.businessId);
  const { from } = await searchParams;
  let copied: Record<string, unknown> | null = null;
  if (from && kind !== 'venue') {
    const table = TABLES[kind];
    [copied = null] = (await db.select().from(table).where(and(eq(table.slug, from), eq(table.businessId, user.businessId)))) as Record<string, unknown>[];
  }
  const defaults: FormDefaults = copied ? { ...formDefaults(kind, copied), dates: '' } : kind === 'venue' ? { category: 'see' } : {};
  return (
    <div className="space-y-4">
      <Link href={`/account/${(await params).kind}`} className="text-sm text-stone-500 hover:underline">← Back</Link>
      <h1 className="font-display text-3xl">{TITLE[kind]}</h1>
      <p className="max-w-2xl text-sm text-stone-600">
        {copied ? <>Copied from <strong>{String(copied.title)}</strong>: add the new dates, and change anything that is different this time. </> : null}
        We check every new listing before it goes on the site. You can keep editing it until then.
      </p>
      <ListingForm kind={kind} defaults={defaults} options={options} parishes={JERSEY_PARISHES} submitLabel="Send for review" />
    </div>
  );
}
