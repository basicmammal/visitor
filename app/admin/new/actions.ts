'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { places } from '@/lib/db/schema';
import { refreshSite } from '@/lib/refresh';

/** Feature a place in an edition's New this season, or take it out. */
export async function setNewIn(form: FormData) {
  await requireStaff();
  const id = z.string().uuid().parse(form.get('id'));
  const edition = String(form.get('edition') ?? '');
  const on = form.get('on') === '1';
  if (!/^(Spring|Summer|Autumn|Winter) \d{4}$/.test(edition)) return;
  await db.update(places).set({ newIn: on ? edition : null, updatedAt: new Date() }).where(eq(places.id, id));
  refreshSite();
  revalidatePath('/admin/new');
}
