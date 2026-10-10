/**
 * Where the app downloads prayers from.
 *
 * These values come from eas.json (the "env" section of each build profile) or a local .env file.
 * The anon key is designed to be public: the database's row-level security rules decide what it can read.
 * When either value is missing the app runs in demo mode with the sample prayers bundled in assets/audio.
 */
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const AUDIO_BUCKET = 'prayer-audio';

export const isConfigured = SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;
