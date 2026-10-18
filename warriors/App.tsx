import './src/polyfills';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Platform, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { NoAccess, SetPassword, SignIn } from './src/screens/Auth';
import { CheckEmail, ForgotPassword, SignUp } from './src/screens/SignUp';
import { Shell } from './src/Shell';
import { authLink, isConfigured, PROFILE_FIELDS, supabase, type Profile } from './src/supabase';
import { useTheme } from './src/theme';
import { Banner, makeStyles } from './src/ui';

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}

type Screen = { kind: 'signin' } | { kind: 'signup' } | { kind: 'check-email'; email: string } | { kind: 'forgot' };

function Root() {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [session, setSession] = useState<Session | null | undefined>(isConfigured ? undefined : null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [screen, setScreen] = useState<Screen>({ kind: 'signin' });
  const [needsPassword, setNeedsPassword] = useState(authLink.type === 'invite' || authLink.type === 'recovery');
  const [justConfirmed, setJustConfirmed] = useState(authLink.type === 'signup');
  const [linkNotice, setLinkNotice] = useState<{ tone: 'good' | 'warn'; text: string } | null>(
    authLink.error ? { tone: 'warn', text: 'That link has expired or was already used. Sign in, or request a new link.' } : null,
  );

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setNeedsPassword(true);
      if (event === 'SIGNED_OUT') {
        setNeedsPassword(false);
        setScreen({ kind: 'signin' });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Clear link details from the address bar once they've been used.
  useEffect(() => {
    if (Platform.OS === 'web' && session && typeof window !== 'undefined' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [session]);

  const loadProfile = useCallback(async () => {
    if (!supabase || !session) {
      setProfile(undefined);
      return;
    }
    const { data } = await supabase.from('profiles').select(PROFILE_FIELDS).eq('id', session.user.id).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, [session?.user.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Phones: keep the sign-in fresh while on screen, and pick up approval changes when the app reopens.
  useEffect(() => {
    if (Platform.OS === 'web' || !supabase) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase!.auth.startAutoRefresh();
        loadProfile();
      } else supabase!.auth.stopAutoRefresh();
    });
    return () => sub.remove();
  }, [loadProfile]);

  const frame = (content: React.ReactNode) => (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={[s.page, { paddingTop: 32, maxWidth: 480 }]} keyboardShouldPersistTaps="handled">
        {content}
      </ScrollView>
    </SafeAreaView>
  );

  if (!isConfigured) {
    return frame(
      <View style={s.panel}>
        <Text style={s.h2}>Prayer Warriors</Text>
        <Text style={s.body}>This build isn’t connected to the prayer service yet.</Text>
      </View>,
    );
  }
  if (session === undefined || (session && profile === undefined)) {
    return frame(<ActivityIndicator color={t.accent} style={{ marginTop: 80 }} />);
  }

  if (!session) {
    switch (screen.kind) {
      case 'signup':
        return frame(<SignUp s={s} t={t} onBack={() => setScreen({ kind: 'signin' })} onDone={(email) => setScreen({ kind: 'check-email', email })} />);
      case 'check-email':
        return frame(<CheckEmail s={s} t={t} email={screen.email} onBack={() => setScreen({ kind: 'signin' })} />);
      case 'forgot':
        return frame(<ForgotPassword s={s} t={t} onBack={() => setScreen({ kind: 'signin' })} />);
      default:
        return frame(
          <SignIn s={s} t={t} notice={linkNotice} onCreate={() => setScreen({ kind: 'signup' })} onForgot={() => setScreen({ kind: 'forgot' })} />,
        );
    }
  }

  if (!profile) {
    return frame(
      <NoAccess
        s={s}
        t={t}
        title="No Prayer Warrior account"
        message={`You’re signed in as ${session.user.email}, but there’s no Prayer Warrior account for this email. Create an account, or ask an administrator to add you.`}
      />,
    );
  }
  if (profile.status !== 'active') {
    return frame(<NoAccess s={s} t={t} title="Your access has been removed" message="Contact your administrator if you think this is a mistake." />);
  }
  if (profile.role === 'admin') {
    return frame(
      <NoAccess
        s={s}
        t={t}
        title="This app is for Prayer Warriors"
        message="Administrators manage Prayer Warriors and review prayers in the Admin Console."
      />,
    );
  }
  if (needsPassword) {
    return frame(
      <SetPassword
        s={s}
        t={t}
        name={profile.full_name.split(' ')[0]}
        onDone={() => {
          setNeedsPassword(false);
          setLinkNotice(null);
        }}
      />,
    );
  }

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <Shell
        s={s}
        t={t}
        profile={profile}
        onProfile={setProfile}
        onRefresh={loadProfile}
        banner={
          justConfirmed ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
              <Banner s={s} t={t} tone="good" title="Your email is confirmed">
                <Text style={{ color: t.ink, fontSize: 14, lineHeight: 20 }}>
                  You can now sign in to the Prayer Warriors app on your phone with your email and password.{' '}
                  <Text style={s.link} onPress={() => setJustConfirmed(false)}>
                    Dismiss
                  </Text>
                </Text>
              </Banner>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
