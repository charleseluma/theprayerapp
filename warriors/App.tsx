import './src/polyfills';

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Platform, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { Home } from './src/screens/Board';
import { NoAccess, SetPassword, SignIn } from './src/screens/Auth';
import { authLink, isConfigured, supabase, type Profile } from './src/supabase';
import { useTheme } from './src/theme';
import { makeStyles } from './src/ui';

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [session, setSession] = useState<Session | null | undefined>(isConfigured ? undefined : null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [needsPassword, setNeedsPassword] = useState(authLink.type === 'invite' || authLink.type === 'recovery');
  const [linkNotice, setLinkNotice] = useState<string | null>(
    authLink.error ? 'That link has expired or was already used. Ask your administrator to send a new one.' : null,
  );

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
      if (event === 'SIGNED_OUT') setNeedsPassword(false);
    });
    // Keep the sign-in fresh only while the app is on screen (phones).
    const sub =
      Platform.OS === 'web'
        ? null
        : AppState.addEventListener('change', (state) => {
            if (state === 'active') supabase!.auth.startAutoRefresh();
            else supabase!.auth.stopAutoRefresh();
          });
    return () => {
      data.subscription.unsubscribe();
      sub?.remove();
    };
  }, []);

  // Clear invitation details from the address bar once they've been used.
  useEffect(() => {
    if (Platform.OS === 'web' && session && typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(undefined);
      return;
    }
    supabase
      .from('profiles')
      .select('id,email,full_name,role,status,assigned_days')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile((data as Profile | null) ?? null));
  }, [session?.user.id]);

  let content: React.ReactNode;
  if (!isConfigured) {
    content = (
      <View style={s.panel}>
        <Text style={s.h2}>Prayer Warriors</Text>
        <Text style={s.body}>This build isn’t connected to the prayer service yet.</Text>
      </View>
    );
  } else if (session === undefined || (session && profile === undefined)) {
    content = <ActivityIndicator color={t.accent} style={{ marginTop: 80 }} />;
  } else if (!session) {
    content = <SignIn s={s} t={t} notice={linkNotice} />;
  } else if (!profile) {
    content = (
      <NoAccess
        s={s}
        t={t}
        title="No Prayer Warrior account"
        message={`You’re signed in as ${session.user.email}, but there’s no Prayer Warrior account for this email. Ask your administrator to add you.`}
      />
    );
  } else if (profile.status !== 'active') {
    content = (
      <NoAccess s={s} t={t} title="Your access has been removed" message="Contact your administrator if you think this is a mistake." />
    );
  } else if (profile.role === 'admin') {
    content = (
      <NoAccess
        s={s}
        t={t}
        title="This app is for Prayer Warriors"
        message="Administrators manage Prayer Warriors and review prayers in the Admin Console."
      />
    );
  } else if (needsPassword) {
    content = (
      <SetPassword
        s={s}
        t={t}
        name={profile.full_name.split(' ')[0]}
        onDone={() => {
          setNeedsPassword(false);
          setLinkNotice(null);
        }}
      />
    );
  } else {
    return (
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        <StatusBar style="auto" />
        <Home s={s} t={t} profile={profile} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={[s.page, { paddingTop: 40, maxWidth: 460 }]} keyboardShouldPersistTaps="handled">
        {content}
      </ScrollView>
    </SafeAreaView>
  );
}
