import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const AUDIO_BUCKET = 'prayer-audio';
export const isConfigured = url.startsWith('https://') && anonKey.length > 20;
const isWeb = Platform.OS === 'web';

/**
 * On the web, an invitation or password link lands here with details in the address (#type=invite…).
 * Read them before the Supabase client consumes and clears them.
 */
function readAuthLink(): { type: string | null; error: string | null } {
  if (!isWeb || typeof window === 'undefined') return { type: null, error: null };
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return {
    type: params.get('type'),
    error: params.get('error_description') ?? query.get('error_description'),
  };
}
export const authLink = readAuthLink();

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        storage: isWeb ? undefined : AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: isWeb,
      },
    })
  : null;

export type PrayerStatus = 'pending' | 'approved' | 'rejected';

export type PrayerRow = {
  id: string;
  prayer_date: string;
  title: string;
  theme: string;
  description: string;
  audio_path: string;
  duration_sec: number | null;
  published: boolean;
  status: PrayerStatus;
  created_by: string | null;
  review_note: string;
  reviewed_at: string | null;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'warrior';
  status: 'active' | 'removed';
  assigned_days: number[];
};

export type Teammate = { id: string; full_name: string; assigned_days: number[] };

export function publicAudioUrl(path: string): string {
  return supabase!.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Turns database and network errors into plain language. */
export function friendlyError(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/row-level security|violates|permission denied/i.test(message)) {
    return 'This day is no longer available to you. Someone else may have just posted it, or it was assigned to another Prayer Warrior.';
  }
  if (/duplicate key/i.test(message)) return 'Another prayer was just posted for this day.';
  if (/banned/i.test(message)) return 'Your access has been removed. Contact your administrator.';
  if (/Invalid login credentials/i.test(message)) return 'That email and password don’t match.';
  if (/Failed to fetch|Network request failed/i.test(message)) return 'No internet connection. Check your connection and try again.';
  if (/exceeded the maximum allowed size|Payload too large/i.test(message)) return 'That audio file is too large. The limit is 50 MB.';
  if (/mime type .* is not supported/i.test(message)) return 'That audio format isn’t supported. Use MP3, M4A, WAV or AAC.';
  return message;
}
