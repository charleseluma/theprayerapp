import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { addDays, DAY_SHORT, dayList, fromIso, iso, shortDate, startOfWeek } from '../dates';
import { canOpen, dayState, statusLabel, type DayState } from '../rules';
import { friendlyError, supabase, type PrayerRow, type Profile, type Teammate } from '../supabase';
import type { Theme } from '../theme';
import { Banner, Chip, type Styles } from '../ui';
import { Editor } from './Editor';

export function Home({ s, t, profile }: { s: Styles; t: Theme; profile: Profile }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [rows, setRows] = useState<Map<string, PrayerRow>>(new Map());
  const [team, setTeam] = useState<Teammate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const today = iso(new Date());
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(addDays(weekStart, i))), [weekStart]);

  const load = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      setError(null);
      const [prayers, directory] = await Promise.all([
        supabase!.from('prayers').select('*').gte('prayer_date', dates[0]).lte('prayer_date', dates[6]),
        supabase!.rpc('team_directory'),
      ]);
      setLoading(false);
      setRefreshing(false);
      if (prayers.error || directory.error) {
        setError(friendlyError(prayers.error?.message ?? directory.error?.message));
        return;
      }
      setRows(new Map((prayers.data as PrayerRow[]).map((r) => [r.prayer_date, r])));
      setTeam(directory.data as Teammate[]);
    },
    [dates],
  );

  useEffect(() => {
    load();
  }, [load]);

  const me = profile.id;
  const myDays = team.find((m) => m.id === me)?.assigned_days ?? profile.assigned_days;
  const states = dates.map((d) => ({ date: d, state: dayState(d, today, me, rows.get(d), team) }));
  const waiting = states.filter((x) => x.state.kind === 'mine' && x.state.row.status === 'pending').length;
  const needsChanges = states.filter((x) => x.state.kind === 'mine' && x.state.row.status === 'rejected').length;
  const todo = states.filter((x) => x.state.kind === 'yours').length;

  if (editing) {
    return (
      <Editor
        s={s}
        t={t}
        me={me}
        date={editing}
        today={today}
        row={rows.get(editing)}
        onClose={(message, updated, removedDate) => {
          setEditing(null);
          if (message) setFlash(message);
          if (updated) setRows((prev) => new Map(prev).set(updated.prayer_date, updated));
          if (removedDate)
            setRows((prev) => {
              const next = new Map(prev);
              next.delete(removedDate);
              return next;
            });
          load();
        }}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[s.page, { gap: 14 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={t.accent} />}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={s.eyebrow}>Prayer Warriors</Text>
          <Text style={s.h1} numberOfLines={1}>
            {profile.full_name ? `Hi, ${profile.full_name.split(' ')[0]}` : 'Your prayers'}
          </Text>
        </View>
        <Pressable onPress={() => supabase!.auth.signOut()} style={({ pressed }) => [{ paddingVertical: 6 }, pressed && s.pressed]}>
          <Text style={s.link}>Sign out</Text>
        </Pressable>
      </View>

      <Text style={s.body}>
        {myDays.length ? `Your days: ${dayList(myDays)}. You can also post on open days.` : 'You can post on any open day.'} Every
        prayer is reviewed by an administrator before listeners hear it.
      </Text>

      {flash ? (
        <Pressable onPress={() => setFlash(null)}>
          <Banner s={s} t={t} tone="good">
            {flash}
          </Banner>
        </Pressable>
      ) : null}
      {needsChanges > 0 ? (
        <Banner s={s} t={t} tone="danger" title={`${needsChanges} ${needsChanges === 1 ? 'prayer needs' : 'prayers need'} changes`}>
          Open it to read the administrator’s note and record again.
        </Banner>
      ) : null}
      {error ? (
        <Banner s={s} t={t} tone="danger" title="Couldn’t load this week">
          {error}
        </Banner>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={() => setWeekStart((w) => addDays(w, -7))}
          accessibilityLabel="Previous week"
          style={({ pressed }) => [navBtn(t), pressed && s.pressed]}
        >
          <Text style={{ color: t.ink, fontSize: 22 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: '600' }}>
            {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}
          </Text>
          <Text style={s.small}>
            {dates.includes(today)
              ? `This week${todo ? ` · ${todo} of your days to record` : ''}${waiting ? ` · ${waiting} waiting for review` : ''}`
              : weekStart > new Date()
                ? 'Upcoming'
                : 'Earlier'}
          </Text>
        </View>
        <Pressable
          onPress={() => setWeekStart((w) => addDays(w, 7))}
          accessibilityLabel="Next week"
          style={({ pressed }) => [navBtn(t), pressed && s.pressed]}
        >
          <Text style={{ color: t.ink, fontSize: 22 }}>›</Text>
        </Pressable>
      </View>

      <View style={{ backgroundColor: t.card, borderRadius: 20, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
        {loading ? (
          <ActivityIndicator color={t.accent} style={{ padding: 32 }} />
        ) : (
          states.map(({ date, state }, i) => (
            <DayRow
              key={date}
              s={s}
              t={t}
              date={date}
              isToday={date === today}
              state={state}
              last={i === 6}
              onPress={() => {
                setFlash(null);
                setEditing(date);
              }}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function navBtn(t: Theme) {
  return {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: t.line,
    backgroundColor: t.card,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
}

function DayRow({
  s,
  t,
  date,
  isToday,
  state,
  last,
  onPress,
}: {
  s: Styles;
  t: Theme;
  date: string;
  isToday: boolean;
  state: DayState;
  last: boolean;
  onPress: () => void;
}) {
  const d = fromIso(date);
  const open = canOpen(state);
  let title: string;
  let sub = '';
  let chip: { label: string; tone: 'good' | 'warn' | 'danger' | 'neutral' | 'accent' | 'outline' };

  switch (state.kind) {
    case 'mine': {
      title = state.row.title;
      chip = statusLabel(state.row);
      sub = state.row.status === 'rejected' && state.row.review_note ? `Note: ${state.row.review_note}` : state.row.theme;
      break;
    }
    case 'taken':
      title = state.row.title;
      sub = `Posted by ${state.by}`;
      chip = { label: 'Taken', tone: 'outline' };
      break;
    case 'reserved':
      title = 'Not posted yet';
      sub = `${state.by}’s day`;
      chip = { label: 'Reserved', tone: 'outline' };
      break;
    case 'yours':
      title = isToday ? 'Record today’s prayer' : 'Your day — record a prayer';
      chip = { label: 'Your day', tone: 'accent' };
      break;
    case 'open':
      title = 'Open — anyone can post';
      chip = { label: 'Open', tone: 'outline' };
      break;
    default:
      title = 'Nothing posted';
      chip = { label: 'Past', tone: 'neutral' };
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!open}
      accessibilityRole="button"
      accessibilityState={{ disabled: !open }}
      accessibilityLabel={`${d.toDateString()}: ${title}. ${chip.label}`}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 14, minHeight: 68 },
        !last && { borderBottomWidth: 1, borderBottomColor: t.line },
        isToday && { backgroundColor: t.accentSoft },
        pressed && s.pressed,
      ]}
    >
      <View style={{ width: 40, alignItems: 'center' }}>
        <Text style={{ color: isToday ? t.accent : t.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
          {DAY_SHORT[d.getDay()]}
        </Text>
        <Text style={{ color: t.ink, fontSize: 20, fontVariant: ['tabular-nums'] }}>{d.getDate()}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: open || state.kind === 'taken' ? t.ink : t.muted, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[s.small, state.kind === 'mine' && state.row.status === 'rejected' && { color: t.danger }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Chip s={s} t={t} tone={chip.tone} label={chip.label} />
    </Pressable>
  );
}
