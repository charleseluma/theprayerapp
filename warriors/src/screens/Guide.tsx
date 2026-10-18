import { ScrollView, Text, View } from 'react-native';

import type { Theme } from '../theme';
import type { Styles } from '../ui';

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: 'Before you record',
    items: [
      'Find a quiet room. Turn off fans, TVs and notifications.',
      'Soft furnishings help: a room with curtains or a sofa sounds warmer than a kitchen or bathroom.',
      'Have a glass of water nearby and take a slow breath before you start.',
    ],
  },
  {
    title: 'Holding the phone',
    items: [
      'Hold the phone about a hand’s width (15–20 cm) from your mouth, slightly below your chin.',
      'Keep it still. Rest your elbow on a table if you can.',
      'Speak toward the bottom edge of the phone, where the microphone is.',
    ],
  },
  {
    title: 'Shaping the prayer',
    items: [
      'Aim for 2 to 5 minutes.',
      'A simple shape works well: an opening of praise, a short scripture, prayers for listeners’ needs, and a closing blessing.',
      'Pray to God, and for the listener. Imagine one person hearing it on their way to work.',
      'Write a few notes first if that helps, but speak naturally rather than reading word for word.',
    ],
  },
  {
    title: 'Your voice',
    items: [
      'Speak a little slower than in conversation, and pause between thoughts.',
      'Smile while you speak; it carries in your voice.',
      'If you stumble, keep going. If it matters, record again; listen back before you submit.',
    ],
  },
  {
    title: 'Before you submit',
    items: [
      'Listen to the whole recording once.',
      'Check that the start and end are clean (no rustling or “is it recording?”).',
      'Give it a short title and theme so listeners know what it’s about.',
      'An administrator reviews every prayer and may ask for small changes. That’s normal.',
    ],
  },
];

export function Guide({ s, t }: { s: Styles; t: Theme }) {
  return (
    <ScrollView contentContainerStyle={[s.page, { gap: 14 }]}>
      <View>
        <Text style={s.eyebrow}>Guide</Text>
        <Text style={s.h1}>Recording a great prayer</Text>
      </View>
      {SECTIONS.map((sec, i) => (
        <View key={sec.title} style={[s.panel, { gap: 8 }]}>
          <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>STEP {i + 1}</Text>
          <Text style={s.h2}>{sec.title}</Text>
          {sec.items.map((item) => (
            <View key={item} style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={{ color: t.accent, fontSize: 15, lineHeight: 22 }}>•</Text>
              <Text style={{ flex: 1, color: t.ink, fontSize: 15, lineHeight: 22 }}>{item}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
