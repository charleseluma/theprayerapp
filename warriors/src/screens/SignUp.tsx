import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { friendlyError, supabase, WARRIORS_URL } from '../supabase';
import type { Theme } from '../theme';
import { Banner, Button, Field, type Styles } from '../ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignUp({ s, t, onBack, onDone }: { s: Styles; t: Theme; onBack: () => void; onDone: (email: string) => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', phone: '', church: '', referred: '', about: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    const email = form.email.trim().toLowerCase();
    if (!form.name.trim()) return setError('Enter your full name.');
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address.');
    if (form.password.length < 8) return setError('Use a password with at least 8 characters.');
    if (form.password !== form.confirm) return setError('The two passwords don’t match.');
    if (!form.phone.trim()) return setError('Enter your phone number.');
    if (!form.church.trim()) return setError('Tell us which church you’re affiliated with.');
    if (!form.referred.trim()) return setError('Tell us who referred you. If nobody did, write “No one”.');

    setBusy(true);
    const { data, error: err } = await supabase!.auth.signUp({
      email,
      password: form.password,
      options: {
        emailRedirectTo: WARRIORS_URL,
        data: {
          source: 'signup',
          full_name: form.name.trim().slice(0, 80),
          phone: form.phone.trim().slice(0, 40),
          church: form.church.trim().slice(0, 120),
          referred_by: form.referred.trim().slice(0, 120),
          about: form.about.trim().slice(0, 1000),
        },
      },
    });
    setBusy(false);
    if (err) return setError(friendlyError(err.message));
    // An existing, confirmed email returns a user with no identities (Supabase hides that it exists).
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return setError('An account with this email already exists. Sign in, or reset your password.');
    }
    onDone(email);
  };

  return (
    <View style={[s.panel, { gap: 2 }]}>
      <Pressable onPress={onBack} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Text style={s.link}>‹ Back to sign in</Text>
      </Pressable>
      <Text style={[s.eyebrow, { marginTop: 8 }]}>Join the Prayer Warriors</Text>
      <Text style={s.h1}>Create an account</Text>
      <Text style={s.body}>
        After you confirm your email, an administrator reviews your request. You can practice recording and listen to prayers
        while you wait.
      </Text>
      <Field s={s} t={t} label="Full name" nativeID="su-name" value={form.name} onChangeText={set('name')} maxLength={80} autoComplete="name" />
      <Field
        s={s}
        t={t}
        label="Email"
        nativeID="su-email"
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        inputMode="email"
        autoComplete="email"
      />
      <Field s={s} t={t} label="Password (at least 8 characters)" nativeID="su-password" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" />
      <Field s={s} t={t} label="Type the password again" nativeID="su-confirm" value={form.confirm} onChangeText={set('confirm')} secureTextEntry autoComplete="new-password" />
      <Field s={s} t={t} label="Phone number" nativeID="su-phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" inputMode="tel" autoComplete="tel" maxLength={40} />
      <Field s={s} t={t} label="Which church are you affiliated with?" nativeID="su-church" value={form.church} onChangeText={set('church')} maxLength={120} />
      <Field s={s} t={t} label="Who referred you?" nativeID="su-referred" value={form.referred} onChangeText={set('referred')} maxLength={120} placeholder="Name of the person who invited you" />
      <Field
        s={s}
        t={t}
        label="Tell us about yourself (optional)"
        nativeID="su-about"
        value={form.about}
        onChangeText={set('about')}
        maxLength={1000}
        multiline
        placeholder="Your ministry, why you’d like to join, anything the team should know."
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={{ marginTop: 18 }}>
        <Button s={s} t={t} label="Create account" onPress={submit} busy={busy} />
      </View>
      <Text style={[s.small, { marginTop: 12, textAlign: 'center' }]}>
        Your details are only shared with the Prayer App administrators.
      </Text>
    </View>
  );
}

export function CheckEmail({ s, t, email, onBack }: { s: Styles; t: Theme; email: string; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null);
  const resend = async () => {
    setBusy(true);
    const { error } = await supabase!.auth.resend({ type: 'signup', email, options: { emailRedirectTo: WARRIORS_URL } });
    setBusy(false);
    setNote(error ? { tone: 'danger', text: friendlyError(error.message) } : { tone: 'good', text: 'We sent the email again.' });
  };
  return (
    <View style={[s.panel, { gap: 10 }]}>
      <Text style={s.eyebrow}>One more step</Text>
      <Text style={s.h1}>Check your email</Text>
      <Text style={s.body}>
        We sent a confirmation link to <Text style={{ color: t.ink, fontWeight: '600' }}>{email}</Text>. Open it to confirm your account,
        then come back and sign in.
      </Text>
      <Text style={s.small}>Can’t find it? Check your spam or promotions folder.</Text>
      {note ? (
        <Banner s={s} t={t} tone={note.tone}>
          {note.text}
        </Banner>
      ) : null}
      <View style={{ gap: 10, marginTop: 6 }}>
        <Button s={s} t={t} label="Back to sign in" onPress={onBack} />
        <Button s={s} t={t} kind="secondary" label="Send the email again" onPress={resend} busy={busy} />
      </View>
    </View>
  );
}

export function ForgotPassword({ s, t, onBack }: { s: Styles; t: Theme; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError('Enter the email you signed up with.');
    setBusy(true);
    const { error: err } = await supabase!.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: WARRIORS_URL });
    setBusy(false);
    if (err) return setError(friendlyError(err.message));
    setSent(true);
  };
  return (
    <View style={[s.panel, { gap: 4 }]}>
      <Pressable onPress={onBack} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Text style={s.link}>‹ Back to sign in</Text>
      </Pressable>
      <Text style={[s.h1, { marginTop: 8 }]}>Reset your password</Text>
      {sent ? (
        <Text style={s.body}>
          If an account exists for {email.trim()}, we’ve emailed a link to choose a new password. Open it on this phone or any
          computer.
        </Text>
      ) : (
        <>
          <Text style={s.body}>Enter your email and we’ll send you a link to choose a new password.</Text>
          <Field s={s} t={t} label="Email" nativeID="fp-email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" inputMode="email" />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <View style={{ marginTop: 18 }}>
            <Button s={s} t={t} label="Send reset link" onPress={submit} busy={busy} />
          </View>
        </>
      )}
    </View>
  );
}
