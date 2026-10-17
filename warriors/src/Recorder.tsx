import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';

import { formatDuration } from './dates';
import type { Theme } from './theme';
import { Button, type Styles } from './ui';
import { webRecordingMime, type PickedAudio } from './upload';

const MAX_RECORDING_SEC = 20 * 60;
const MAX_FILE_MB = 50;

/**
 * Record a prayer with the microphone or choose an audio file, then listen back before submitting.
 * `existingUrl` is the prayer's current audio (when editing); `value` is a new recording or file.
 */
export function Recorder({
  s,
  t,
  existingUrl,
  existingDuration,
  value,
  onChange,
}: {
  s: Styles;
  t: Theme;
  existingUrl: string | null;
  existingDuration: number | null;
  value: PickedAudio | null;
  onChange: (audio: PickedAudio | null) => void;
}) {
  const webMime = useMemo(() => (Platform.OS === 'web' ? webRecordingMime() : null), []);
  const canRecord = Platform.OS !== 'web' || webMime !== null;

  const options = useMemo<RecordingOptions>(
    () => ({
      ...RecordingPresets.HIGH_QUALITY,
      numberOfChannels: 1,
      bitRate: 96000,
      web: { mimeType: webMime ?? 'audio/mp4', bitsPerSecond: 96000 },
    }),
    [webMime],
  );
  const recorder = useAudioRecorder(options);
  const rec = useAudioRecorderState(recorder, 250);
  const lastDuration = useRef(0);
  const startedAt = useRef(0);
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Elapsed time: the recorder reports it on phones; browsers don't, so keep our own clock too.
  const elapsedMs = rec.isRecording ? Math.max(rec.durationMillis, startedAt.current ? performance.now() - startedAt.current : 0) : 0;
  if (rec.isRecording) lastDuration.current = elapsedMs;
  useEffect(() => {
    if (!rec.isRecording) return;
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [rec.isRecording]);

  // Listen-back player for whatever audio is current.
  const previewUri = value?.uri ?? existingUrl;
  const player = useAudioPlayer(previewUri ? { uri: previewUri } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish, player]);

  const stop = async () => {
    const durationSec = Math.max(1, Math.round(lastDuration.current / 1000));
    try {
      await recorder.stop();
    } catch {
      // already stopped
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (!uri) {
      setError('The recording could not be saved. Please try again.');
      return;
    }
    onChange({
      uri,
      name: `recording.m4a`,
      mimeType: 'audio/mp4',
      durationSec,
      source: 'recording',
    });
  };

  // Stop automatically at the time limit.
  useEffect(() => {
    if (rec.isRecording && elapsedMs >= MAX_RECORDING_SEC * 1000) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.isRecording, elapsedMs]);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      player.pause();
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError(
          Platform.OS === 'web'
            ? 'Microphone access is blocked. Allow the microphone for this site in your browser, then try again.'
            : 'Microphone access is off. Turn it on for Prayer Warriors in your phone’s Settings, then try again.',
        );
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      lastDuration.current = 0;
      startedAt.current = performance.now();
      recorder.record();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recording could not start.');
    } finally {
      setStarting(false);
    }
  };

  const chooseFile = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0];
    if (a.size && a.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`That file is ${(a.size / 1024 / 1024).toFixed(0)} MB. The limit is ${MAX_FILE_MB} MB.`);
      return;
    }
    const mime = a.mimeType ?? '';
    if (mime && !mime.startsWith('audio/') && !/\.(mp3|m4a|wav|aac|mp4)$/i.test(a.name)) {
      setError('That file isn’t audio. Choose an MP3, M4A, WAV or AAC file.');
      return;
    }
    if (/webm|ogg/i.test(mime) || /\.(webm|ogg|opus)$/i.test(a.name)) {
      setError('That format doesn’t play on iPhones. Choose an MP3, M4A, WAV or AAC file.');
      return;
    }
    onChange({
      uri: a.uri,
      name: a.name,
      mimeType: mime || 'audio/mpeg',
      size: a.size,
      durationSec: null,
      webFile: (a as { file?: File }).file,
      source: 'file',
    } as PickedAudio);
  };

  const recording = rec.isRecording;
  const hasAudio = Boolean(previewUri);
  const duration = status.duration || value?.durationSec || existingDuration || 0;
  const progress = duration > 0 ? Math.min(status.currentTime / duration, 1) : 0;

  return (
    <View style={{ borderWidth: 1, borderColor: recording ? t.danger : t.line, borderRadius: 18, padding: 18, backgroundColor: t.bg, gap: 14 }}>
      {recording ? (
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.danger }} />
            <Text style={{ color: t.danger, fontWeight: '700', letterSpacing: 1 }}>RECORDING</Text>
          </View>
          <Text style={{ color: t.ink, fontSize: 44, fontVariant: ['tabular-nums'], fontWeight: '300' }}>
            {formatDuration(elapsedMs / 1000)}
          </Text>
          <Pressable
            onPress={stop}
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
            style={({ pressed }) => [
              { width: 84, height: 84, borderRadius: 42, borderWidth: 4, borderColor: t.danger, alignItems: 'center', justifyContent: 'center' },
              pressed && s.pressed,
            ]}
          >
            <View style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: t.danger }} />
          </Pressable>
          <Text style={s.small}>Tap to stop. You can listen back before submitting.</Text>
        </View>
      ) : (
        <>
          {hasAudio ? (
            <View style={{ gap: 10 }}>
              <Text style={s.small}>
                {value ? (value.source === 'recording' ? 'New recording' : `New file: ${value.name}`) : 'Current audio'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Pressable
                  onPress={() => (status.playing ? player.pause() : player.play())}
                  accessibilityRole="button"
                  accessibilityLabel={status.playing ? 'Pause' : 'Listen back'}
                  style={({ pressed }) => [
                    { width: 52, height: 52, borderRadius: 26, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' },
                    pressed && s.pressed,
                  ]}
                >
                  {status.playing ? (
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <View style={{ width: 5, height: 20, borderRadius: 2, backgroundColor: t.onAccent }} />
                      <View style={{ width: 5, height: 20, borderRadius: 2, backgroundColor: t.onAccent }} />
                    </View>
                  ) : (
                    <View
                      style={{
                        marginLeft: 4,
                        borderTopWidth: 11,
                        borderBottomWidth: 11,
                        borderLeftWidth: 17,
                        borderTopColor: 'transparent',
                        borderBottomColor: 'transparent',
                        borderLeftColor: t.onAccent,
                      }}
                    />
                  )}
                </Pressable>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: t.line, overflow: 'hidden' }}>
                    <View style={{ height: 4, width: `${progress * 100}%`, backgroundColor: t.accent }} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[s.small, { fontVariant: ['tabular-nums'] }]}>{formatDuration(status.currentTime)}</Text>
                    <Text style={[s.small, { fontVariant: ['tabular-nums'] }]}>{formatDuration(duration)}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <Text style={[s.body, { textAlign: 'center' }]}>
              {canRecord ? 'Record your prayer, or choose an audio file.' : 'Choose an audio file of your prayer.'}
            </Text>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {canRecord ? (
              <Pressable
                onPress={start}
                disabled={starting}
                accessibilityRole="button"
                accessibilityLabel={hasAudio ? 'Record again' : 'Start recording'}
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: t.danger,
                    borderRadius: 999,
                    paddingVertical: 14,
                    paddingHorizontal: 22,
                  },
                  (pressed || starting) && s.pressed,
                ]}
              >
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff' }} />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{hasAudio ? 'Record again' : 'Record'}</Text>
              </Pressable>
            ) : null}
            <Button s={s} t={t} kind="secondary" label={!hasAudio ? 'Choose audio file' : value?.source === 'recording' ? 'Choose a file instead' : 'Choose a different file'} onPress={chooseFile} />
          </View>

          {value ? (
            <Pressable onPress={() => onChange(null)} style={{ alignSelf: 'center' }}>
              <Text style={s.link}>{existingUrl ? 'Discard and keep the current audio' : 'Discard'}</Text>
            </Pressable>
          ) : null}
          {Platform.OS === 'web' && !canRecord ? (
            <Text style={[s.small, { textAlign: 'center' }]}>
              Recording isn’t available in this browser. Use the Prayer Warriors app on your phone, or Chrome, Edge or Safari.
            </Text>
          ) : null}
        </>
      )}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}
