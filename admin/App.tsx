import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { AUDIO_BUCKET, isConfigured, publicAudioUrl, supabase, type PrayerRow } from './src/supabase';
import { serif, useTheme, type Theme } from './src/theme';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_AUDIO_MB = 50;

// ─── Dates ────────────────────────────────────────────────────────────────────

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay());
}
function fromIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type DayStatus = 'live' | 'scheduled' | 'hidden' | 'empty';

function statusOf(row: PrayerRow | undefined, date: string, today: string): DayStatus {
  if (!row) return 'empty';
  if (!row.published) return 'hidden';
  return date > today ? 'scheduled' : 'live';
}

const STATUS_LABEL: Record<DayStatus, string> = {
  live: 'Live',
  scheduled: 'Scheduled',
  hidden: 'Hidden',
  empty: 'Not posted',
};

// ─── Browser helpers (this page only runs on the web) ─────────────────────────

function pickAudioFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.m4a,.wav,.aac';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

function formatDuration(sec: number | null | undefined): string {
  if (!sec) return '';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function safeFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'mp3';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'prayer'}.${ext || 'mp3'}`;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(isConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.page}>
        {!isConfigured ? (
          <Panel s={s}>
            <Text style={s.h1}>Prayer uploads</Text>
            <Text style={s.body}>
              This page isn’t connected to the prayer service yet. Once the Supabase project address and key are added to
              the build, you’ll be able to sign in here.
            </Text>
          </Panel>
        ) : checking ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 80 }} />
        ) : session ? (
          <Dashboard s={s} t={t} session={session} />
        ) : (
          <SignIn s={s} t={t} />
        )}
      </ScrollView>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function Panel({ s, children }: { s: Styles; children: React.ReactNode }) {
  return <View style={s.panel}>{children}</View>;
}

// ─── Sign in ──────────────────────────────────────────────────────────────────

function SignIn({ s, t }: { s: Styles; t: Theme }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(err.message === 'Invalid login credentials' ? 'That email and password don’t match.' : err.message);
  };

  return (
    <View style={[s.panel, { maxWidth: 420, alignSelf: 'center', width: '100%', marginTop: 48 }]}>
      <Text style={s.eyebrow}>The Prayer App</Text>
      <Text style={s.h1}>Prayer uploads</Text>
      <Text style={[s.body, { marginBottom: 20 }]}>Sign in to post and manage the daily prayers.</Text>

      <Text style={s.label}>Email</Text>
      <TextInput
        id="email"
        style={s.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        inputMode="email"
        placeholderTextColor={t.muted}
      />
      <Text style={s.label}>Password</Text>
      <TextInput
        id="password"
        style={s.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        onSubmitEditing={submit}
      />
      {error && <Text style={s.error}>{error}</Text>}
      <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}>
        {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={s.primaryBtnText}>Sign in</Text>}
      </Pressable>
    </View>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ s, t, session }: { s: Styles; t: Theme; session: Session }) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const today = iso(new Date());

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [rows, setRows] = useState<Map<string, PrayerRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ date: string; msg: string } | null>(null);

  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => iso(addDays(weekStart, i))), [weekStart]);

  useEffect(() => {
    supabase!
      .from('admins')
      .select('email')
      .limit(1)
      .then(({ data, error }) => setIsAdmin(!error && (data?.length ?? 0) > 0));
  }, [session.user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase!
      .from('prayers')
      .select('*')
      .gte('prayer_date', dates[0])
      .lte('prayer_date', dates[6]);
    setLoading(false);
    if (error) {
      setLoadError('Couldn’t load this week. Check your connection and try again.');
      return;
    }
    setRows(new Map((data as PrayerRow[]).map((r) => [r.prayer_date, r])));
  }, [dates]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // Open today's day by default on wide screens.
  useEffect(() => {
    if (wide && !editing) setEditing(dates.includes(today) ? today : dates[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, dates]);

  const signOut = () => supabase!.auth.signOut();

  if (isAdmin === null) return <ActivityIndicator color={t.accent} style={{ marginTop: 80 }} />;

  if (!isAdmin) {
    return (
      <Panel s={s}>
        <Text style={s.h1}>This account can’t post prayers</Text>
        <Text style={s.body}>
          You’re signed in as {session.user.email}, but that address isn’t on the list of people allowed to post. Add it to
          the admins table in Supabase, then sign in again.
        </Text>
        <Pressable onPress={signOut} style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}>
          <Text style={s.secondaryBtnText}>Sign out</Text>
        </Pressable>
      </Panel>
    );
  }

  const header = (
    <View style={s.topbar}>
      <View style={{ flexShrink: 1 }}>
        <Text style={s.eyebrow}>The Prayer App</Text>
        <Text style={s.h1}>Prayer uploads</Text>
      </View>
      <View style={s.topbarRight}>
        <Text style={s.small} numberOfLines={1}>
          {session.user.email}
        </Text>
        <Pressable onPress={signOut} style={({ pressed }) => [s.linkBtn, pressed && s.pressed]}>
          <Text style={s.linkBtnText}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );

  const weekNav = (
    <View style={s.weekNav}>
      <Pressable
        onPress={() => {
          setWeekStart((w) => addDays(w, -7));
          setEditing(null);
        }}
        accessibilityLabel="Previous week"
        style={({ pressed }) => [s.navBtn, pressed && s.pressed]}
      >
        <Text style={s.navBtnText}>‹</Text>
      </Pressable>
      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text style={s.weekTitle}>
          {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}
        </Text>
        {dates.includes(today) ? <Text style={s.small}>This week</Text> : null}
      </View>
      <Pressable
        onPress={() => {
          setWeekStart((w) => addDays(w, 7));
          setEditing(null);
        }}
        accessibilityLabel="Next week"
        style={({ pressed }) => [s.navBtn, pressed && s.pressed]}
      >
        <Text style={s.navBtnText}>›</Text>
      </Pressable>
    </View>
  );

  const list = (
    <View style={s.list}>
      {loading && rows.size === 0 ? (
        <ActivityIndicator color={t.accent} style={{ padding: 32 }} />
      ) : (
        dates.map((date, i) => {
          const row = rows.get(date);
          const st = statusOf(row, date, today);
          const active = editing === date;
          return (
            <Pressable
              key={date}
              onPress={() => setEditing(date)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                s.row,
                i < 6 && s.rowDivider,
                active && s.rowActive,
                pressed && s.rowPressed,
              ]}
            >
              <View style={s.rowDate}>
                <Text style={[s.rowDay, date === today && { color: t.accent }]}>{DAY_NAMES[i].slice(0, 3)}</Text>
                <Text style={s.rowNum}>{fromIso(date).getDate()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.rowTitle, !row && { color: t.muted }]} numberOfLines={1}>
                  {row ? row.title : date === today ? 'Today — not posted yet' : 'Nothing posted'}
                </Text>
                {row ? (
                  <Text style={s.small} numberOfLines={1}>
                    {[row.theme, formatDuration(row.duration_sec)].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </View>
              <StatusChip s={s} status={st} />
            </Pressable>
          );
        })
      )}
    </View>
  );

  const editor = editing ? (
    <Editor
      key={`${editing}|${rows.get(editing)?.updated_at ?? ''}`}
      s={s}
      t={t}
      date={editing}
      today={today}
      row={rows.get(editing)}
      onBack={wide ? undefined : () => setEditing(null)}
      flash={flash?.date === editing ? flash.msg : null}
      onSaved={(r, msg) => {
        setRows((prev) => new Map(prev).set(r.prayer_date, r));
        setFlash({ date: r.prayer_date, msg });
      }}
    />
  ) : null;

  return (
    <View>
      {header}
      {loadError && (
        <View style={s.banner}>
          <Text style={s.bannerText}>{loadError}</Text>
          <Pressable onPress={load}>
            <Text style={s.linkBtnText}>Try again</Text>
          </Pressable>
        </View>
      )}
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ width: 380 }}>
            {weekNav}
            {list}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>{editor}</View>
        </View>
      ) : editor ? (
        editor
      ) : (
        <>
          {weekNav}
          {list}
        </>
      )}
    </View>
  );
}

function StatusChip({ s, status }: { s: Styles; status: DayStatus }) {
  return (
    <View style={[s.chip, s[`chip_${status}`]]}>
      <Text style={[s.chipText, s[`chipText_${status}`]]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function Editor({
  s,
  t,
  date,
  today,
  row,
  onBack,
  onSaved,
  flash,
}: {
  s: Styles;
  t: Theme;
  date: string;
  today: string;
  row?: PrayerRow;
  onBack?: () => void;
  onSaved: (row: PrayerRow, message: string) => void;
  flash: string | null;
}) {
  const d = fromIso(date);
  const [title, setTitle] = useState(row?.title ?? '');
  const [theme, setTheme] = useState(row?.theme ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [published, setPublished] = useState(row?.published ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  const choose = async () => {
    const picked = await pickAudioFile();
    if (!picked) return;
    if (!picked.type.startsWith('audio/') && !/\.(mp3|m4a|wav|aac)$/i.test(picked.name)) {
      setError('That file isn’t audio. Choose an MP3, M4A, WAV or AAC file.');
      return;
    }
    if (picked.size > MAX_AUDIO_MB * 1024 * 1024) {
      setError(`That file is ${(picked.size / 1024 / 1024).toFixed(0)} MB. The limit is ${MAX_AUDIO_MB} MB.`);
      return;
    }
    setError(null);
    setFile(picked);
    setFileUrl(URL.createObjectURL(picked));
  };

  const dirty =
    file !== null ||
    title !== (row?.title ?? '') ||
    theme !== (row?.theme ?? '') ||
    description !== (row?.description ?? '') ||
    published !== (row?.published ?? true);

  const save = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Add a title before publishing.');
      return;
    }
    if (!row && !file) {
      setError('Choose the audio file for this prayer.');
      return;
    }

    let audioPath = row?.audio_path ?? '';
    let duration = row?.duration_sec ?? null;
    if (file) {
      setBusy('Uploading audio…');
      audioPath = `${date}/${Date.now()}-${safeFileName(file.name)}`;
      duration = await audioDuration(file);
      const { error: upErr } = await supabase!.storage
        .from(AUDIO_BUCKET)
        .upload(audioPath, file, { contentType: file.type || 'audio/mpeg', upsert: false, cacheControl: '31536000' });
      if (upErr) {
        setBusy(null);
        setError(`The audio didn’t upload: ${upErr.message}`);
        return;
      }
    }

    setBusy('Saving…');
    const { data, error: dbErr } = await supabase!
      .from('prayers')
      .upsert(
        {
          prayer_date: date,
          title: title.trim(),
          theme: theme.trim(),
          description: description.trim(),
          audio_path: audioPath,
          duration_sec: duration,
          published,
        },
        { onConflict: 'prayer_date' },
      )
      .select()
      .single();

    if (dbErr || !data) {
      setBusy(null);
      setError(`The prayer didn’t save: ${dbErr?.message ?? 'unknown error'}`);
      if (file) await supabase!.storage.from(AUDIO_BUCKET).remove([audioPath]);
      return;
    }

    // Remove the audio this upload replaced.
    if (file && row?.audio_path && row.audio_path !== audioPath) {
      await supabase!.storage.from(AUDIO_BUCKET).remove([row.audio_path]);
    }

    setBusy(null);
    const msg = !published
      ? 'Saved. Hidden from listeners.'
      : date > today
        ? `Saved. Listeners will hear it on ${DAY_NAMES[d.getDay()]}.`
        : 'Published. Listeners can hear it now.';
    onSaved(data as PrayerRow, msg);
  };

  const existingAudioUrl = row ? publicAudioUrl(row.audio_path) : null;
  const previewUrl = fileUrl ?? existingAudioUrl;
  const status = statusOf(row, date, today);

  return (
    <View style={s.panel}>
      {onBack && (
        <Pressable onPress={onBack} style={({ pressed }) => [s.backBtn, pressed && s.pressed]}>
          <Text style={s.linkBtnText}>‹ Back to the week</Text>
        </Pressable>
      )}
      <View style={s.editorHead}>
        <View style={{ flexShrink: 1 }}>
          <Text style={s.eyebrow}>{date === today ? 'Today' : DAY_NAMES[d.getDay()]}</Text>
          <Text style={s.h2}>{d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        </View>
        <StatusChip s={s} status={status} />
      </View>

      <Text style={s.label}>Audio</Text>
      <View style={s.audioBox}>
        {previewUrl ? (
          createElement('audio', {
            src: previewUrl,
            controls: true,
            preload: 'metadata',
            style: { width: '100%', display: 'block' },
          })
        ) : (
          <Text style={s.body}>No audio yet.</Text>
        )}
        <View style={s.audioRow}>
          <Text style={[s.small, { flex: 1, minWidth: 0 }]} numberOfLines={1}>
            {file
              ? `New file: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`
              : row
                ? `Current file${row.duration_sec ? ` · ${formatDuration(row.duration_sec)}` : ''}`
                : 'MP3, M4A, WAV or AAC, up to 50 MB'}
          </Text>
          <Pressable onPress={choose} style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}>
            <Text style={s.secondaryBtnText}>{row || file ? 'Replace audio' : 'Choose audio file'}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={s.label}>Title</Text>
      <TextInput
        id="title"
        style={s.input}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        placeholder="A Prayer for Strength"
        placeholderTextColor={t.muted}
      />

      <Text style={s.label}>Theme (optional)</Text>
      <TextInput
        id="theme"
        style={s.input}
        value={theme}
        onChangeText={setTheme}
        maxLength={40}
        placeholder="Perseverance"
        placeholderTextColor={t.muted}
      />

      <Text style={s.label}>Short description (optional)</Text>
      <TextInput
        id="description"
        style={[s.input, { minHeight: 88, textAlignVertical: 'top' }]}
        value={description}
        onChangeText={setDescription}
        maxLength={400}
        multiline
        placeholder="One or two sentences listeners see under the title."
        placeholderTextColor={t.muted}
      />

      <View style={s.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle}>Visible to listeners</Text>
          <Text style={s.small}>
            {date > today
              ? `Appears automatically on ${DAY_NAMES[d.getDay()]}.`
              : 'Turn off to hide this prayer without deleting it.'}
          </Text>
        </View>
        <Switch
          value={published}
          onValueChange={setPublished}
          trackColor={{ true: t.accent, false: t.line }}
          thumbColor={t.card}
          {...({ activeThumbColor: t.card } as object)}
        />
      </View>

      {error && <Text style={s.error}>{error}</Text>}
      {flash && !dirty && <Text style={s.success}>{flash}</Text>}

      <Pressable
        onPress={save}
        disabled={Boolean(busy) || !dirty}
        style={({ pressed }) => [s.primaryBtn, (!dirty || busy) && s.disabled, pressed && s.pressed]}
      >
        {busy ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <ActivityIndicator color={t.onAccent} />
            <Text style={s.primaryBtnText}>{busy}</Text>
          </View>
        ) : (
          <Text style={s.primaryBtnText}>
            {!dirty ? 'No changes' : row ? 'Save changes' : date > today ? 'Schedule prayer' : 'Publish prayer'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(t: Theme) {
  const chipBase = { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 } as const;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg, minHeight: '100%' as unknown as number },
    page: { paddingHorizontal: 16, paddingVertical: 24, maxWidth: 1100, width: '100%', alignSelf: 'center' },
    panel: {
      backgroundColor: t.card,
      borderRadius: 20,
      padding: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
    },
    topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, gap: 16, flexWrap: 'wrap' },
    topbarRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    eyebrow: { color: t.accent, fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
    h1: { color: t.ink, fontFamily: serif, fontSize: 30, marginTop: 4 },
    h2: { color: t.ink, fontFamily: serif, fontSize: 24, marginTop: 4 },
    body: { color: t.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },
    small: { color: t.muted, fontSize: 13 },
    label: { color: t.ink, fontSize: 14, fontWeight: '600', marginTop: 18, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 16,
      color: t.ink,
      backgroundColor: t.bg,
    },
    error: { color: t.danger, fontSize: 14, marginTop: 14 },
    success: { color: t.good, fontSize: 14, marginTop: 14, fontWeight: '500' },

    primaryBtn: {
      marginTop: 20,
      backgroundColor: t.accent,
      borderRadius: 999,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: t.onAccent, fontSize: 16, fontWeight: '600' },
    secondaryBtn: {
      borderWidth: 1.5,
      borderColor: t.accent,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 14,
      alignSelf: 'flex-start',
    },
    secondaryBtnText: { color: t.accent, fontSize: 14, fontWeight: '600' },
    linkBtn: { paddingVertical: 6 },
    linkBtnText: { color: t.accent, fontSize: 14, fontWeight: '600' },
    backBtn: { marginBottom: 12, alignSelf: 'flex-start' },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.7 },

    banner: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      backgroundColor: t.accentSoft,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
      flexWrap: 'wrap',
    },
    bannerText: { color: t.ink, fontSize: 14, flex: 1 },

    weekNav: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
    navBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.card,
    },
    navBtnText: { color: t.ink, fontSize: 22, lineHeight: 24 },
    weekTitle: { color: t.ink, fontSize: 17, fontWeight: '600' },

    list: {
      backgroundColor: t.card,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 14 },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    rowActive: { backgroundColor: t.accentSoft },
    rowPressed: { opacity: 0.8 },
    rowDate: { width: 40, alignItems: 'center' },
    rowDay: { color: t.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    rowNum: { color: t.ink, fontSize: 20, fontVariant: ['tabular-nums'] },
    rowTitle: { color: t.ink, fontSize: 15, fontWeight: '500' },

    chip: chipBase,
    chipText: { fontSize: 12, fontWeight: '600' },
    chip_live: { backgroundColor: t.goodSoft },
    chipText_live: { color: t.good },
    chip_scheduled: { backgroundColor: t.accentSoft },
    chipText_scheduled: { color: t.accent },
    chip_hidden: { backgroundColor: t.line },
    chipText_hidden: { color: t.muted },
    chip_empty: { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.line },
    chipText_empty: { color: t.muted },

    editorHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    audioBox: { borderWidth: 1, borderColor: t.line, borderRadius: 14, padding: 14, gap: 12, backgroundColor: t.bg },
    audioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20 },
  });
}
