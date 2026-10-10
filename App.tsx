import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
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

import { PRAYERS, type Prayer } from './src/content/prayers';
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

  const now = new Date();
  const todayIndex = now.getDay();
  const [selected, setSelected] = useState(todayIndex);
  const prayer = PRAYERS[selected];

  const player = useAudioPlayer(PRAYERS[todayIndex].audio, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const lockScreenOn = useRef(false);
  const askedNotifications = useRef(false);

  // Keep playing when the phone is on silent or the screen locks.
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch(() => {});
  }, []);

  // When a prayer ends, rewind it so the play button starts it again.
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish, player]);

  const showOnLockScreen = (p: Prayer) => {
    const metadata = { title: p.title, artist: APP_NAME, albumTitle: `${p.day} · ${p.theme}` };
    try {
      if (lockScreenOn.current) {
        player.updateLockScreenMetadata(metadata);
      } else {
        player.setActiveForLockScreen(true, metadata, { showSeekBackward: true, showSeekForward: true });
        lockScreenOn.current = true;
      }
    } catch {
      // Lock screen controls are a nice-to-have; playback works without them.
    }
  };

  const play = async (p: Prayer) => {
    if (Platform.OS === 'android' && !askedNotifications.current) {
      askedNotifications.current = true;
      await requestNotificationPermissionsAsync().catch(() => {});
    }
    showOnLockScreen(p);
    player.play();
  };

  const togglePlay = () => {
    if (status.playing) player.pause();
    else play(prayer);
  };

  const selectAndPlay = (index: number) => {
    if (index === selected) {
      togglePlay();
      return;
    }
    player.pause();
    player.replace(PRAYERS[index].audio);
    setSelected(index);
    play(PRAYERS[index]);
  };

  const skip = (delta: number) => {
    const target = Math.min(Math.max(status.currentTime + delta, 0), status.duration || 0);
    player.seekTo(target).catch(() => {});
  };

  const [trackWidth, setTrackWidth] = useState(0);
  const progress = status.duration > 0 ? Math.min(status.currentTime / status.duration, 1) : 0;

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.date}>{formatToday(now)}</Text>
        <Text style={s.appTitle}>{APP_NAME}</Text>

        {/* Player card */}
        <View style={s.card}>
          <View style={s.cardTop}>
            <Text style={s.eyebrow}>
              {selected === todayIndex ? 'Today’s prayer' : `${prayer.day}’s prayer`}
            </Text>
            <View style={s.themePill}>
              <Text style={s.themePillText}>{prayer.theme}</Text>
            </View>
          </View>

          <Text style={s.prayerTitle}>{prayer.title}</Text>
          <Text style={s.description}>{prayer.description}</Text>

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
              accessibilityLabel={`Forward ${SKIP_SECONDS} seconds`}
              style={({ pressed }) => [s.skipBtn, pressed && s.pressed]}
            >
              <Text style={s.skipText}>+{SKIP_SECONDS}</Text>
            </Pressable>
          </View>
        </View>

        {/* Week list */}
        <Text style={s.sectionTitle}>This week</Text>
        <View style={s.list}>
          {PRAYERS.map((p, i) => {
            const isSelected = i === selected;
            const isPlaying = isSelected && status.playing;
            return (
              <Pressable
                key={p.day}
                onPress={() => selectAndPlay(i)}
                accessibilityRole="button"
                accessibilityLabel={`${p.day}: ${p.title}${isPlaying ? ', playing' : ''}`}
                style={({ pressed }) => [
                  s.row,
                  i < PRAYERS.length - 1 && s.rowDivider,
                  pressed && s.rowPressed,
                ]}
              >
                <View style={[s.dayBadge, isSelected && s.dayBadgeActive]}>
                  <Text style={[s.dayBadgeText, isSelected && s.dayBadgeTextActive]}>{p.short}</Text>
                </View>
                <View style={s.rowText}>
                  <Text style={s.rowTitle} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={s.rowSub}>
                    {i === todayIndex ? 'Today · ' : ''}
                    {p.theme}
                  </Text>
                </View>
                <View style={[s.rowPlay, isSelected && s.rowPlayActive]}>
                  {isPlaying ? (
                    <PauseIcon color={t.onAccent} small />
                  ) : (
                    <PlayIcon color={isSelected ? t.onAccent : t.accent} small />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={s.footer}>A new prayer for every day of the week. No account needed.</Text>
      </ScrollView>
    </SafeAreaView>
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
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    eyebrow: { color: t.accent, fontSize: 13, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
    themePill: { backgroundColor: t.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    themePillText: { color: t.accent, fontSize: 12, fontWeight: '600' },
    prayerTitle: { color: t.ink, fontFamily: serif, fontSize: 26, lineHeight: 32, marginTop: 14 },
    description: { color: t.muted, fontSize: 16, lineHeight: 23, marginTop: 8 },

    trackHit: { marginTop: 26, height: 24, justifyContent: 'center' },
    track: { height: 4, borderRadius: 2, backgroundColor: t.line, overflow: 'hidden' },
    trackFill: { height: 4, backgroundColor: t.accent },
    thumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: t.accent, top: 5 },
    timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    time: { color: t.muted, fontSize: 12, fontVariant: ['tabular-nums'] },

    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 16 },
    playBtn: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 14 },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    rowPressed: { backgroundColor: t.accentSoft },
    dayBadge: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: t.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayBadgeActive: { backgroundColor: t.accentSoft },
    dayBadgeText: { color: t.muted, fontSize: 13, fontWeight: '700' },
    dayBadgeTextActive: { color: t.accent },
    rowText: { flex: 1 },
    rowTitle: { color: t.ink, fontSize: 16, fontWeight: '500' },
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
