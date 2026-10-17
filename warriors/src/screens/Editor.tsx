import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DAY_NAMES, fromIso, longDate } from '../dates';
import { Recorder } from '../Recorder';
import { statusLabel } from '../rules';
import { AUDIO_BUCKET, friendlyError, publicAudioUrl, supabase, type PrayerRow } from '../supabase';
import type { Theme } from '../theme';
import { Banner, Button, Chip, Field, type Styles } from '../ui';
import { measureDuration, uploadBody, type PickedAudio } from '../upload';

function extensionFor(audio: PickedAudio): { ext: string; contentType: string } {
  const fromName = audio.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = audio.mimeType.split(';')[0].toLowerCase();
  if (audio.source === 'recording' || mime === 'audio/mp4' || mime === 'audio/x-m4a' || mime === 'audio/m4a' || fromName === 'm4a') {
    return { ext: 'm4a', contentType: 'audio/mp4' };
  }
  if (mime === 'audio/mpeg' || mime === 'audio/mp3' || fromName === 'mp3') return { ext: 'mp3', contentType: 'audio/mpeg' };
  if (mime.includes('wav') || fromName === 'wav') return { ext: 'wav', contentType: 'audio/wav' };
  if (mime === 'audio/aac' || fromName === 'aac') return { ext: 'aac', contentType: 'audio/aac' };
  if (mime === 'audio/3gpp' || fromName === '3gp') return { ext: '3gp', contentType: 'audio/3gpp' };
  return { ext: fromName.replace(/[^a-z0-9]/g, '') || 'mp3', contentType: mime || 'audio/mpeg' };
}

