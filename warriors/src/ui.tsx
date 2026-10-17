import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { serif, type Theme } from './theme';

export function makeStyles(t: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    page: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
    panel: { backgroundColor: t.card, borderRadius: 20, padding: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line },
    eyebrow: { color: t.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    h1: { color: t.ink, fontFamily: serif, fontSize: 30, marginTop: 4 },
    h2: { color: t.ink, fontFamily: serif, fontSize: 23, marginTop: 4 },
    body: { color: t.muted, fontSize: 15, lineHeight: 22 },
    small: { color: t.muted, fontSize: 13 },
    label: { color: t.ink, fontSize: 14, fontWeight: '600', marginTop: 18, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: t.line,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: t.ink,
      backgroundColor: t.bg,
    },
    error: { color: t.danger, fontSize: 14, lineHeight: 20, marginTop: 12 },
    success: { color: t.good, fontSize: 14, lineHeight: 20, marginTop: 12, fontWeight: '500' },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.45 },

    btn: { borderRadius: 999, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
    btnPrimary: { backgroundColor: t.accent },
    btnPrimaryText: { color: t.onAccent, fontSize: 16, fontWeight: '600' },
    btnSecondary: { borderWidth: 1.5, borderColor: t.accent },
    btnSecondaryText: { color: t.accent, fontSize: 15, fontWeight: '600' },
    btnDanger: { borderWidth: 1.5, borderColor: t.danger },
    btnDangerText: { color: t.danger, fontSize: 15, fontWeight: '600' },
    btnSmall: { paddingVertical: 8, paddingHorizontal: 14 },
    link: { color: t.accent, fontSize: 14, fontWeight: '600' },

    chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
    chipText: { fontSize: 12, fontWeight: '600' },

    banner: { borderRadius: 14, padding: 14, gap: 4 },
    bannerTitle: { fontSize: 14, fontWeight: '700' },
    bannerText: { fontSize: 14, lineHeight: 20 },
  });
}
export type Styles = ReturnType<typeof makeStyles>;

type Tone = 'good' | 'warn' | 'danger' | 'accent' | 'neutral' | 'outline';

export function toneColors(t: Theme, tone: Tone) {
  switch (tone) {
    case 'good':
      return { bg: t.goodSoft, fg: t.good, border: t.goodSoft };
    case 'warn':
      return { bg: t.warnSoft, fg: t.warn, border: t.warnSoft };
    case 'danger':
      return { bg: t.dangerSoft, fg: t.danger, border: t.dangerSoft };
    case 'accent':
      return { bg: t.accentSoft, fg: t.accent, border: t.accent };
    case 'outline':
      return { bg: 'transparent', fg: t.muted, border: t.line };
    default:
      return { bg: t.line, fg: t.muted, border: t.line };
  }
}

export function Chip({ s, t, tone, label }: { s: Styles; t: Theme; tone: Tone; label: string }) {
  const c = toneColors(t, tone);
  return (
    <View style={[s.chip, { backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }]}>
      <Text style={[s.chipText, { color: c.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Banner({ s, t, tone, title, children }: { s: Styles; t: Theme; tone: Tone; title?: string; children?: ReactNode }) {
  const c = toneColors(t, tone);
  return (
    <View style={[s.banner, { backgroundColor: c.bg }]}>
      {title ? <Text style={[s.bannerTitle, { color: c.fg }]}>{title}</Text> : null}
      {typeof children === 'string' ? <Text style={[s.bannerText, { color: t.ink }]}>{children}</Text> : children}
    </View>
  );
}

export function Button({
  s,
  t,
  label,
  onPress,
  kind = 'primary',
  busy,
  disabled,
  small,
}: {
  s: Styles;
  t: Theme;
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const box = kind === 'primary' ? s.btnPrimary : kind === 'danger' ? s.btnDanger : s.btnSecondary;
  const text = kind === 'primary' ? s.btnPrimaryText : kind === 'danger' ? s.btnDangerText : s.btnSecondaryText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [s.btn, box, small && s.btnSmall, (disabled || busy) && s.disabled, pressed && s.pressed]}
    >
      {busy ? <ActivityIndicator color={kind === 'primary' ? t.onAccent : t.accent} /> : null}
      <Text style={text}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  s,
  t,
  label,
  ...input
}: { s: Styles; t: Theme; label: string } & TextInputProps) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={t.muted} style={[s.input, input.multiline && { minHeight: 90, textAlignVertical: 'top' }]} {...input} />
    </View>
  );
}
