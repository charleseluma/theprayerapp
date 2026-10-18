import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { dayList } from '../dates';
import { friendlyError, supabase, type Profile } from '../supabase';
import type { Theme } from '../theme';
import { Banner, Button, Field, type Styles } from '../ui';

export function ProfileScreen({ s, t, profile, onSaved }: { s: Styles; t: Theme; profile: Profile; onSaved: (p: Profile) => void }) {
  const [form, setForm] = useState({ name: profile.full_name, phone: profile.phone, church: profile.church, about: profile.about });
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [message, setMessage] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = form.name !== profile.full_name || form.phone !== profile.phone || form.church !== profile.church || form.about !== profile.about;

  const save = async () => {
    if (!form.name.trim()) return setMessage({ tone: 'danger', text: 'Your name can’t be empty.' });
    setBusy('save');
    const { data, error } = await supabase!
      .from('profiles')
      .update({ full_name: form.name.trim(), phone: form.phone.trim(), church: form.church.trim(), about: form.about.trim() })
      .eq('id', profile.id)
      .select()
      .single();
    setBusy(null);
    if (error || !data) return setMessage({ tone: 'danger', text: friendlyError(error?.message) });
    setMessage({ tone: 'good', text: 'Saved.' });
    onSaved({ ...profile, ...(data as Partial<Profile>) });
  };

  const deleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy('delete');
    const { error } = await supabase!.functions.invoke('team-admin', { body: { action: 'delete_self' } });
    if (error) {
      setBusy(null);
      setMessage({ tone: 'danger', text: 'Your account couldn’t be deleted. Check your connection and try again.' });
      return;
    }
    await supabase!.auth.signOut();
  };

  return (
    <ScrollView contentContainerStyle={[s.page, { gap: 14 }]} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={s.eyebrow}>Profile</Text>
        <Text style={s.h1}>Your details</Text>
      </View>
      {message ? <Banner s={s} t={t} tone={message.tone}>{message.text}</Banner> : null}

      <View style={[s.panel, { gap: 2 }]}>
        <Text style={s.small}>Email</Text>
        <Text style={{ color: t.ink, fontSize: 16 }} selectable>
          {profile.email}
        </Text>
        {profile.referred_by ? <Text style={[s.small, { marginTop: 8 }]}>Referred by {profile.referred_by}</Text> : null}
        {profile.approval === 'approved' ? (
          <Text style={[s.small, { marginTop: 8 }]}>
            {profile.assigned_days.length ? `Your days: ${dayList(profile.assigned_days)}` : 'No assigned days: you can post on open days.'}
          </Text>
        ) : null}
        <Field s={s} t={t} label="Full name" nativeID="pf-name" value={form.name} onChangeText={set('name')} maxLength={80} />
        <Field s={s} t={t} label="Phone number" nativeID="pf-phone" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={40} />
        <Field s={s} t={t} label="Church" nativeID="pf-church" value={form.church} onChangeText={set('church')} maxLength={120} />
        <Field s={s} t={t} label="About you" nativeID="pf-about" value={form.about} onChangeText={set('about')} maxLength={1000} multiline />
        <View style={{ marginTop: 18 }}>
          <Button s={s} t={t} label="Save changes" onPress={save} busy={busy === 'save'} disabled={!dirty} />
        </View>
      </View>

      <Button s={s} t={t} kind="secondary" label="Sign out" onPress={() => supabase!.auth.signOut()} />

      <View style={[s.panel, { gap: 10 }]}>
        <Text style={s.h2}>Delete your account</Text>
        <Text style={s.body}>
          This permanently deletes your account, your details and any prayers that haven’t been approved. Prayers that were already
          approved stay on The Prayer App for listeners, without your name. This can’t be undone.
        </Text>
        <Button
          s={s}
          t={t}
          kind="danger"
          label={confirmDelete ? 'Tap again to permanently delete' : 'Delete my account'}
          onPress={deleteAccount}
          busy={busy === 'delete'}
        />
        {confirmDelete && busy !== 'delete' ? (
          <Text onPress={() => setConfirmDelete(false)} style={[s.link, { alignSelf: 'center' }]}>
            Keep my account
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
