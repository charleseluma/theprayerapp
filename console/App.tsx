import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { ActivityLog } from './src/screens/ActivityLog';
import { People } from './src/screens/People';
import { Requests } from './src/screens/Requests';
import { Review } from './src/screens/Review';
import { friendlyError, isConfigured, supabase, type Profile } from './src/supabase';
import { useTheme, type Theme } from './src/theme';
import { Button, Field, makeStyles, type Styles } from './src/ui';

type Tab = 'review' | 'requests' | 'people' | 'activity';
const TABS: { key: Tab; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'requests', label: 'Requests' },
  { key: 'people', label: 'Prayer Warriors' },
  { key: 'activity', label: 'Activity' },
];

function readTab(): Tab {
  if (typeof window === 'undefined') return 'review';
  const h = window.location.hash.replace('#', '');
  return (TABS.find((x) => x.key === h)?.key ?? 'review') as Tab;
}

export default function App() {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [session, setSession] = useState<Session | null | undefined>(isConfigured ? undefined : null);
  const [me, setMe] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setMe(undefined);
      return;
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setMe((data as Profile | null) ?? null));
  }, [session?.user.id]);

  let body: React.ReactNode;
  if (!isConfigured) {
    body = <Notice s={s} title="Admin Console" text="This build isn’t connected to the prayer service yet." />;
  } else if (session === undefined || (session && me === undefined)) {
    body = <ActivityIndicator color={t.accent} style={{ marginTop: 80 }} />;
  } else if (!session) {
    body = <SignIn s={s} t={t} />;
  } else if (!me || me.role !== 'admin' || me.status !== 'active') {
    body = (
      <Notice
        s={s}
        title="Administrators only"
        text={`${session.user.email} isn’t an administrator. Prayer Warriors use the Prayer Warriors app.`}
        action={<Button s={s} t={t} small kind="secondary" label="Sign out" onPress={() => supabase!.auth.signOut()} />}
      />
    );
  } else {
    return <Console s={s} t={t} me={me} />;
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.page, { paddingTop: 56, maxWidth: 440 }]}>
      {body}
    </ScrollView>
  );
}

function Notice({ s, title, text, action }: { s: Styles; title: string; text: string; action?: React.ReactNode }) {
  return (
    <View style={[s.panel, { gap: 8 }]}>
      <Text style={s.h2}>{title}</Text>
      <Text style={s.body}>{text}</Text>
      {action ? <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>{action}</View> : null}
    </View>
  );
}

function SignIn({ s, t }: { s: Styles; t: Theme }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(friendlyError(err.message));
    else supabase!.rpc('record_sign_in').then(() => {});
  };
  return (
    <View style={[s.panel, { gap: 4 }]}>
      <Text style={s.eyebrow}>The Prayer App</Text>
      <Text style={s.h1}>Admin Console</Text>
      <Text style={s.body}>Manage Prayer Warriors and review prayers.</Text>
      <Field s={s} t={t} label="Email" nativeID="email" value={email} onChangeText={setEmail} autoCapitalize="none" inputMode="email" autoComplete="email" />
      <Field s={s} t={t} label="Password" nativeID="password" value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={{ marginTop: 18 }}>
        <Button s={s} t={t} label="Sign in" onPress={submit} busy={busy} />
      </View>
    </View>
  );
}

function Console({ s, t, me }: { s: Styles; t: Theme; me: Profile }) {
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [tab, setTabState] = useState<Tab>(readTab);
  const [people, setPeople] = useState<Profile[]>([]);
  const [counts, setCounts] = useState<Map<string, { total: number; approved: number }>>(new Map());
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const setTab = (next: Tab) => {
    setTabState(next);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${next}`);
  };

  const loadPeople = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase!.from('profiles').select('*').order('full_name'),
      supabase!.from('prayers').select('created_by,status').not('created_by', 'is', null).limit(5000),
    ]);
    if (p.error) {
      setLoadError(friendlyError(p.error.message));
      return;
    }
    setPeople(p.data as Profile[]);
    const m = new Map<string, { total: number; approved: number }>();
    for (const r of (c.data ?? []) as { created_by: string; status: string }[]) {
      const x = m.get(r.created_by) ?? { total: 0, approved: 0 };
      x.total += 1;
      if (r.status === 'approved') x.approved += 1;
      m.set(r.created_by, x);
    }
    setCounts(m);
  }, []);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const requestCount = people.filter((p) => p.role === 'warrior' && p.approval === 'pending').length;
  const onCount = useCallback((n: number) => setPendingCount(n), []);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={{ backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.line }}>
        <View style={{ maxWidth: 1040, width: '100%', alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <View>
              <Text style={s.eyebrow}>The Prayer App</Text>
              <Text style={[s.h2, { marginTop: 0 }]}>Admin Console</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {wide ? <Text style={s.small}>{me.email}</Text> : null}
              <Pressable onPress={() => supabase!.auth.signOut()}>
                <Text style={s.link}>Sign out</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }} accessibilityRole="tablist">
            {TABS.map((x) => {
              const on = x.key === tab;
              return (
                <Pressable
                  key={x.key}
                  onPress={() => setTab(x.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    borderBottomWidth: 3,
                    borderBottomColor: on ? t.accent : 'transparent',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Text style={{ color: on ? t.ink : t.muted, fontWeight: '600', fontSize: 15 }}>{x.label}</Text>
                  {(x.key === 'review' ? pendingCount : x.key === 'requests' ? requestCount : 0) ? (
                    <View style={{ backgroundColor: t.warn, borderRadius: 999, minWidth: 20, paddingHorizontal: 6, alignItems: 'center' }}>
                      <Text style={{ color: t.card, fontSize: 12, fontWeight: '700' }}>
                        {x.key === 'review' ? pendingCount : requestCount}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={{ maxWidth: 1040, width: '100%', alignSelf: 'center', paddingHorizontal: 16, paddingTop: 22 }}>
        {loadError ? <Text style={s.error}>{loadError}</Text> : null}
        {tab === 'review' ? <Review s={s} t={t} people={byId} onCountChange={onCount} /> : null}
 {tab === 'requests' ? <Requests s={s} t={t} people={people} onChanged={loadPeople} /> : null}
        {tab === 'people' ? <People s={s} t={t} people={people} counts={counts} onChanged={loadPeople} /> : null}
        {tab === 'activity' ? <ActivityLog s={s} t={t} people={people} /> : null}
      </View>
    </ScrollView>
  );
}
