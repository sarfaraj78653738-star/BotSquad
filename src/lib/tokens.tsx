// BotSquad design tokens — warm paper palette, original BotSquad design.
// Components must use these tokens, never raw hex values.
//
// THEMING: the app follows the phone's system setting. `useTokens()` is
// the single source of truth: it reads React Native's `useColorScheme()`
// and returns the light palette on light phones and the dark palette on
// dark phones, live (the hook re-renders when the system setting changes).
// The static `tokens` export below is the light palette, kept only for
// non-component code that cannot call a hook. All UI components must
// call `useTokens()` and build their styles from its return value.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Text, TextInput, useColorScheme } from 'react-native';
import { getSetting, setSetting } from './db';

const base = {
  // Shape lock (appllama anti-slop, 2026-10-31): every UI-chrome radius
  // comes from this scale — pills/circles 999, dialogs/cards xl 16,
  // chat bubbles lg 12, inputs/buttons md 10, small elements sm 8.
  // Full-bleed panels are square (0) by exception; drawn shapes
  // (avatar parts) are not UI chrome and are exempt.
  radius: { sm: 8, md: 10, lg: 12, xl: 16 },
  space: { xs: 6, sm: 10, md: 16, lg: 24 },
  font: { sm: 14, md: 16, lg: 19, xl: 28 },
} as const;

// Light palette — the existing warm-paper design, unchanged.
export const lightTokens = {
  ...base,
  dark: false,
  bg: '#FAF9F5',
  surface: '#FFFFFF',
  surfaceMuted: '#F1EEE6',
  border: '#E5E0D5',
  text: '#211D18',
  textMuted: '#6E675C',
  accent: '#2B2620',
  accentSoft: '#EFEAE0',
  onAccent: '#FAF9F5',
  danger: '#B3261E',
  success: '#2E7D4F',
  warning: '#9A6700',
  scrim: 'rgba(33, 29, 24, 0.4)',
} as const;

// Dark palette — BotSquad's own warm/charcoal family, not a copy of any
// other app's dark theme. Backgrounds are dark warm brown, surfaces are
// charcoal, text is warm off-white, and primary buttons flip to a light
// warm tone so they stay distinct from the dark surface (in light mode
// the button is charcoal on paper; in dark mode it is light warm on
// charcoal, with dark text on top — the accent/onAccent pair is swapped
// together, so every accent usage stays readable in both modes).
// Contrast notes (checked against the token values): text #F5F1E8 on
// bg #1E1A16 and on surface #2B2620 is high contrast; textMuted
// #B3AA9C on bg #1E1A16 is comfortably readable for secondary text;
// onAccent #211D18 on accent #EFE6D3 is high contrast.
export const darkTokens = {
  ...base,
  dark: true,
  bg: '#1E1A16',
  surface: '#2B2620',
  surfaceMuted: '#38322B',
  border: '#4A433B',
  text: '#F5F1E8',
  textMuted: '#B3AA9C',
  accent: '#EFE6D3',
  accentSoft: '#3A342C',
  onAccent: '#211D18',
  danger: '#F08A80',
  success: '#7BC99A',
  warning: '#E0B45A',
  scrim: 'rgba(0, 0, 0, 0.6)',
} as const;

// Widened from the light palette's literal types so both palettes are
// assignable to it (the dark palette's hex values differ by design).
export type ThemeTokens = {
  [K in keyof typeof lightTokens]: (typeof lightTokens)[K] extends string
    ? string
    : (typeof lightTokens)[K] extends boolean
      ? boolean
      : (typeof lightTokens)[K];
};

// Static light palette for non-component code only. UI components must
// use useTokens() so they follow the system setting.
export const tokens = lightTokens;

export type ColorMode = 'system' | 'light' | 'dark';
export type FontStyle = 'default' | 'system';
// App language — REMOVED 2026-10-30 (user order, option 2): the
// Settings → General → Language section is gone and the app is
// English-only. LANGUAGE_CODES / Language / LANGUAGE_KEY stay exported
// only because lib/i18n's types still reference them; useLanguage
// below always returns 'en', so no stored value can change the UI
// anymore. The translation dictionaries in lib/i18n are now dead code
// except their 'en' blocks — full deletion is a separate cleanup job.
export const LANGUAGE_CODES = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'es', 'fr', 'de', 'pt'] as const;
export type Language = (typeof LANGUAGE_CODES)[number];

