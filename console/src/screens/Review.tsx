import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { addDays, DAY_SHORT, formatDuration, fromIso, iso, longDate, timeAgo } from '../dates';
import { friendlyError, publicAudioUrl, supabase, type PrayerRow, type Profile } from '../supabase';
import type { Theme } from '../theme';
import { Banner, Button, Chip, type Styles } from '../ui';

export function Review({ s, t, people, onCountChange }: { s: Styles; t: Theme; people: Map<string, Profile>; onCountChange: (n: number) => void }) {
  const [pending, setPending] = useState<PrayerRow[]>([]);
  const [schedule, setSchedule] = useState<PrayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const today = iso(new Date());
  const from = iso(addDays(new Date(), -7));
  const to = iso(addDays(new Date(), 14));

  const load = useCallback(async () => {
    setError(null);
    const [p, sch] = await Promise.all([
      supabase!.from('prayers').select('*').eq('status', 'pending').order('prayer_date'),
      supabase!.from('prayers').select('*').gte('prayer_date', from).lte('prayer_date', to).order('prayer_date'),
    ]);
    setLoading(false);
    if (p.error || sch.error) {
      setError(friendlyError(p.error?.message ?? sch.error?.message));
      return;
    }
    setPending(p.data as PrayerRow[]);
    setSchedule(sch.data as PrayerRow[]);
    onCountChange((p.data as PrayerRow[]).length);
  }, [from, to, onCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = (id: string | null) => (id ? people.get(id)?.full_name || people.get(id)?.email : null) ?? 'Earlier upload';

  const review = async (row: PrayerRow, status: 'approved' | 'rejected', note = '') => {
    const { error: err } = await supabase!.from('prayers').update({ status, review_note: note }).eq('id', row.id);
    if (err) {
      setError(friendlyError(err.message));
      return false;
    }
    setFlash(
      status === 'approved'
        ? `Approved “${row.title}”. ${row.prayer_date <= today ? 'Listeners can hear it now.' : `Listeners will hear it on ${longDate(fromIso(row.prayer_date))}.`}`
        : `Sent “${row.title}” back to ${nameOf(row.created_by)} with your note.`,
    );
    await load();
    return true;
  };

  const toggleHidden = async (row: PrayerRow) => {
    const { error: err } = await supabase!.from('prayers').update({ published: !row.published }).eq('id', row.id);
    if (err) setError(friendlyError(err.message));
    else {
      setFlash(row.published ? `“${row.title}” is hidden from listeners.` : `“${row.title}” is visible to listeners again.`);
      load();
    }
  };

  const byDate = useMemo(() => new Map(schedule.map((r) => [r.prayer_date, r])), [schedule]);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = fromIso(from); iso(d) <= to; d = addDays(d, 1)) out.push(iso(d));
    return out;
  }, [from, to]);

  if (loading) return <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />;

  return (
    <View style={{ gap: 18 }}>
      {flash ? <Banner s={s} t={t} tone="good">{flash}</Banner> : null}
      {error ? <Banner s={s} t={t} tone="danger" title="Something went wrong">{error}</Banner> : null}

      <View style={{ gap: 4 }}>
        <Text style={s.h2}>Waiting for review</Text>
        <Text style={s.body}>
          {pending.length === 0
            ? 'Nothing to review. New prayers from Prayer Warriors will appear here.'
            : `${pending.length} ${pending.length === 1 ? 'prayer is' : 'prayers are'} waiting. Listen, then approve or ask for changes.`}
        </Text>
      </View>

      {pending.map((row) => (
        <PendingCard key={row.id} s={s} t={t} row={row} by={nameOf(row.created_by)} today={today} onReview={review} />
      ))}

      <View style={{ gap: 4, marginTop: 10 }}>
        <Text style={s.h2}>Schedule</Text>
        <Text style={s.body}>Last week through the next two weeks.</Text>
      </View>
      <View style={{ backgroundColor: t.card, borderRadius: 18, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
        {days.map((date, i) => {
          const row = byDate.get(date);
          const d = fromIso(date);
          const chip = !row
            ? { label: date < today ? 'Missed' : 'Not posted', tone: date < today ? ('danger' as const) : ('outline' as const) }
            : row.status === 'pending'
              ? { label: 'Waiting for review', tone: 'warn' as const }
              : row.status === 'rejected'
                ? { label: 'Changes requested', tone: 'danger' as const }
                : !row.published
                  ? { label: 'Hidden', tone: 'neutral' as const }
                  : { label: date <= today ? 'Live' : 'Approved', tone: 'good' as const };
          return (
            <View
              key={date}
              style={[
                { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingHorizontal: 14, flexWrap: 'wrap' },
                i < days.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.line },
                date === today && { backgroundColor: t.accentSoft },
              ]}
            >
              <View style={{ width: 70 }}>
                <Text style={{ color: date === today ? t.accent : t.muted, fontSize: 12, fontWeight: '700' }}>
                  {date === today ? 'TODAY' : DAY_SHORT[d.getDay()].toUpperCase()}
                </Text>
                <Text style={{ color: t.ink, fontSize: 14 }}>{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={{ color: row ? t.ink : t.muted, fontSize: 15 }} numberOfLines={1}>
                  {row ? row.title : '—'}
                </Text>
                {row ? <Text style={s.small}>{nameOf(row.created_by)}</Text> : null}
              </View>
              <Chip s={s} t={t} tone={chip.tone} label={chip.label} />
              {row?.status === 'approved' ? (
                <Button s={s} t={t} small kind="secondary" label={row.published ? 'Hide' : 'Show'} onPress={() => toggleHidden(row)} />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PendingCard({
  s,
  t,
  row,
  by,
  today,
  onReview,
}: {
  s: Styles;
  t: Theme;
  row: PrayerRow;
  by: string;
  today: string;
  onReview: (row: PrayerRow, status: 'approved' | 'rejected', note?: string) => Promise<boolean>;
}) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const late = row.prayer_date < today;

  return (
    <View style={[s.panel, { gap: 10 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text style={s.eyebrow}>
            {longDate(fromIso(row.prayer_date))}
            {late ? ' · date has passed' : ''}
          </Text>
          <Text style={s.h2}>{row.title}</Text>
          <Text style={s.small}>
            From {by} · sent {timeAgo(row.updated_at)}
            {row.theme ? ` · ${row.theme}` : ''}
            {row.duration_sec ? ` · ${formatDuration(row.duration_sec)}` : ''}
          </Text>
        </View>
      </View>
      {row.description ? <Text style={s.body}>{row.description}</Text> : null}
      {createElement('audio', {
        src: publicAudioUrl(row.audio_path),
        controls: true,
        preload: 'none',
        style: { width: '100%', display: 'block' },
      })}

      {asking ? (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>What should {by.split(' ')[0]} change?</Text>
          <TextInput
            nativeID={`note-${row.id}`}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={400}
            placeholder="For example: the audio is too quiet; please record closer to the phone."
            placeholderTextColor={t.muted}
            style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button
              s={s}
              t={t}
              kind="danger"
              label="Send back with note"
              busy={busy === 'reject'}
              onPress={async () => {
                if (!note.trim()) {
                  setError('Add a short note so they know what to change.');
                  return;
                }
                setBusy('reject');
                await onReview(row, 'rejected', note.trim());
                setBusy(null);
              }}
            />
            <Button s={s} t={t} kind="secondary" label="Cancel" onPress={() => setAsking(false)} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Button
            s={s}
            t={t}
            label="Approve"
            busy={busy === 'approve'}
            onPress={async () => {
              setBusy('approve');
              await onReview(row, 'approved');
              setBusy(null);
            }}
          />
          <Button s={s} t={t} kind="secondary" label="Ask for changes" onPress={() => setAsking(true)} />
        </View>
      )}
    </View>
  );
}
