import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const AUDIO_BUCKET = 'prayer-audio';
export const isConfigured = url.startsWith('https://') && anonKey.length > 20;

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export type PrayerRow = {
  id: string;
  prayer_date: string;
  title: string;
  theme: string;
  description: string;
  audio_path: string;
  duration_sec: number | null;
  published: boolean;
  updated_at: string;
};

export function publicAudioUrl(path: string): string {
  return supabase!.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
}
