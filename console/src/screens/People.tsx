import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DAY_SHORT, timeAgo } from '../dates';
import { friendlyError, supabase, teamAdmin, type Profile } from '../supabase';
import type { Theme } from '../theme';
import { Banner, Button, Chip, Field, type Styles } from '../ui';

type Counts = Map<string, { total: number; approved: number }>;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function People({
  s,
  t,
  people,
  counts,
  onChanged,
}: {
  s: Styles;
  t: Theme;
  people: Profile[];
  counts: Counts;
  onChanged: () => Promise<void>;
}) {
  const [showRemoved, setShowRemoved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState<{ name: string; url: string; kind: 'invite' | 'reset' } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const warriors = people.filter((p) => p.role === 'warrior' && p.approval === 'approved');
  const active = warriors.filter((p) => p.status === 'active');
  const removed = warriors.filter((p) => p.status === 'removed');
  const list = showRemoved ? removed : active;

  // Which weekdays are covered, for the coverage strip.
  const coverage = DAY_SHORT.map((_, d) => active.filter((p) => p.assigned_days.includes(d)).map((p) => p.full_name.split(' ')[0]));

  return (
    <View style={{ gap: 18 }}>
      {flash ? <Banner s={s} t={t} tone="good">{flash}</Banner> : null}
      {error ? <Banner s={s} t={t} tone="danger" title="That didn’t work">{error}</Banner> : null}
      {link ? <LinkPanel s={s} t={t} link={link} onClose={() => setLink(null)} /> : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ gap: 4, flexShrink: 1 }}>
          <Text style={s.h2}>Prayer Warriors</Text>
          <Text style={s.body}>
            {active.length} active{removed.length ? ` · ${removed.length} removed` : ''}. Assign each person their days of the week.
          </Text>
        </View>
        {!adding ? <Button s={s} t={t} label="Add a Prayer Warrior" onPress={() => setAdding(true)} /> : null}
      </View>

      {adding ? (
        <AddForm
          s={s}
          t={t}
          onCancel={() => setAdding(false)}
          onAdded={async (name, url) => {
            setAdding(false);
            setLink({ name, url, kind: 'invite' });
            setFlash(null);
            await onChanged();
          }}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {coverage.map((names, d) => (
          <View
            key={d}
            style={{
              flexGrow: 1,
              flexBasis: 80,
              borderRadius: 12,
              padding: 10,
              backgroundColor: names.length ? t.goodSoft : t.card,
              borderWidth: 1,
              borderColor: names.length ? t.goodSoft : t.line,
            }}
          >
            <Text style={{ color: t.ink, fontWeight: '700', fontSize: 13 }}>{DAY_SHORT[d]}</Text>
            <Text style={[s.small, { color: names.length ? t.good : t.muted }]} numberOfLines={2}>
              {names.length ? names.join(', ') : 'Open'}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['Active', 'Removed'] as const).map((label) => {
          const on = (label === 'Removed') === showRemoved;
          return (
            <Pressable
              key={label}
              onPress={() => setShowRemoved(label === 'Removed')}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? t.ink : 'transparent', borderWidth: 1, borderColor: on ? t.ink : t.line }}
            >
              <Text style={{ color: on ? t.bg : t.ink, fontWeight: '600', fontSize: 14 }}>
                {label} ({label === 'Active' ? active.length : removed.length})
              </Text>
            </Pressable>
          );
        })}
      </View>

      {list.length === 0 ? (
        <View style={s.panel}>
          <Text style={s.body}>
            {showRemoved ? 'Nobody has been removed.' : 'No Prayer Warriors yet. Add your first one to get started.'}
          </Text>
        </View>
      ) : (
        list.map((p) => (
          <PersonCard
            key={p.id}
            s={s}
            t={t}
            person={p}
            count={counts.get(p.id)}
            onLink={(url) => setLink({ name: p.full_name || p.email, url, kind: 'reset' })}
            onMessage={(m) => {
              setError(null);
              setFlash(m);
            }}
            onError={(m) => {
              setFlash(null);
              setError(m);
            }}
            onChanged={onChanged}
          />
        ))
      )}
    </View>
  );
}

export function DayPicker({ t, value, onChange, disabled }: { t: Theme; value: number[]; onChange: (days: number[]) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {DAY_SHORT.map((label, d) => {
        const on = value.includes(d);
        return (
          <Pressable
            key={d}
            disabled={disabled}
            onPress={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={label}
            style={({ pressed }) => ({
              minWidth: 46,
              paddingVertical: 7,
              paddingHorizontal: 8,
              borderRadius: 10,
              alignItems: 'center',
              backgroundColor: on ? t.accent : t.bg,
              borderWidth: 1,
              borderColor: on ? t.accent : t.line,
              opacity: pressed || disabled ? 0.6 : 1,
            })}
          >
            <Text style={{ color: on ? t.onAccent : t.ink, fontWeight: '600', fontSize: 13 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AddForm({ s, t, onCancel, onAdded }: { s: Styles; t: Theme; onCancel: () => void; onAdded: (name: string, url: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError('Enter their name and email.');
      return;
    }
    setBusy(true);
    try {
      const res = await teamAdmin<{ link: string }>({ action: 'invite', full_name: name.trim(), email: email.trim(), assigned_days: days });
      onAdded(name.trim(), res.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The invitation could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[s.panel, { gap: 4 }]}>
      <Text style={s.h2}>Add a Prayer Warrior</Text>
      <Text style={s.body}>You’ll get a private sign-up link to send them by text, WhatsApp or email.</Text>
      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        <View style={{ flexGrow: 1, flexBasis: 240 }}>
          <Field s={s} t={t} label="Full name" nativeID="new-name" value={name} onChangeText={setName} maxLength={80} placeholder="Grace Okafor" />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 240 }}>
          <Field
            s={s}
            t={t}
            label="Email"
            nativeID="new-email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            inputMode="email"
            placeholder="grace@example.com"
          />
        </View>
      </View>
      <Text style={s.label}>Their days (optional)</Text>
      <DayPicker t={t} value={days} onChange={setDays} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <Button s={s} t={t} label="Create sign-up link" onPress={submit} busy={busy} />
        <Button s={s} t={t} kind="secondary" label="Cancel" onPress={onCancel} />
      </View>
    </View>
  );
}

function LinkPanel({ s, t, link, onClose }: { s: Styles; t: Theme; link: { name: string; url: string; kind: 'invite' | 'reset' }; onClose: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <View style={[s.panel, { gap: 10, borderColor: t.accent, borderWidth: 1.5 }]}>
      <Text style={s.eyebrow}>{link.kind === 'invite' ? 'Added' : 'New sign-in link'}</Text>
      <Text style={s.h2}>Send this link to {link.name.split(' ')[0]}</Text>
      <Text style={s.body}>
        {link.kind === 'invite'
          ? 'Opening it lets them choose a password. Then they sign in to the Prayer Warriors app on their phone with their email and that password.'
          : 'Opening it lets them choose a new password.'}{' '}
        The link works once and expires after 24 hours.
      </Text>
      <TextInput
        nativeID="invite-link"
        value={link.url}
        editable={false}
        selectTextOnFocus
        multiline
        style={[s.input, { fontSize: 13, color: t.muted }]}
      />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button s={s} t={t} label={copied ? 'Copied' : 'Copy link'} onPress={async () => setCopied(await copy(link.url))} />
        <Button s={s} t={t} kind="secondary" label="Done" onPress={onClose} />
        {copied === false ? <Text style={s.small}>Select the link above and copy it.</Text> : null}
      </View>
    </View>
  );
}

function PersonCard({
  s,
  t,
  person,
  count,
  onLink,
  onMessage,
  onError,
  onChanged,
}: {
  s: Styles;
  t: Theme;
  person: Profile;
  count?: { total: number; approved: number };
  onLink: (url: string) => void;
  onMessage: (m: string) => void;
  onError: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const removed = person.status === 'removed';
  const name = person.full_name || person.email;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const saveDays = (days: number[]) =>
    run('days', async () => {
      const { error } = await supabase!.from('profiles').update({ assigned_days: days }).eq('id', person.id);
      if (error) throw new Error(friendlyError(error.message));
      await onChanged();
      onMessage(`Updated ${name}’s days.`);
    });

  return (
    <View style={[s.panel, { gap: 12, padding: 16 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: '600' }}>{name}</Text>
          <Text style={s.small} selectable>
            {person.email}
          </Text>
        </View>
        <Chip
          s={s}
          t={t}
          tone={removed ? 'neutral' : person.last_sign_in_at ? 'good' : 'warn'}
          label={removed ? 'Removed' : person.last_sign_in_at ? 'Active' : 'Hasn’t signed in yet'}
        />
      </View>
      {person.church || person.phone || person.referred_by ? (
        <Text style={s.small}>
          {[person.church, person.phone, person.referred_by ? `Referred by ${person.referred_by}` : ''].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <Text style={s.small}>
        {removed
          ? `Removed ${timeAgo(person.removed_at)} · their prayers stay on the app`
          : `${person.last_sign_in_at ? `Last signed in ${timeAgo(person.last_sign_in_at)}` : 'Never signed in'} · ${count?.total ?? 0} ${
              (count?.total ?? 0) === 1 ? 'prayer' : 'prayers'
            } submitted, ${count?.approved ?? 0} approved`}
      </Text>
      {!removed ? <DayPicker t={t} value={person.assigned_days} onChange={saveDays} disabled={busy === 'days'} /> : null}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {removed ? (
          <Button
            s={s}
            t={t}
            small
            label="Restore access"
            busy={busy === 'restore'}
            onPress={() =>
              run('restore', async () => {
                await teamAdmin({ action: 'restore', user_id: person.id });
                await onChanged();
                onMessage(`${name} can sign in again. Reassign their days if needed.`);
              })
            }
          />
        ) : (
          <>
            <Button
              s={s}
              t={t}
              small
              kind="secondary"
              label="New sign-in link"
              busy={busy === 'link'}
              onPress={() =>
                run('link', async () => {
                  const res = await teamAdmin<{ link: string }>({ action: 'resend_link', user_id: person.id });
                  onLink(res.link);
                })
              }
            />
            <Button
              s={s}
              t={t}
              small
              kind="danger"
              label={confirmRemove ? `Confirm: remove ${name.split(' ')[0]}` : 'Remove'}
              busy={busy === 'remove'}
              onPress={() => {
                if (!confirmRemove) {
                  setConfirmRemove(true);
                  return;
                }
                run('remove', async () => {
                  await teamAdmin({ action: 'remove', user_id: person.id });
                  setConfirmRemove(false);
                  await onChanged();
                  onMessage(`${name} was removed and can no longer sign in. Their prayers stay on the app.`);
                });
              }}
            />
            {confirmRemove ? (
              <Pressable onPress={() => setConfirmRemove(false)}>
                <Text style={s.link}>Keep</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}
