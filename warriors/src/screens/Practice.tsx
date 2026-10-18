import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Recorder } from '../Recorder';
import type { Theme } from '../theme';
import { Banner, type Styles } from '../ui';
import type { PickedAudio } from '../upload';

const PROMPTS = [
  'Thank God for one thing from today.',
  'Pray for someone who is struggling.',
  'Ask for peace and guidance for the week ahead.',
  'Close with a blessing for everyone listening.',
];

export function Practice({ s, t }: { s: Styles; t: Theme }) {
  const [audio, setAudio] = useState<PickedAudio | null>(null);
  return (
    <ScrollView contentContainerStyle={[s.page, { gap: 14 }]}>
      <View>
        <Text style={s.eyebrow}>Practice</Text>
        <Text style={s.h1}>Practice recording</Text>
      </View>
      <Text style={s.body}>
        Record a short prayer, then listen back to check your volume, pace and surroundings. Practice recordings stay on this
        device and aren’t sent to anyone.
      </Text>
      <Recorder s={s} t={t} existingUrl={null} existingDuration={null} value={audio} onChange={setAudio} />
      <Banner s={s} t={t} tone="accent" title="Try this as a practice prayer">
        <View style={{ gap: 4, marginTop: 4 }}>
          {PROMPTS.map((p, i) => (
            <Text key={p} style={{ color: t.ink, fontSize: 14, lineHeight: 20 }}>
              {i + 1}. {p}
            </Text>
          ))}
        </View>
      </Banner>
    </ScrollView>
  );
}
