import { createHash } from 'node:crypto';
import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, experiences } from '@/lib/db/schema';
import { printLines } from './print-line';

/** Which words a snippet was written from, and to which brief: a new one only when either changes. */
const BRIEF = 'snippet-2';
export const lineKey = (e: { title: string; summary: string | null; description: string | null }) =>
  createHash('sha1').update([BRIEF, e.title, e.summary ?? '', e.description ?? ''].join('\u0000')).digest('hex');

/**
 * After the day's import, every public event still to come gets its
 * print line, or a new one if its words have changed since. One a
 * person has written (a locked field) is left alone.
 */
export async function fillPrintLines(): Promise<{ written: number; wanted: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ id: events.id, title: events.title, summary: events.summary, description: events.description, printLineKey: events.printLineKey })
    .from(events)
    .where(and(gte(events.endsOn, today), eq(events.review, 'approved'), ne(events.inclusion, 'excluded'), sql`not ('printLine' = any(${events.lockedFields}))`));
  const todo = rows.filter((r) => (r.summary || r.description) && r.printLineKey !== lineKey(r));
  const lines = await printLines(todo);
  for (const r of todo) {
    const line = lines.get(r.id);
    if (line) await db.update(events).set({ printLine: line, printLineKey: lineKey(r) }).where(eq(events.id, r.id));
  }
  return { written: lines.size, wanted: todo.length };
}

/**
 * The same for tours and experiences: every one in the guide or eligible
 * for it gets a snippet for the small boxes of the tour grid, or a new one
 * if its words have changed. One a person has written is left alone.
 */
export async function fillTourLines(): Promise<{ written: number; wanted: number }> {
  const rows = await db
    .select({ id: experiences.id, title: experiences.title, summary: experiences.summary, description: experiences.description, printLineKey: experiences.printLineKey })
    .from(experiences)
    .where(and(eq(experiences.review, 'approved'), ne(experiences.inclusion, 'excluded'), sql`not ('printLine' = any(${experiences.lockedFields}))`));
  const todo = rows.filter((r) => (r.summary || r.description) && r.printLineKey !== lineKey(r));
  const lines = await printLines(todo, 'tour');
  for (const r of todo) {
    const line = lines.get(r.id);
    if (line) await db.update(experiences).set({ printLine: line, printLineKey: lineKey(r) }).where(eq(experiences.id, r.id));
  }
  return { written: lines.size, wanted: todo.length };
}
