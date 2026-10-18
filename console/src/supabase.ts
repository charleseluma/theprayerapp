import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Where invitation and new-password links send Prayer Warriors (the web version of their app). */
export const WARRIORS_URL = (process.env.EXPO_PUBLIC_WARRIORS_URL ?? 'https://prayer-uploads-charleseluma.expo.app').replace(/\/+$/, '');

export const AUDIO_BUCKET = 'prayer-audio';
export const isConfigured = url.startsWith('https://') && anonKey.length > 20;

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
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
  status: 'pending' | 'approved' | 'rejected';
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'warrior';
  status: 'active' | 'removed';
  assigned_days: number[];
  created_at: string;
  removed_at: string | null;
  last_sign_in_at: string | null;
  approval: 'pending' | 'approved' | 'declined';
  decline_reason: string;
  email_confirmed: boolean;
  approved_at: string | null;
  phone: string;
  church: string;
  referred_by: string;
  about: string;
};

export type Activity = {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  prayer_date: string | null;
  subject_id: string | null;
  subject_name: string;
  details: string;
};

export function publicAudioUrl(path: string): string {
  return supabase!.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Calls the account service (invite, resend_link, remove, restore). */
export async function teamAdmin<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('team-admin', { body: { redirect_to: WARRIORS_URL, ...body } });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') message = (await ctx.json()).error ?? message;
    } catch {
      // keep the generic message
    }
    if (/Failed to send a request|Failed to fetch/i.test(message)) {
      message = 'The account service isn’t reachable. It may not be deployed yet; see the setup guide.';
    }
    throw new Error(message);
  }
  return data as T;
}

export function friendlyError(message: string | undefined): string {
  if (!message) return 'Something went wrong. Please try again.';
  if (/Invalid login credentials/i.test(message)) return 'That email and password don’t match.';
  if (/Failed to fetch|Network request failed/i.test(message)) return 'No internet connection. Check your connection and try again.';
  return message;
}
