// Mirrors the database rules so the week board can show what each day allows.
// The database enforces the same rules; this only decides what to display.
import { fromIso } from './dates';
import type { PrayerRow, Teammate } from './supabase';

export type DayState =
  | { kind: 'mine'; row: PrayerRow }
  | { kind: 'taken'; row: PrayerRow; by: string }
  | { kind: 'reserved'; by: string } // assigned to someone else, still empty
  | { kind: 'yours' } // assigned to me, still empty
  | { kind: 'open' } // not assigned to anyone, still empty
  | { kind: 'past' }; // empty and too late to post

export function dayState(date: string, today: string, me: string, row: PrayerRow | undefined, team: Teammate[]): DayState {
  const nameOf = (id: string | null) => team.find((m) => m.id === id)?.full_name || 'another Prayer Warrior';
  if (row) {
    return row.created_by === me ? { kind: 'mine', row } : { kind: 'taken', row, by: nameOf(row.created_by) };
  }
  if (date < today) return { kind: 'past' };
  const dow = fromIso(date).getDay();
  const assignees = team.filter((m) => m.assigned_days.includes(dow));
  if (assignees.some((m) => m.id === me)) return { kind: 'yours' };
  if (assignees.length > 0) return { kind: 'reserved', by: assignees.map((m) => m.full_name || 'another Prayer Warrior').join(' & ') };
  return { kind: 'open' };
}

export function canOpen(state: DayState): boolean {
  return state.kind === 'mine' || state.kind === 'yours' || state.kind === 'open';
}

export function statusLabel(row: PrayerRow): { label: string; tone: 'good' | 'warn' | 'danger' | 'neutral' } {
  if (row.status === 'pending') return { label: 'Waiting for review', tone: 'warn' };
  if (row.status === 'rejected') return { label: 'Needs changes', tone: 'danger' };
  if (!row.published) return { label: 'Hidden', tone: 'neutral' };
  return { label: 'Approved', tone: 'good' };
}
