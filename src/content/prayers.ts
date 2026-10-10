import type { AudioSource } from 'expo-audio';

/**
 * The seven daily prayers.
 *
 * To change a prayer: replace the matching file in assets/audio/
 * (keep the same file name) and edit the title / theme / description below.
 * Index 0 is Sunday, matching JavaScript's Date.getDay().
 */
export type Prayer = {
  day: string;
  short: string;
  title: string;
  theme: string;
  description: string;
  audio: AudioSource;
};

export const PRAYERS: Prayer[] = [
  {
    day: 'Sunday',
    short: 'Sun',
    title: 'A Prayer of Thanksgiving',
    theme: 'Gratitude',
    description: 'Begin the week by giving thanks for the blessings behind you and the days ahead.',
    audio: require('../../assets/audio/sunday.mp3'),
  },
  {
    day: 'Monday',
    short: 'Mon',
    title: 'A Prayer for a New Week',
    theme: 'Fresh Start',
    description: 'Ask for focus, patience and strength as the work of the week begins.',
    audio: require('../../assets/audio/monday.mp3'),
  },
  {
    day: 'Tuesday',
    short: 'Tue',
    title: 'A Prayer for Wisdom',
    theme: 'Guidance',
    description: 'Seek clear thinking and good judgment in every decision today.',
    audio: require('../../assets/audio/tuesday.mp3'),
  },
  {
    day: 'Wednesday',
    short: 'Wed',
    title: 'A Prayer for Strength',
    theme: 'Perseverance',
    description: 'Halfway through the week, ask for renewed energy and endurance.',
    audio: require('../../assets/audio/wednesday.mp3'),
  },
  {
    day: 'Thursday',
    short: 'Thu',
    title: 'A Prayer for Family and Friends',
    theme: 'Love',
    description: 'Lift up the people closest to you and ask for their health and peace.',
    audio: require('../../assets/audio/thursday.mp3'),
  },
  {
    day: 'Friday',
    short: 'Fri',
    title: 'A Prayer of Forgiveness',
    theme: 'Mercy',
    description: 'Let go of the week’s burdens, forgive others and ask to be forgiven.',
    audio: require('../../assets/audio/friday.mp3'),
  },
  {
    day: 'Saturday',
    short: 'Sat',
    title: 'A Prayer for Rest',
    theme: 'Peace',
    description: 'Rest the mind and body, and receive peace for the day ahead.',
    audio: require('../../assets/audio/saturday.mp3'),
  },
];
