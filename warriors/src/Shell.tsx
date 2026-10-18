import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Home } from './screens/Board';
import { Guide } from './screens/Guide';
import { Listen } from './screens/Listen';
import { Practice } from './screens/Practice';
import { ProfileScreen } from './screens/ProfileScreen';
import { Waiting } from './screens/Waiting';
import type { Profile } from './supabase';
import type { Theme } from './theme';
import type { Styles } from './ui';

type Tab = 'home' | 'practice' | 'listen' | 'guide' | 'profile';

/** Bottom tabs. Approved Prayer Warriors see their week; others see their request status. */
export function Shell({
  s,
  t,
  profile,
  onProfile,
  onRefresh,
  banner,
}: {
  s: Styles;
  t: Theme;
  profile: Profile;
  onProfile: (p: Profile) => void;
  onRefresh: () => Promise<void>;
  banner?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const approved = profile.approval === 'approved';
  const [tab, setTab] = useState<Tab>('home');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'home', label: approved ? 'My week' : 'Status' },
    ...(profile.approval === 'declined' ? [] : [{ key: 'practice' as const, label: 'Practice' }]),
    { key: 'listen', label: 'Listen' },
    { key: 'guide', label: 'Guide' },
    { key: 'profile', label: 'Profile' },
  ];

  let screen: React.ReactNode;
  switch (tab) {
    case 'practice':
      screen = <Practice s={s} t={t} />;
      break;
    case 'listen':
      screen = <Listen s={s} t={t} />;
      break;
    case 'guide':
      screen = <Guide s={s} t={t} />;
      break;
    case 'profile':
      screen = <ProfileScreen s={s} t={t} profile={profile} onSaved={onProfile} />;
      break;
    default:
      screen = approved ? (
        <Home s={s} t={t} profile={profile} />
      ) : (
        <Waiting s={s} t={t} profile={profile} onRefresh={onRefresh} onGo={setTab} />
      );
  }

  return (
    <View style={{ flex: 1 }}>
      {banner}
      <View style={{ flex: 1 }}>{screen}</View>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: t.line,
          backgroundColor: t.card,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
        }}
      >
        {tabs.map((x) => {
          const on = x.key === tab;
          return (
            <Pressable
              key={x.key}
              onPress={() => setTab(x.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 6, gap: 4 }}
            >
              <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: on ? t.accent : 'transparent' }} />
              <Text style={{ color: on ? t.accent : t.muted, fontSize: 12, fontWeight: on ? '700' : '500' }}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