export function Editor({
  s,
  t,
  me,
  date,
  today,
  row,
  onClose,
}: {
  s: Styles;
  t: Theme;
  me: string;
  date: string;
  today: string;
  row?: PrayerRow;
  onClose: (message?: string, updated?: PrayerRow, removedDate?: string) => void;
}) {
  const d = fromIso(date);
  const [title, setTitle] = useState(row?.title ?? '');
  const [theme, setTheme] = useState(row?.theme ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [audio, setAudio] = useState<PickedAudio | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const past = date < today;
  const dirty =
    audio !== null || title !== (row?.title ?? '') || theme !== (row?.theme ?? '') || description !== (row?.description ?? '');

  const submit = async () => {
    setError(null);
    if (!row && !audio) {
      setError('Record your prayer or choose an audio file first.');
      return;
    }
    if (!title.trim()) {
      setError('Add a title.');
      return;
    }

    let audioPath = row?.audio_path ?? '';
    let duration = row?.duration_sec ?? null;
    if (audio) {
      setBusy('Uploading audio…');
      try {
        const { ext, contentType } = extensionFor(audio);
        audioPath = `${me}/${date}-${Date.now()}.${ext}`;
        duration = await measureDuration(audio);
        const body = await uploadBody(audio, contentType);
        const { error: upErr } = await supabase!.storage
          .from(AUDIO_BUCKET)
          .upload(audioPath, body, { contentType, upsert: false, cacheControl: '31536000' });
        if (upErr) throw new Error(upErr.message);
      } catch (e) {
        setBusy(null);
        setError(`The audio didn’t upload. ${friendlyError(e instanceof Error ? e.message : undefined)}`);
        return;
      }
    }

    setBusy('Submitting…');
    const fields = {
      prayer_date: date,
      title: title.trim(),
      theme: theme.trim(),
      description: description.trim(),
      audio_path: audioPath,
      duration_sec: duration,
    };
    const result = row
      ? await supabase!.from('prayers').update(fields).eq('id', row.id).select().single()
      : await supabase!.from('prayers').insert(fields).select().single();

    if (result.error || !result.data) {
      if (audio) await supabase!.storage.from(AUDIO_BUCKET).remove([audioPath]);
      setBusy(null);
      setError(friendlyError(result.error?.message));
      return;
    }
    // Remove the audio this upload replaced (only files in this warrior's own folder).
    if (audio && row?.audio_path && row.audio_path !== audioPath && row.audio_path.startsWith(`${me}/`)) {
      await supabase!.storage.from(AUDIO_BUCKET).remove([row.audio_path]);
    }
    setBusy(null);
    onClose(
      row?.status === 'approved'
        ? `Changes to ${DAY_NAMES[d.getDay()]}’s prayer were sent for review. Listeners will hear the new version once it’s approved.`
        : `${DAY_NAMES[d.getDay()]}’s prayer was submitted. An administrator will review it.`,
      result.data as PrayerRow,
    );
  };

  const withdraw = async () => {
    if (!row) return;
    if (!confirmWithdraw) {
      setConfirmWithdraw(true);
      return;
    }
    setBusy('Withdrawing…');
    const { error: delErr } = await supabase!.from('prayers').delete().eq('id', row.id);
    if (delErr) {
      setBusy(null);
      setError(friendlyError(delErr.message));
      return;
    }
    if (row.audio_path.startsWith(`${me}/`)) await supabase!.storage.from(AUDIO_BUCKET).remove([row.audio_path]);
    setBusy(null);
    onClose(`${DAY_NAMES[d.getDay()]}’s prayer was withdrawn. The day is open again.`, undefined, date);
  };

  const status = row ? statusLabel(row) : null;
  const readOnly = past;

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => onClose()} style={({ pressed }) => [{ alignSelf: 'flex-start', paddingVertical: 6 }, pressed && s.pressed]}>
        <Text style={s.link}>‹ Back to the week</Text>
      </Pressable>

      <View style={[s.panel, { marginTop: 10, gap: 4 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={s.eyebrow}>{date === today ? 'Today' : DAY_NAMES[d.getDay()]}</Text>
            <Text style={s.h2}>{longDate(d)}</Text>
          </View>
          {status ? <Chip s={s} t={t} tone={status.tone} label={status.label} /> : null}
        </View>

        {row?.status === 'rejected' ? (
          <View style={{ marginTop: 12 }}>
            <Banner s={s} t={t} tone="danger" title="An administrator asked for changes">
              {row.review_note || 'No note was left. Record again and resubmit.'}
            </Banner>
          </View>
        ) : null}
        {row?.status === 'approved' && !readOnly ? (
          <View style={{ marginTop: 12 }}>
            <Banner s={s} t={t} tone="accent">
              This prayer is approved. If you change it, it goes back for review and listeners won’t hear it until it’s approved again.
            </Banner>
          </View>
        ) : null}
        {row?.status === 'pending' ? (
          <View style={{ marginTop: 12 }}>
            <Banner s={s} t={t} tone="warn">
              Waiting for an administrator to review it. You can still change it or withdraw it.
            </Banner>
          </View>
        ) : null}
        {readOnly ? (
          <View style={{ marginTop: 12 }}>
            <Banner s={s} t={t} tone="neutral">
              This day has passed, so the prayer can no longer be changed.
            </Banner>
          </View>
        ) : null}

        <Text style={s.label}>Prayer</Text>
        {readOnly ? null : (
          <Recorder
            s={s}
            t={t}
            existingUrl={row ? publicAudioUrl(row.audio_path) : null}
            existingDuration={row?.duration_sec ?? null}
            value={audio}
            onChange={setAudio}
          />
        )}

        <Field s={s} t={t} label="Title" nativeID="title" value={title} onChangeText={setTitle} maxLength={120} placeholder="A Prayer for Strength" editable={!readOnly} />
        <Field s={s} t={t} label="Theme (optional)" nativeID="theme" value={theme} onChangeText={setTheme} maxLength={40} placeholder="Perseverance" editable={!readOnly} />
        <Field
          s={s}
          t={t}
          label="Short description (optional)"
          nativeID="description"
          value={description}
          onChangeText={setDescription}
          maxLength={400}
          multiline
          placeholder="One or two sentences listeners see under the title."
          editable={!readOnly}
        />

        {error ? <Text style={s.error}>{error}</Text> : null}

        {readOnly ? null : (
          <View style={{ marginTop: 20, gap: 12 }}>
            <Button
              s={s}
              t={t}
              label={busy ?? (row ? (row.status === 'rejected' ? 'Resubmit for review' : 'Save and send for review') : 'Submit for review')}
              onPress={submit}
              busy={Boolean(busy)}
              disabled={!dirty}
            />
            {row && row.status !== 'approved' ? (
              <Button
                s={s}
                t={t}
                kind="danger"
                label={confirmWithdraw ? 'Tap again to withdraw this prayer' : 'Withdraw prayer'}
                onPress={withdraw}
                disabled={Boolean(busy)}
              />
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
