import type { AudioSource } from 'expo-audio';

/**
 * Sample prayers used only in demo mode (before the prayer service is connected).
 * Real prayers are posted from the upload page and downloaded by the app.
 * Index 0 is Sunday, matching JavaScript's Date.getDay().
 */
export type DemoPrayer = {
  title: string;
  theme: string;
  description: string;
  audio: AudioSource;
};

export const DEMO_PRAYERS: DemoPrayer[] = [
  {
    title: 'A Prayer of Thanksgiving',
    theme: 'Gratitude',
    description: 'Begin the week by giving thanks for the blessings behind you and the days ahead.',
    audio: require('../../assets/audio/sunday.mp3'),
  },
  {
    title: 'A Prayer for a New Week',
    theme: 'Fresh Start',
    description: 'Ask for focus, patience and strength as the work of the week begins.',
    audio: require('../../assets/audio/monday.mp3'),
  },
  {
    title: 'A Prayer for Wisdom',
    theme: 'Guidance',
    description: 'Seek clear thinking and good judgment in every decision today.',
    audio: require('../../assets/audio/tuesday.mp3'),
  },
  {
    title: 'A Prayer for Strength',
    theme: 'Perseverance',
    description: 'Halfway through the week, ask for renewed energy and endurance.',
    audio: require('../../assets/audio/wednesday.mp3'),
  },
  {
    title: 'A Prayer for Family and Friends',
    theme: 'Love',
    description: 'Lift up the people closest to you and ask for their health and peace.',
    audio: require('../../assets/audio/thursday.mp3'),
  },
  {
    title: 'A Prayer of Forgiveness',
    theme: 'Mercy',
    description: 'Let go of the week’s burdens, forgive others and ask to be forgiven.',
    audio: require('../../assets/audio/friday.mp3'),
  },
  {
    title: 'A Prayer for Rest',
    theme: 'Peace',
    description: 'Rest the mind and body, and receive peace for the day ahead.',
    audio: require('../../assets/audio/saturday.mp3'),
  },
];
