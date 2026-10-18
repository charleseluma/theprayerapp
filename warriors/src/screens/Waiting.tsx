import { Pressable, ScrollView, RefreshControl, Text, View } from 'react-native';
import { useState } from 'react';

import type { Profile } from '../supabase';
import type { Theme } from '../theme';
import { Banner, type Styles } from '../ui';

/** Home tab for people whose request hasn't been approved (pending or declined). */
export function Waiting({ s, t, profile, onRefresh, onGo }: { s: Styles; t: Theme; profile: Profile; onRefresh: () => Promise<void>; onGo: (tab: 'practice' | 'guide' | 'listen') => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const first = profile.full_name.split(' ')[0] || 'friend';
  const declined = profile.approval === 'declined';

  const steps = [
    { label: 'Account created', done: true },
    { label: 'Email confirmed', done: true },
    { label: 'Approved by an administrator', done: false },
  ];

  return (
    <ScrollView
      contentContainerStyle={[s.page, { gap: 16 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.accent}
          onRefresh={async () => {
            setRefreshing(true);
            await onRefresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <View>
        <Text style={s.eyebrow}>Prayer Warriors</Text>
        <Text style={s.h1}>{declined ? `Hi, ${first}` : `Welcome, ${first}`}</Text>
      </View>

      {declined ? (
        <Banner s={s} t={t} tone="danger" title="Your request wasn’t approved">
          {profile.decline_reason
            ? `Note from the team: ${profile.decline_reason}`
            : 'If you think this is a mistake, contact the person who referred you or the Prayer App team.'}
        </Banner>
      ) : (
        <View style={[s.panel, { gap: 12 }]}>
          <Text style={s.h2}>Your request is waiting for approval</Text>
          <Text style={s.body}>An administrator will review your details. Recording unlocks as soon as you’re approved.</Text>
          <View style={{ gap: 10, marginTop: 4 }}>
            {steps.map((st) => (
              <View key={st.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: st.done ? t.good : 'transparent',
                    borderWidth: st.done ? 0 : 2,
                    borderColor: t.line,
                  }}
                >
                  {st.done ? <Text style={{ color: t.card, fontWeight: '800', fontSize: 13 }}>✓</Text> : null}
                </View>
                <Text style={{ color: st.done ? t.ink : t.muted, fontSize: 15 }}>{st.label}</Text>
              </View>
            ))}
          </View>
          <Text style={s.small}>Pull down to check for updates.</Text>
        </View>
      )}

      <Text style={[s.h2, { marginTop: 4 }]}>{declined ? 'You can still' : 'While you wait'}</Text>
      {[
        { tab: 'practice' as const, title: 'Practice recording', text: 'Record and listen back privately. Nothing is sent.' },
        { tab: 'guide' as const, title: 'Read the recording guide', text: 'How to record a clear, heartfelt prayer.' },
        { tab: 'listen' as const, title: 'Listen to this week’s prayers', text: 'Hear the prayers listeners hear in The Prayer App.' },
      ]
        .filter((x) => !declined || x.tab === 'listen')
        .map((x) => (
          <Pressable
            key={x.tab}
            onPress={() => onGo(x.tab)}
            accessibilityRole="button"
            style={({ pressed }) => [s.panel, { padding: 16, gap: 4 }, pressed && s.pressed]}
          >
            <Text style={{ color: t.ink, fontSize: 16, fontWeight: '600' }}>{x.title} ›</Text>
            <Text style={s.small}>{x.text}</Text>
          </Pressable>
        ))}
    </ScrollView>
  );
}
