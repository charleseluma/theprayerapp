import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import { AUDIO_BUCKET, SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from '../config';
import { DEMO_PRAYERS } from './demo';
import { buildWeek, weekDates, type Prayer, type WeekDay } from './week';

export type WeekResult = {
  days: WeekDay[]; // this week
  lastWeek: WeekDay[]; // the week before
  source: 'online' | 'saved' | 'demo';
};

type PrayerRow = {
  prayer_date: string;
  title: string;
  theme: string;
  description: string;
  audio_path: string;
};

const canCache = Platform.OS !== 'web';
const REQUEST_TIMEOUT_MS = 12000;

function audioUrl(path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${encoded}`;
}

// ─── Saved copy on the device ─────────────────────────────────────────────────

function cacheDir(): Directory {
  const dir = new Directory(Paths.document, 'prayers');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function manifestFile(): File {
  return new File(cacheDir(), 'week.json');
}

function localAudioFile(path: string): File {
  return new File(cacheDir(), path.replace(/[^A-Za-z0-9._-]/g, '_'));
}

async function readSavedRows(): Promise<PrayerRow[]> {
  if (!canCache) return [];
  try {
    const file = manifestFile();
    if (!file.exists) return [];
    const rows = JSON.parse(await file.text());
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function saveRows(rows: PrayerRow[]) {
  if (!canCache) return;
  try {
    const file = manifestFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(rows));
  } catch {
    // Saving is best effort; the app still works online.
  }
}

/** Download this week's audio in the background and remove files from earlier weeks. */
async function syncAudio(rows: PrayerRow[]) {
  if (!canCache) return;
  const keep = new Set<string>(['week.json']);
  for (const row of rows) {
    const target = localAudioFile(row.audio_path);
    keep.add(target.name);
    if (target.exists && (target.size ?? 0) > 0) continue;
    try {
      const temp = new File(cacheDir(), `${target.name}.part`);
      if (temp.exists) temp.delete();
      await File.downloadFileAsync(audioUrl(row.audio_path), temp);
      temp.move(target);
    } catch {
      // Try again next time the app opens.
    }
  }
  try {
    for (const entry of cacheDir().list()) {
      if (entry instanceof File && !keep.has(entry.name)) entry.delete();
    }
  } catch {
    // Ignore cleanup failures.
  }
}

function toPrayer(row: PrayerRow): Prayer {
  let uri = audioUrl(row.audio_path);
  if (canCache) {
    const local = localAudioFile(row.audio_path);
    if (local.exists && (local.size ?? 0) > 0) uri = local.uri;
  }
  return { title: row.title, theme: row.theme, description: row.description, audio: { uri } };
}

function rowsToWeeks(now: Date, rows: PrayerRow[]): Pick<WeekResult, 'days' | 'lastWeek'> {
  const byDate = new Map(rows.map((r) => [r.prayer_date, toPrayer(r)]));
  return { days: buildWeek(now, byDate), lastWeek: buildWeek(now, byDate, -1) };
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function fetchRows(now: Date): Promise<PrayerRow[]> {
  const first = weekDates(now, -1)[0]; // last week's Sunday
  const last = weekDates(now)[6]; // this week's Saturday
  const params = new URLSearchParams({
    select: 'prayer_date,title,theme,description,audio_path',
    order: 'prayer_date.asc',
  });
  params.append('prayer_date', `gte.${first}`);
  params.append('prayer_date', `lte.${last}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // Legacy "anon" keys are JWTs and also go in Authorization; newer "publishable" keys go in apikey only.
    const headers: Record<string, string> = { apikey: SUPABASE_ANON_KEY };
    if (SUPABASE_ANON_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/prayers?${params}`, {
      headers,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Prayer service returned ${res.status}`);
    return (await res.json()) as PrayerRow[];
  } finally {
    clearTimeout(timer);
  }
}

export async function loadWeek(now = new Date()): Promise<WeekResult> {
  if (!isConfigured) {
    const demo = new Map<string, Prayer>([
      ...weekDates(now, -1).map((date, i) => [date, DEMO_PRAYERS[i]] as const),
      ...weekDates(now).map((date, i) => [date, DEMO_PRAYERS[i]] as const),
    ]);
    return { days: buildWeek(now, demo), lastWeek: buildWeek(now, demo, -1), source: 'demo' };
  }

  try {
    const rows = await fetchRows(now);
    saveRows(rows);
    syncAudio(rows); // runs in the background
    return { ...rowsToWeeks(now, rows), source: 'online' };
  } catch (error) {
    const saved = await readSavedRows();
    if (saved.length === 0) throw error;
    return { ...rowsToWeeks(now, saved), source: 'saved' };
  }
}
