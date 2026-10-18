import { createElement, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { addDays, fromIso } from '../dates';
import { friendlyError, supabase, type Activity, type Profile } from '../supabase';
import type { Theme } from '../theme';
import { Banner, type Styles } from '../ui';

const PERIODS = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: 'all', label: 'All time', days: 0 },
];

const PAGE = 200;

function dayOf(p: string | null) {
  return p ? fromIso(p).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
}

/** One plain sentence per activity row. */
function describe(a: Activity): { text: string; tone: 'good' | 'danger' | 'accent' | 'neutral' } {
  const title = a.subject_name ? `“${a.subject_name}”` : 'a prayer';
  const when = a.prayer_date ? ` for ${dayOf(a.prayer_date)}` : '';
  switch (a.action) {
    case 'signed_in':
      return { text: 'signed in', tone: 'neutral' };
    case 'submitted':
      return { text: `submitted ${title}${when}`, tone: 'accent' };
    case 'edited':
      return { text: `edited ${title}${when}`, tone: 'accent' };
    case 'replaced_audio':
      return { text: `re-recorded ${title}${when}`, tone: 'accent' };
    case 'resubmitted':
      return { text: `resubmitted ${title}${when} after changes were requested`, tone: 'accent' };
    case 'withdrew':
      return { text: `withdrew ${title}${when}`, tone: 'neutral' };
    case 'approved':
      return { text: `approved ${title}${when}`, tone: 'good' };
    case 'rejected':
      return { text: `asked for changes to ${title}${when}${a.details ? `: “${a.details}”` : ''}`, tone: 'danger' };
    case 'pending':
      return { text: `moved ${title}${when} back to review`, tone: 'neutral' };
    case 'hidden':
      return { text: `hid ${title}${when} from listeners`, tone: 'neutral' };
    case 'unhidden':
      return { text: `made ${title}${when} visible again`, tone: 'good' };
    case 'invited':
      return { text: `added ${a.subject_name} as a Prayer Warrior`, tone: 'good' };
    case 'link_sent':
      return { text: `created a new sign-in link for ${a.subject_name}`, tone: 'neutral' };
    case 'removed':
      return { text: `removed ${a.subject_name}`, tone: 'danger' };
    case 'restored':
      return { text: `restored access for ${a.subject_name}`, tone: 'good' };
    case 'requested':
      return { text: 'signed up and requested to join', tone: 'accent' };
    case 'confirmed_email':
      return { text: 'confirmed their email', tone: 'neutral' };
    case 'approved_access':
      return { text: `approved ${a.subject_name}${a.details ? ` (days: ${a.details})` : ''}`, tone: 'good' };
    case 'declined_access':
      return { text: `declined ${a.subject_name}${a.details ? `: “${a.details}”` : ''}`, tone: 'danger' };
    case 'deleted_account':
      return { text: 'deleted their account', tone: 'danger' };
    case 'days_changed':
      return { text: `set ${a.subject_name}’s days to ${a.details}`, tone: 'neutral' };
    default:
      return { text: a.action.replace(/_/g, ' '), tone: 'neutral' };
  }
}

export function ActivityLog({ s, t, people }: { s: Styles; t: Theme; people: Profile[] }) {
  const [person, setPerson] = useState('');
  const [period, setPeriod] = useState('7');
  const [rows, setRows] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let q = supabase!.from('activity').select('*').order('created_at', { ascending: false }).limit(PAGE + 1);
      const days = PERIODS.find((p) => p.key === period)?.days ?? 0;
      if (days) q = q.gte('created_at', addDays(new Date(), -days).toISOString());
      if (person) q = q.or(`actor_id.eq.${person},subject_id.eq.${person}`);
      const { data, error: err } = await q;
      if (cancelled) return;
      setLoading(false);
      if (err) {
        setError(friendlyError(err.message));
        return;
      }
      setMore((data as Activity[]).length > PAGE);
      setRows((data as Activity[]).slice(0, PAGE));
    })();
    return () => {
      cancelled = true;
    };
  }, [person, period]);

  const warriors = people.filter((p) => p.role === 'warrior').sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));

  // Group by calendar day.
  const groups: { day: string; items: Activity[] }[] = [];
  for (const r of rows) {
    const day = new Date(r.created_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(r);
    else groups.push({ day, items: [r] });
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={s.h2}>Activity</Text>
        <Text style={s.body}>What Prayer Warriors and administrators have done, newest first.</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {createElement(
          'select',
          {
            id: 'activity-person',
            'aria-label': 'Person',
            value: person,
            onChange: (e: { target: { value: string } }) => setPerson(e.target.value),
            style: {
              padding: '9px 12px',
              borderRadius: 10,
              border: `1px solid ${t.line}`,
              background: t.card,
              color: t.ink,
              fontSize: 15,
              minWidth: 220,
            },
          },
          createElement('option', { value: '' }, 'Everyone'),
          ...warriors.map((w) =>
            createElement('option', { key: w.id, value: w.id }, `${w.full_name || w.email}${w.status === 'removed' ? ' (removed)' : ''}`),
          ),
        )}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {PERIODS.map((p) => {
            const on = p.key === period;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPeriod(p.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? t.ink : 'transparent', borderWidth: 1, borderColor: on ? t.ink : t.line }}
              >
                <Text style={{ color: on ? t.bg : t.ink, fontSize: 13, fontWeight: '600' }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Banner s={s} t={t} tone="danger">{error}</Banner> : null}
      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 30 }} />
      ) : rows.length === 0 ? (
        <View style={s.panel}>
          <Text style={s.body}>No activity in this period yet.</Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.day} style={{ gap: 6 }}>
            <Text style={[s.eyebrow, { color: t.muted }]}>{g.day}</Text>
            <View style={{ backgroundColor: t.card, borderRadius: 16, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
              {g.items.map((a, i) => {
                const d = describe(a);
                const dot = d.tone === 'good' ? t.good : d.tone === 'danger' ? t.danger : d.tone === 'accent' ? t.accent : t.muted;
                return (
                  <View
                    key={a.id}
                    style={[
                      { flexDirection: 'row', gap: 12, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'flex-start' },
                      i < g.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.line },
                    ]}
                  >
                    <Text style={[s.small, { width: 64, fontVariant: ['tabular-nums'], paddingTop: 1 }]}>
                      {new Date(a.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot, marginTop: 7 }} />
                    <Text style={{ flex: 1, minWidth: 0, color: t.ink, fontSize: 15, lineHeight: 21 }}>
                      <Text style={{ fontWeight: '600' }}>{a.actor_name || 'Someone'}</Text>
                      {a.actor_role === 'admin' ? <Text style={{ color: t.muted }}> (admin)</Text> : null} {d.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}
      {more ? <Text style={s.small}>Showing the latest {PAGE}. Narrow the period or pick a person to see more.</Text> : null}
    </View>
  );
}