// Stored preference keys (SQLite settings table). Both default when
// nothing is stored: color mode defaults to System, font style to Default.
export const COLOR_MODE_KEY = 'color_mode';
export const FONT_STYLE_KEY = 'font_style';
export const LANGUAGE_KEY = 'language';

const ColorModeContext = createContext<ColorMode>('system');
const SetColorModeContext = createContext<(m: ColorMode) => void>(() => {});
const FontStyleContext = createContext<FontStyle>('default');
const SetFontStyleContext = createContext<(f: FontStyle) => void>(() => {});
// Font style mapping (the only real distinction this app can offer
// without a custom font family): Default uses the app's designed sizes
// (no system scaling, so layouts never break), System follows the
// device's font-size scaling. Applied app-wide via defaultProps below.
function applyFontStyle(f: FontStyle) {
  const scaling = f === 'system';
  (Text as any).defaultProps = { ...(Text as any).defaultProps, allowFontScaling: scaling };
  (TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, allowFontScaling: scaling };
}

// Loads the stored preferences once (after the DB exists) and provides
// them to the whole app. Must wrap the navigator in _layout.tsx.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>('system');
  const [fontStyle, setFontStyleState] = useState<FontStyle>('default');
  useEffect(() => {
    (async () => {
      const cm = await getSetting(COLOR_MODE_KEY);
      if (cm === 'light' || cm === 'dark' || cm === 'system') setColorModeState(cm);
      const fs = await getSetting(FONT_STYLE_KEY);
      if (fs === 'system' || fs === 'default') setFontStyleState(fs);
    })().catch(() => {});
  }, []);
  useEffect(() => { applyFontStyle(fontStyle); }, [fontStyle]);
  const setColorMode = useCallback((m: ColorMode) => {
    setColorModeState(m);
    setSetting(COLOR_MODE_KEY, m).catch(() => {});
  }, []);
  const setFontStyle = useCallback((f: FontStyle) => {
    setFontStyleState(f);
    setSetting(FONT_STYLE_KEY, f).catch(() => {});
  }, []);
  return (
    <ColorModeContext.Provider value={colorMode}>
      <SetColorModeContext.Provider value={setColorMode}>
        <FontStyleContext.Provider value={fontStyle}>
          <SetFontStyleContext.Provider value={setFontStyle}>{children}</SetFontStyleContext.Provider>
        </FontStyleContext.Provider>
      </SetColorModeContext.Provider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): [ColorMode, (m: ColorMode) => void] {
  return [useContext(ColorModeContext), useContext(SetColorModeContext)];
}

export function useFontStyle(): [FontStyle, (f: FontStyle) => void] {
  return [useContext(FontStyleContext), useContext(SetFontStyleContext)];
}

export function useLanguage(): [Language, (l: Language) => void] {
  // Language section removed 2026-10-30: always English. The setter is
  // a no-op kept only so existing call sites keep compiling.
  return ['en', () => {}];
}

export function useTokens(): ThemeTokens {
  const mode = useContext(ColorModeContext);
  const scheme = useColorScheme();
  const dark = mode === 'dark' || (mode === 'system' && scheme === 'dark');
  return dark ? darkTokens : lightTokens;
}

export type AvatarColor = string;
// Soft warm tints for new bots; the Avatar renders the bot's initial on a
// translucent tint, so older stored colours still read cleanly too.
// The tint is translucent (18% opacity) over the themed surface, and the
// initial is drawn in the themed text colour, so avatars stay readable
// in both light and dark mode without a separate dark tint set.
export const AVATAR_COLORS = ['#E7DCC8', '#DDE7DC', '#E3DDE8', '#F0DCD2', '#DDE6E6', '#E9E2D0'] as const;
// Legacy field only: stored on every bot for database compatibility.
// The UI no longer renders this value — avatars show the bot's initial.
export const AVATAR_ICONS = ['◆', '●', '▲', '■', 'T', '⬢'] as const;
