// Account service for the Admin Console and the Prayer Warriors app.
// Runs on Supabase (Deno) with the service role, which is the only way to create, block, restore
// and delete sign-ins.
//
// Administrator actions (POST JSON):
//   { action: "invite",      email, full_name, assigned_days?, redirect_to? } → { link, profile }
//   { action: "resend_link", user_id, redirect_to? }                         → { link }
//   { action: "remove",      user_id }                                        → { profile }
//   { action: "restore",     user_id }                                        → { profile }
//   { action: "approve",     user_id, assigned_days? }                        → { profile, email }
//   { action: "decline",     user_id, reason? }                               → { profile, email }
// Any signed-in non-administrator:
//   { action: "delete_self" }                                                 → { deleted: true }
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

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

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function emailHtml(title: string, paragraphs: string[]): string {
  return `<div style="font-family:Georgia,serif;background:#F6F1E9;padding:32px 16px">
  <div style="max-width:520px;margin:0 auto;background:#FFFDF9;border-radius:16px;padding:28px;border:1px solid #E7DFD3">
    <p style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:1px;color:#A8742F;font-weight:bold;margin:0">THE PRAYER APP</p>
    <h1 style="font-size:24px;color:#2A2622;font-weight:normal;margin:6px 0 16px">${title}</h1>
    ${paragraphs.map((p) => `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:22px;color:#2A2622">${p}</p>`).join('')}
  </div></div>`;
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'The request was not valid.' });
  }

  // ── Deleting your own account (Prayer Warriors and people waiting for approval) ──
  if (body.action === 'delete_self') {
    if (!me) return reply(404, { error: 'Account not found.' });
    if (me.role === 'admin') return reply(400, { error: 'Administrator accounts can’t be deleted from the app.' });
    try {
      // Unapproved prayers go; approved prayers stay on The Prayer App without the person's name.
      const { data: own } = await db.from('prayers').select('id,audio_path,status').eq('created_by', me.id);
      const keep = new Set((own ?? []).filter((p) => p.status === 'approved').map((p) => p.audio_path));
      const drop = (own ?? []).filter((p) => p.status !== 'approved');
      if (drop.length) await db.from('prayers').delete().in('id', drop.map((p) => p.id));
      const { data: files } = await db.storage.from('prayer-audio').list(me.id, { limit: 1000 });
      const remove = (files ?? []).map((f) => `${me.id}/${f.name}`).filter((path) => !keep.has(path));
      if (remove.length) await db.storage.from('prayer-audio').remove(remove);
      await db.from('activity').insert({
        actor_id: me.id,
        actor_name: me.full_name || me.email,
        actor_role: me.role,
        action: 'deleted_account',
        subject_id: me.id,
        subject_name: me.full_name || me.email,
      });
      const { error: delError } = await db.auth.admin.deleteUser(me.id);
      if (delError) return reply(400, { error: delError.message });
      return reply(200, { deleted: true });
    } catch (e) {
      return reply(500, { error: e instanceof Error ? e.message : 'The account could not be deleted.' });
    }
  }

  if (!me || me.role !== 'admin' || me.status !== 'active') {
    return reply(403, { error: 'Only administrators can manage Prayer Warriors.' });
  }

  /** Sends an email through the configured Gmail account. Never blocks the action it reports on. */
  async function sendEmail(to: string, subject: string, html: string): Promise<'sent' | 'not_configured' | 'failed'> {
    try {
      const { data: cfg } = await db.rpc('get_email_settings');
      const user = cfg?.smtp_user as string | undefined;
      const pass = cfg?.smtp_password as string | undefined;
      if (!user || !pass) return 'not_configured';
      const transport = nodemailer.createTransport({
        host: (cfg?.smtp_host as string) || 'smtp.gmail.com',
        port: Number(cfg?.smtp_port_secure ?? 465),
        secure: true,
        auth: { user, pass },
      });
      await transport.sendMail({ from: `"The Prayer App" <${user}>`, to, subject, html });
      return 'sent';
    } catch (e) {
      console.error('email failed', e);
      return 'failed';
    }
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
          .upsert(
            {
              id: link.user.id,
              email,
              full_name: fullName,
              role: 'warrior',
              status: 'active',
              approval: 'approved',
              approved_at: new Date().toISOString(),
              approved_by: me.id,
              email_confirmed: true,
              assigned_days: days,
              invited_by: me.id,
            },
            { onConflict: 'id' },
          )
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

      case 'approve': {
        const person = await loadWarrior(body.user_id);
        if (!person) return reply(404, { error: 'That person was not found.' });
        const days = cleanDays(body.assigned_days);
        const { data: profile, error } = await db
          .from('profiles')
          .update({
            approval: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: me.id,
            decline_reason: '',
            assigned_days: days,
            status: 'active',
          })
          .eq('id', person.id)
          .select()
          .single();
        if (error) return reply(400, { error: error.message });
        // A previously removed or banned sign-in is unblocked.
        await db.auth.admin.updateUserById(person.id, { ban_duration: 'none' });
        await log('approved_access', person, days.length ? days.map((d) => DAY_NAMES[d].slice(0, 3)).join(', ') : '');
        const first = esc((person.full_name || '').split(' ')[0] || 'there');
        const email = await sendEmail(
          person.email,
          'You’re approved as a Prayer Warrior',
          emailHtml('Welcome to the Prayer Warriors', [
            `Hi ${first},`,
            'Your request to join the Prayer Warriors has been approved. Open the Prayer Warriors app and sign in to start recording prayers.',
            days.length ? `Your days: <b>${days.map((d) => DAY_NAMES[d]).join(', ')}</b>.` : 'You can record prayers on any open day.',
            'Thank you for serving.',
          ]),
        );
        return reply(200, { profile, email });
      }

      case 'decline': {
        const person = await loadWarrior(body.user_id);
        if (!person) return reply(404, { error: 'That person was not found.' });
        const reason = String(body.reason ?? '').trim().slice(0, 400);
        const { data: profile, error } = await db
          .from('profiles')
          .update({ approval: 'declined', decline_reason: reason })
          .eq('id', person.id)
          .select()
          .single();
        if (error) return reply(400, { error: error.message });
        await log('declined_access', person, reason);
        const first = esc((person.full_name || '').split(' ')[0] || 'there');
        const email = await sendEmail(
          person.email,
          'About your Prayer Warriors request',
          emailHtml('About your request', [
            `Hi ${first},`,
            'Thank you for your interest in joining the Prayer Warriors. We aren’t able to approve your request at this time.',
            ...(reason ? [`Note from the team: ${esc(reason)}`] : []),
            'You can still listen to the daily prayers in The Prayer App.',
          ]),
        );
        return reply(200, { profile, email });
      }

      default:
        return reply(400, { error: 'Unknown action.' });
    }
  } catch (e) {
    return reply(500, { error: e instanceof Error ? e.message : 'Something went wrong.' });
  }
});
