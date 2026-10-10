import type { AudioSource } from 'expo-audio';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type Prayer = {
  title: string;
  theme: string;
  description: string;
  audio: AudioSource;
};

/** One day of the current week (Sunday to Saturday, in the listener's own time zone). */
export type WeekDay = {
  date: string; // YYYY-MM-DD
  index: number; // 0 = Sunday
  day: string;
  short: string;
  isToday: boolean;
  isFuture: boolean;
  prayer: Prayer | null; // null = not posted yet
};

/** YYYY-MM-DD in the device's local time zone. */
export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The seven dates of the week containing `now`, Sunday first. */
export function weekDates(now: Date): string[] {
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return Array.from({ length: 7 }, (_, i) =>
    localISODate(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i)),
  );
}

export function buildWeek(now: Date, prayersByDate: Map<string, Prayer>): WeekDay[] {
  const today = localISODate(now);
  return weekDates(now).map((date, index) => ({
    date,
    index,
    day: DAY_NAMES[index],
    short: DAY_SHORT[index],
    isToday: date === today,
    isFuture: date > today,
    // Never show a prayer before its day arrives, even if it was posted early.
    prayer: date > today ? null : prayersByDate.get(date) ?? null,
  }));
}
