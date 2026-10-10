import { Platform, useColorScheme } from 'react-native';

const light = {
  bg: '#F6F1E9',
  card: '#FFFDF9',
  ink: '#2A2622',
  muted: '#7A7066',
  line: '#E7DFD3',
  accent: '#A8742F',
  accentSoft: '#F1E4CF',
  onAccent: '#FFFDF9',
};

const dark: typeof light = {
  bg: '#16140F',
  card: '#221F19',
  ink: '#F3ECE1',
  muted: '#A99E90',
  line: '#353028',
  accent: '#D9A55A',
  accentSoft: '#3A2F1F',
  onAccent: '#1B1812',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const serif = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Times New Roman", serif',
});
