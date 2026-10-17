import { useState } from 'react';
import { Text, View } from 'react-native';

import { friendlyError, supabase } from '../supabase';
import type { Theme } from '../theme';
import { Banner, Button, Field, type Styles } from '../ui';

export function SignIn({ s, t, notice }: { s: Styles; t: Theme; notice?: string | null }) {
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
      <Text style={s.h1}>Prayer Warriors</Text>
      <Text style={[s.body, { marginBottom: 6 }]}>Sign in to record and submit the daily prayers.</Text>
      {notice ? (
        <Banner s={s} t={t} tone="warn">
          {notice}
        </Banner>
      ) : null}
      <Field
        s={s}
        t={t}
        label="Email"
        nativeID="email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
      />
      <Field
        s={s}
        t={t}
        label="Password"
        nativeID="password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        onSubmitEditing={submit}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={{ marginTop: 18 }}>
        <Button s={s} t={t} label="Sign in" onPress={submit} busy={busy} />
      </View>
      <Text style={[s.small, { marginTop: 14, textAlign: 'center' }]}>
        New, or forgot your password? Ask your administrator to send you a link.
      </Text>
    </View>
  );
}

/** Shown after opening an invitation or new-password link from an administrator. */
export function SetPassword({ s, t, name, onDone }: { s: Styles; t: Theme; name: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(friendlyError(err.message));
      return;
    }
    supabase!.rpc('record_sign_in').then(() => {});
    onDone();
  };

  return (
    <View style={[s.panel, { gap: 4 }]}>
      <Text style={s.eyebrow}>Welcome{name ? `, ${name}` : ''}</Text>
      <Text style={s.h1}>Choose your password</Text>
      <Text style={s.body}>
        You’ll use your email and this password to sign in to the Prayer Warriors app on your phone, or on this page.
      </Text>
      <Field s={s} t={t} label="New password" nativeID="new-password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <Field
        s={s}
        t={t}
        label="Type it again"
        nativeID="confirm-password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        onSubmitEditing={submit}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={{ marginTop: 18 }}>
        <Button s={s} t={t} label="Save password" onPress={submit} busy={busy} />
      </View>
    </View>
  );
}

export function NoAccess({ s, t, title, message }: { s: Styles; t: Theme; title: string; message: string }) {
  return (
    <View style={[s.panel, { gap: 8 }]}>
      <Text style={s.h2}>{title}</Text>
      <Text style={s.body}>{message}</Text>
      <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
        <Button s={s} t={t} kind="secondary" label="Sign out" onPress={() => supabase!.auth.signOut()} small />
      </View>
    </View>
  );
}
