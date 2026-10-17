// Account service for the Admin Console.
// Runs on Supabase (Deno) with the service role, which is the only way to create, block and
// restore sign-ins. Every request must come from a signed-in, active administrator.
//
// Actions (POST JSON):
//   { action: "invite",      email, full_name, assigned_days?, redirect_to? } → { link, profile }
//   { action: "resend_link", user_id, redirect_to? }                         → { link }
//   { action: "remove",      user_id }                                        → { profile }
//   { action: "restore",     user_id }                                        → { profile }
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BAN_FOREVER = '876000h'; // 100 years
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const single = Deno.env.get('SUPABASE_SECRET_KEY');
  if (single) return single;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const first = Object.values(keys)[0];
    if (typeof first === 'string') return first;
  } catch {
    // fall through
  }
  throw new Error('No service key is available to the function.');
}

function cleanDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who is calling?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller } = await db.auth.getUser(token);
  if (!caller?.user) return reply(401, { error: 'Please sign in again.' });

  const { data: me } = await db.from('profiles').select('*').eq('id', caller.user.id).maybeSingle();
  if (!me || me.role !== 'admin' || me.status !== 'active') {
    return reply(403, { error: 'Only administrators can manage Prayer Warriors.' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'The request was not valid.' });
  }

  const log = (action: string, subject: { id: string; full_name: string; email: string }, details = '') =>
    db.from('activity').insert({
      actor_id: me.id,
      actor_name: me.full_name || me.email,
      actor_role: 'admin',
      action,
      subject_id: subject.id,
      subject_name: subject.full_name || subject.email,
      details,
    });

  const redirectTo = typeof body.redirect_to === 'string' && body.redirect_to.startsWith('https://')
    ? body.redirect_to
    : undefined;

  async function loadWarrior(id: unknown) {
    if (typeof id !== 'string') return null;
    const { data } = await db.from('profiles').select('*').eq('id', id).maybeSingle();
    return data && data.role === 'warrior' ? data : null;
  }

  try {
    switch (body.action) {
      case 'invite': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const fullName = String(body.full_name ?? '').trim().slice(0, 80);
        const days = cleanDays(body.assigned_days);
        if (!EMAIL_RE.test(email)) return reply(400, { error: 'Enter a valid email address.' });
        if (!fullName) return reply(400, { error: 'Enter the Prayer Warrior’s name.' });

        const { data: existing } = await db.from('profiles').select('*').ilike('email', email).maybeSingle();
        if (existing) {
          return reply(409, {
            error: existing.status === 'removed'
              ? 'This person was removed earlier. Use Restore access on their row instead.'
              : 'This email already has an account.',
          });
        }

        const { data: link, error } = await db.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { redirectTo, data: { full_name: fullName } },
        });
        if (error || !link?.user) {
          return reply(400, { error: error?.message ?? 'The invitation could not be created.' });
        }

        const { data: profile, error: insertError } = await db
          .from('profiles')
          .insert({
            id: link.user.id,
            email,
            full_name: fullName,
            role: 'warrior',
            status: 'active',
            assigned_days: days,
            invited_by: me.id,
          })
          .select()
          .single();
        if (insertError) return reply(400, { error: insertError.message });

        await log('invited', profile);
        return reply(200, { link: link.properties.action_link, profile });
      }

      case 'resend_link': {
        const warrior = await loadWarrior(body.user_id);
        if (!warrior) return reply(404, { error: 'That Prayer Warrior was not found.' });
        if (warrior.status !== 'active') return reply(400, { error: 'Restore their access first.' });
        const { data: link, error } = await db.auth.admin.generateLink({
          type: 'recovery',
          email: warrior.email,
          options: { redirectTo },
        });
        if (error || !link) return reply(400, { error: error?.message ?? 'The link could not be created.' });
        await log('link_sent', warrior);
        return reply(200, { link: link.properties.action_link });
      }

      case 'remove': {
        const warrior = await loadWarrior(body.user_id);
        if (!warrior) return reply(404, { error: 'That Prayer Warrior was not found.' });
        const { error: banError } = await db.auth.admin.updateUserById(warrior.id, { ban_duration: BAN_FOREVER });
        if (banError) return reply(400, { error: banError.message });
        const { data: profile } = await db
          .from('profiles')
          .update({ status: 'removed', removed_at: new Date().toISOString() })
          .eq('id', warrior.id)
          .select()
          .single();
        await log('removed', warrior);
        return reply(200, { profile });
      }

      case 'restore': {
        const warrior = await loadWarrior(body.user_id);
        if (!warrior) return reply(404, { error: 'That Prayer Warrior was not found.' });
        const { error: unbanError } = await db.auth.admin.updateUserById(warrior.id, { ban_duration: 'none' });
        if (unbanError) return reply(400, { error: unbanError.message });
        const { data: profile } = await db
          .from('profiles')
          .update({ status: 'active', removed_at: null })
          .eq('id', warrior.id)
          .select()
          .single();
        await log('restored', warrior);
        return reply(200, { profile });
      }

      default:
        return reply(400, { error: 'Unknown action.' });
    }
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Something went wrong.' });
  }
});
