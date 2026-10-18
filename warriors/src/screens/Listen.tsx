import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { addDays, DAY_SHORT, formatDuration, fromIso, iso } from '../dates';
import { friendlyError, publicAudioUrl, supabase, type PrayerRow } from '../supabase';
import type { Theme } from '../theme';
import { Banner, type Styles } from '../ui';

/** This week's and last week's approved prayers, as listeners hear them. */
export function Listen({ s, t }: { s: Styles; t: Theme }) {
  const [rows, setRows] = useState<PrayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<PrayerRow | null>(null);

  const player = useAudioPlayer(current ? { uri: publicAudioUrl(current.audio_path) } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (current) player.play();
  }, [current, player]);
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish, player]);

  const load = useCallback(async () => {
    const today = new Date();
    const from = iso(addDays(today, -today.getDay() - 7));
    const { data, error: err } = await supabase!
      .from('prayers')
      .select('*')
      .eq('status', 'approved')
      .eq('published', true)
      .gte('prayer_date', from)
      .lte('prayer_date', iso(today))
      .order('prayer_date', { ascending: false });
    setLoading(false);
    setRefreshing(false);
    if (err) setError(friendlyError(err.message));
    else setRows(data as PrayerRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (row: PrayerRow) => {
    if (current?.id === row.id) {
      if (status.playing) player.pause();
      else player.play();
    } else {
      setCurrent(row);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[s.page, { gap: 14 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.accent}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
    >
      <View>
        <Text style={s.eyebrow}>Listen</Text>
        <Text style={s.h1}>Recent prayers</Text>
      </View>
      <Text style={s.body}>The prayers listeners hear in The Prayer App this week and last week.</Text>
      {error ? <Banner s={s} t={t} tone="danger">{error}</Banner> : null}
      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 30 }} />
      ) : rows.length === 0 ? (
        <View style={s.panel}>
          <Text style={s.body}>No prayers have been published in the last two weeks yet.</Text>
        </View>
      ) : (
        <View style={{ backgroundColor: t.card, borderRadius: 20, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const d = fromIso(r.prayer_date);
            const active = current?.id === r.id;
            const playing = active && status.playing;
            const progress = active && status.duration > 0 ? status.currentTime / status.duration : 0;
            return (
              <Pressable
                key={r.id}
                onPress={() => toggle(r)}
                accessibilityRole="button"
                accessibilityLabel={`${playing ? 'Pause' : 'Play'} ${r.title}`}
                style={({ pressed }) => [
                  { paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
                  i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: t.line },
                  active && { backgroundColor: t.accentSoft },
                  pressed && s.pressed,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 40, alignItems: 'center' }}>
                    <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700' }}>{DAY_SHORT[d.getDay()].toUpperCase()}</Text>
                    <Text style={{ color: t.ink, fontSize: 18 }}>{d.getDate()}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: t.ink, fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={s.small} numberOfLines={1}>
                      {[r.theme, r.duration_sec ? formatDuration(r.duration_sec) : ''].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View
                    style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: active ? t.accent : 'transparent', borderWidth: 1.5, borderColor: active ? t.accent : t.accentSoft, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {playing ? (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        <View style={{ width: 4, height: 15, borderRadius: 2, backgroundColor: t.onAccent }} />
                        <View style={{ width: 4, height: 15, borderRadius: 2, backgroundColor: t.onAccent }} />
                      </View>
                    ) : (
                      <View
                        style={{
                          marginLeft: 3,
                          borderTopWidth: 8,
                          borderBottomWidth: 8,
                          borderLeftWidth: 13,
                          borderTopColor: 'transparent',
                          borderBottomColor: 'transparent',
                          borderLeftColor: active ? t.onAccent : t.accent,
                        }}
                      />
                    )}
                  </View>
                </View>
                {active ? (
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: t.line, overflow: 'hidden' }}>
                    <View style={{ height: 3, width: `${Math.min(progress, 1) * 100}%`, backgroundColor: t.accent }} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
