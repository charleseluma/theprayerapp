import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  requestNotificationPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';

import { usePrayerWeek } from './src/content/usePrayerWeek';
import type { WeekDay } from './src/content/week';
import { serif, useTheme, type Theme } from './src/theme';

const APP_NAME = 'The Prayer App';
const SKIP_SECONDS = 15;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatToday(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function audioKey(day: WeekDay | undefined): string | null {
  if (!day?.prayer) return null;
  const a = day.prayer.audio;
  return `${day.date}|${typeof a === 'number' ? a : a && typeof a === 'object' ? a.uri : ''}`;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PrayerScreen />
    </SafeAreaProvider>
  );
}

function PrayerScreen() {
  const t = useTheme();
  const s = useMemo(() => makeStyles(t), [t]);
  const { state, refreshing, refresh } = usePrayerWeek();

  const days = state.status === 'ready' ? state.days : [];
  const today = days.find((d) => d.isToday);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Start on today's prayer, and jump back to today when a new day or week begins.
  const loadedOn = state.status === 'ready' ? state.loadedOn : null;
  useEffect(() => {
    if (loadedOn) setSelectedDate((cur) => (cur && days.some((d) => d.date === cur) ? cur : loadedOn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedOn]);

  const selected = days.find((d) => d.date === selectedDate) ?? today;
  const prayer = selected?.prayer ?? null;

  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const loadedKey = useRef<string | null>(null);
  const lockScreenOn = useRef(false);
  const askedNotifications = useRef(false);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {});
  }, []);

  // Load the selected prayer into the player (without interrupting one that is playing).
  const selectedKey = audioKey(selected);
  useEffect(() => {
    if (!selected?.prayer || !selectedKey || selectedKey === loadedKey.current) return;
    if (status.playing && loadedKey.current?.startsWith(`${selected.date}|`)) return;
    player.replace(selected.prayer.audio);
    loadedKey.current = selectedKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish, player]);

  const showOnLockScreen = (day: WeekDay) => {
    if (!day.prayer) return;
    const metadata = { title: day.prayer.title, artist: APP_NAME, albumTitle: `${day.day} · ${day.prayer.theme}` };
    try {
      if (lockScreenOn.current) {
        player.updateLockScreenMetadata(metadata);
      } else {
        player.setActiveForLockScreen(true, metadata, { showSeekBackward: true, showSeekForward: true });
        lockScreenOn.current = true;
      }
    } catch {
      // Lock screen controls are optional; playback works without them.
    }
  };

  const play = async (day: WeekDay) => {
    if (!day.prayer) return;
    if (Platform.OS === 'android' && !askedNotifications.current) {
      askedNotifications.current = true;
      await requestNotificationPermissionsAsync().catch(() => {});
    }
    const key = audioKey(day);
    if (key !== loadedKey.current) {
      player.replace(day.prayer.audio);
      loadedKey.current = key;
    }
    showOnLockScreen(day);
    player.play();
  };

  const togglePlay = () => {
    if (!selected?.prayer) return;
    if (status.playing) player.pause();
    else play(selected);
  };

  const selectDay = (day: WeekDay) => {
    if (!day.prayer) return;
    if (day.date === selected?.date) {
      togglePlay();
      return;
    }
    player.pause();
    setSelectedDate(day.date);
    play(day);
  };

  const skip = (delta: number) => {
    const target = Math.min(Math.max(status.currentTime + delta, 0), status.duration || 0);
    player.seekTo(target).catch(() => {});
  };

  const [trackWidth, setTrackWidth] = useState(0);
  const progress = status.duration > 0 ? Math.min(status.currentTime / status.duration, 1) : 0;
  const ready = Boolean(prayer) && status.isLoaded;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} />}
      >
        <Text style={s.date}>{formatToday(new Date())}</Text>
        <Text style={s.appTitle}>{APP_NAME}</Text>

        {state.status === 'ready' && state.source === 'saved' && (
          <Notice t={t} text="You’re offline. Playing the prayers saved on this phone." />
        )}
        {state.status === 'ready' && state.source === 'demo' && (
          <Notice t={t} text="Preview mode with sample audio. Real prayers appear once the prayer service is connected." />
        )}

        {/* Player card */}
        <View style={s.card}>
          {state.status === 'loading' && (
            <View style={s.cardState}>
              <ActivityIndicator color={t.accent} />
              <Text style={s.description}>Loading this week’s prayers…</Text>
            </View>
          )}

          {state.status === 'error' && (
            <View style={s.cardState}>
              <Text style={s.prayerTitle}>Can’t reach the prayers right now</Text>
              <Text style={s.description}>Check your internet connection, then try again.</Text>
              <Pressable onPress={refresh} style={({ pressed }) => [s.textBtn, pressed && s.pressed]}>
                <Text style={s.textBtnLabel}>Try again</Text>
              </Pressable>
            </View>
          )}

          {state.status === 'ready' && selected && !prayer && (
            <View>
              <Text style={s.eyebrow}>{selected.isToday ? 'Today’s prayer' : `${selected.day}’s prayer`}</Text>
              <Text style={s.prayerTitle}>
                {selected.isToday ? 'Today’s prayer is on its way' : `Not posted for ${selected.day}`}
              </Text>
              <Text style={s.description}>
                {selected.isToday
                  ? 'Check back later today. Pull down to refresh.'
                  : 'You can listen to any other prayer from this week below.'}
              </Text>
            </View>
          )}

          {state.status === 'ready' && selected && prayer && (
            <>
              <View style={s.cardTop}>
                <Text style={s.eyebrow}>{selected.isToday ? 'Today’s prayer' : `${selected.day}’s prayer`}</Text>
                {prayer.theme ? (
                  <View style={s.themePill}>
                    <Text style={s.themePillText}>{prayer.theme}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={s.prayerTitle}>{prayer.title}</Text>
              {prayer.description ? <Text style={s.description}>{prayer.description}</Text> : null}

              <Pressable
                accessibilityRole="adjustable"
                accessibilityLabel="Playback position"
                onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
                onPress={(e) => {
                  if (trackWidth > 0 && status.duration > 0) {
                    const ratio = Math.min(Math.max(e.nativeEvent.locationX / trackWidth, 0), 1);
                    player.seekTo(ratio * status.duration).catch(() => {});
                  }
                }}
                style={s.trackHit}
              >
                <View style={s.track}>
                  <View style={[s.trackFill, { width: `${progress * 100}%` }]} />
                </View>
                <View style={[s.thumb, { left: Math.max(progress * trackWidth - 7, 0) }]} />
              </Pressable>
              <View style={s.timeRow}>
                <Text style={s.time}>{formatTime(status.currentTime)}</Text>
                <Text style={s.time}>{formatTime(status.duration)}</Text>
              </View>

              <View style={s.controls}>
                <Pressable
                  onPress={() => skip(-SKIP_SECONDS)}
                  disabled={!ready}
                  accessibilityLabel={`Back ${SKIP_SECONDS} seconds`}
                  style={({ pressed }) => [s.skipBtn, pressed && s.pressed]}
                >
                  <Text style={s.skipText}>−{SKIP_SECONDS}</Text>
                </Pressable>

                <Pressable
                  onPress={togglePlay}
                  accessibilityRole="button"
                  accessibilityLabel={status.playing ? 'Pause prayer' : 'Play prayer'}
                  style={({ pressed }) => [s.playBtn, pressed && s.pressed]}
                >
                  {status.playing ? <PauseIcon color={t.onAccent} /> : <PlayIcon color={t.onAccent} />}
                </Pressable>

                <Pressable
                  onPress={() => skip(SKIP_SECONDS)}
                  disabled={!ready}
                  accessibilityLabel={`Forward ${SKIP_SECONDS} seconds`}
                  style={({ pressed }) => [s.skipBtn, pressed && s.pressed]}
                >
                  <Text style={s.skipText}>+{SKIP_SECONDS}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>

        {/* Week list */}
        {days.length > 0 && (
          <>
            <Text style={s.sectionTitle}>This week</Text>
            <View style={s.list}>
              {days.map((d, i) => {
                const isSelected = d.date === selected?.date;
                const isPlaying = isSelected && status.playing;
                const available = Boolean(d.prayer);
                const sub = d.prayer
                  ? `${d.isToday ? 'Today · ' : ''}${d.prayer.theme || d.day}`
                  : d.isFuture
                    ? `Arrives ${d.day}`
                    : d.isToday
                      ? 'Today · Coming soon'
                      : 'Not posted';
                return (
                  <Pressable
                    key={d.date}
                    onPress={() => selectDay(d)}
                    disabled={!available}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !available, selected: isSelected }}
                    accessibilityLabel={`${d.day}: ${d.prayer ? d.prayer.title : sub}${isPlaying ? ', playing' : ''}`}
                    style={({ pressed }) => [s.row, i < days.length - 1 && s.rowDivider, pressed && s.rowPressed]}
                  >
                    <View style={[s.dayBadge, isSelected && s.dayBadgeActive]}>
                      <Text style={[s.dayBadgeText, isSelected && s.dayBadgeTextActive]}>{d.short}</Text>
                    </View>
                    <View style={s.rowText}>
                      <Text style={[s.rowTitle, !available && s.rowTitleMuted]} numberOfLines={1}>
                        {d.prayer ? d.prayer.title : d.day}
                      </Text>
                      <Text style={s.rowSub}>{sub}</Text>
                    </View>
                    {available && (
                      <View style={[s.rowPlay, isSelected && s.rowPlayActive]}>
                        {isPlaying ? (
                          <PauseIcon color={t.onAccent} small />
                        ) : (
                          <PlayIcon color={isSelected ? t.onAccent : t.accent} small />
                        )}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text style={s.footer}>A new prayer for every day of the week. No account needed.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Notice({ t, text }: { t: Theme; text: string }) {
  return (
    <View
      style={{
        backgroundColor: t.accentSoft,
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 14,
      }}
    >
      <Text style={{ color: t.ink, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

function PlayIcon({ color, small }: { color: string; small?: boolean }) {
  const h = small ? 10 : 18;
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginLeft: small ? 3 : 5,
        borderTopWidth: h,
        borderBottomWidth: h,
        borderLeftWidth: h * 1.6,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

function PauseIcon({ color, small }: { color: string; small?: boolean }) {
  const w = small ? 4 : 7;
  const h = small ? 16 : 30;
  return (
    <View style={{ flexDirection: 'row', gap: small ? 4 : 7 }}>
      <View style={{ width: w, height: h, borderRadius: 2, backgroundColor: color }} />
      <View style={{ width: w, height: h, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

function makeStyles(t: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center' },
    date: { color: t.muted, fontSize: 14, letterSpacing: 0.3 },
    appTitle: { color: t.ink, fontFamily: serif, fontSize: 32, marginTop: 4, marginBottom: 20 },

    card: {
      backgroundColor: t.card,
      borderRadius: 24,
      padding: 22,
      minHeight: 160,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    cardState: { alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    eyebrow: { color: t.accent, fontSize: 13, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
    themePill: { backgroundColor: t.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    themePillText: { color: t.accent, fontSize: 12, fontWeight: '600' },
    prayerTitle: { color: t.ink, fontFamily: serif, fontSize: 26, lineHeight: 32, marginTop: 14 },
    description: { color: t.muted, fontSize: 16, lineHeight: 23, marginTop: 8 },
    textBtn: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: t.accent },
    textBtnLabel: { color: t.onAccent, fontWeight: '600', fontSize: 15 },

    trackHit: { marginTop: 26, height: 24, justifyContent: 'center' },
    track: { height: 4, borderRadius: 2, backgroundColor: t.line, overflow: 'hidden' },
    trackFill: { height: 4, backgroundColor: t.accent },
    thumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: t.accent, top: 5 },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    time: { color: t.muted, fontSize: 12, fontVariant: ['tabular-nums'] },

    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 16 },
    playBtn: { width: 76, height: 76, borderRadius: 38, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' },
    skipBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1.5,
      borderColor: t.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    skipText: { color: t.ink, fontSize: 14, fontWeight: '600' },
    pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

    sectionTitle: { color: t.ink, fontFamily: serif, fontSize: 20, marginTop: 32, marginBottom: 12 },
    list: {
      backgroundColor: t.card,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 14, minHeight: 74 },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    rowPressed: { backgroundColor: t.accentSoft },
    dayBadge: { width: 46, height: 46, borderRadius: 14, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' },
    dayBadgeActive: { backgroundColor: t.accentSoft },
    dayBadgeText: { color: t.muted, fontSize: 13, fontWeight: '700' },
    dayBadgeTextActive: { color: t.accent },
    rowText: { flex: 1 },
    rowTitle: { color: t.ink, fontSize: 16, fontWeight: '500' },
    rowTitleMuted: { color: t.muted },
    rowSub: { color: t.muted, fontSize: 13, marginTop: 2 },
    rowPlay: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: t.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowPlayActive: { backgroundColor: t.accent, borderColor: t.accent },

    footer: { color: t.muted, fontSize: 13, textAlign: 'center', marginTop: 28 },
  });
}
