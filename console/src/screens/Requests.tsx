import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { dateTime, timeAgo } from '../dates';
import { teamAdmin, type Profile } from '../supabase';
import type { Theme } from '../theme';
import { Banner, Button, Chip, type Styles } from '../ui';
import { DayPicker } from './People';

type Result = { profile: Profile; email: 'sent' | 'not_configured' | 'failed' };

function emailNote(r: Result['email'], first: string): string {
  if (r === 'sent') return ` We emailed ${first}.`;
  if (r === 'failed') return ` The email to ${first} couldn’t be sent; they’ll see it in the app.`;
  return ` They’ll see it next time they open the app.`;
}

export function Requests({ s, t, people, onChanged }: { s: Styles; t: Theme; people: Profile[]; onChanged: () => Promise<void> }) {
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeclined, setShowDeclined] = useState(false);

  const warriors = people.filter((p) => p.role === 'warrior');
  // Confirmed emails first, then oldest first.
  const pending = warriors
    .filter((p) => p.approval === 'pending')
    .sort((a, b) => Number(b.email_confirmed) - Number(a.email_confirmed) || a.created_at.localeCompare(b.created_at));
  const declined = warriors.filter((p) => p.approval === 'declined');

  const done = (msg: string) => {
    setError(null);
    setFlash(msg);
  };

  return (
    <View style={{ gap: 18 }}>
      {flash ? <Banner s={s} t={t} tone="good">{flash}</Banner> : null}
      {error ? <Banner s={s} t={t} tone="danger" title="That didn’t work">{error}</Banner> : null}

      <View style={{ gap: 4 }}>
        <Text style={s.h2}>Requests to join</Text>
        <Text style={s.body}>
          {pending.length === 0
            ? 'No requests right now. People who sign up in the Prayer Warriors app appear here.'
            : `${pending.length} ${pending.length === 1 ? 'person is' : 'people are'} waiting. Approve to unlock recording, or decline with a note.`}
        </Text>
      </View>

      {pending.map((p) => (
        <RequestCard key={p.id} s={s} t={t} person={p} onDone={done} onError={setError} onChanged={onChanged} />
      ))}

      {declined.length ? (
        <View style={{ gap: 10 }}>
          <Pressable onPress={() => setShowDeclined((v) => !v)} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
            <Text style={s.link}>
              {showDeclined ? 'Hide' : 'Show'} declined ({declined.length})
            </Text>
          </Pressable>
          {showDeclined
            ? declined.map((p) => <RequestCard key={p.id} s={s} t={t} person={p} onDone={done} onError={setError} onChanged={onChanged} />)
            : null}
        </View>
      ) : null}
    </View>
  );
}

function Detail({ s, t, label, value }: { s: Styles; t: Theme; label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
      <Text style={[s.small, { width: 130 }]}>{label}</Text>
      <Text style={{ color: t.ink, fontSize: 15, flex: 1, minWidth: 180 }} selectable>
        {value}
      </Text>
    </View>
  );
}

function RequestCard({
  s,
  t,
  person,
  onDone,
  onError,
  onChanged,
}: {
  s: Styles;
  t: Theme;
  person: Profile;
  onDone: (m: string) => void;
  onError: (m: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [days, setDays] = useState<number[]>(person.assigned_days ?? []);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const first = (person.full_name || person.email).split(' ')[0];
  const isDeclined = person.approval === 'declined';

  const act = async (action: 'approve' | 'decline') => {
    setBusy(action);
    try {
      const res = await teamAdmin<Result>(
        action === 'approve' ? { action, user_id: person.id, assigned_days: days } : { action, user_id: person.id, reason: reason.trim() },
      );
      await onChanged();
      onDone(
        action === 'approve'
          ? `Approved ${person.full_name || person.email}. Recording is now unlocked for them.${emailNote(res.email, first)}`
          : `Declined ${person.full_name || person.email}.${emailNote(res.email, first)}`,
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[s.panel, { gap: 12 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={{ color: t.ink, fontSize: 19, fontWeight: '600' }}>{person.full_name || person.email}</Text>
          <Text style={s.small}>
            Signed up {timeAgo(person.created_at)} · {dateTime(person.created_at)}
          </Text>
        </View>
        {isDeclined ? (
          <Chip s={s} t={t} tone="neutral" label="Declined" />
        ) : person.email_confirmed ? (
          <Chip s={s} t={t} tone="good" label="Email confirmed" />
        ) : (
          <Chip s={s} t={t} tone="warn" label="Email not confirmed yet" />
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Detail s={s} t={t} label="Email" value={person.email} />
        <Detail s={s} t={t} label="Phone" value={person.phone} />
        <Detail s={s} t={t} label="Church" value={person.church} />
        <Detail s={s} t={t} label="Referred by" value={person.referred_by} />
        <Detail s={s} t={t} label="About" value={person.about} />
        {isDeclined && person.decline_reason ? <Detail s={s} t={t} label="Your note" value={person.decline_reason} /> : null}
      </View>

      {declining ? (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Note to {first} (optional)</Text>
          <TextInput
            nativeID={`decline-${person.id}`}
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={400}
            placeholder="For example: please ask your pastor to contact us first."
            placeholderTextColor={t.muted}
            style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]}
          />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button s={s} t={t} kind="danger" label="Decline request" busy={busy === 'decline'} onPress={() => act('decline')} />
            <Button s={s} t={t} kind="secondary" label="Cancel" onPress={() => setDeclining(false)} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <Text style={s.label}>Their days (optional; you can change them later)</Text>
          <DayPicker t={t} value={days} onChange={setDays} />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            <Button s={s} t={t} label={isDeclined ? 'Approve anyway' : 'Approve'} busy={busy === 'approve'} onPress={() => act('approve')} />
            {!isDeclined ? <Button s={s} t={t} kind="secondary" label="Decline" onPress={() => setDeclining(true)} /> : null}
          </View>
        </View>
      )}
    </View>
  );
}
