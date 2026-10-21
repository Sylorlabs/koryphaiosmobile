import { Appearance, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { THEME_PRESETS, type ConcreteThemePreset } from './presets';

export type ThemeAppearance = {
  preset?: ConcreteThemePreset | 'system' | string;
  accent?: string;
  secondaryAccent?: string;
  font?: string;
  customAccent?: { main?: string; hover?: string };
  customSecondaryAccent?: { main?: string; hover?: string };
};

export type ThemeColors = {
  surface0: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surface4: string;
  border: string;
  borderBright: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentSofter: string;
  secondaryAccent: string;
  secondaryAccentHover: string;
  onAccent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  info: string;
  codex: string;
  claude: string;
  google: string;
  kory: string;
};

const ACCENT_COLORS: Record<string, { main: string; hover: string }> = {
  gold: { main: '#D5B261', hover: '#F3DDB0' },
  indigo: { main: '#6366f1', hover: '#818cf8' },
  cyan: { main: '#06b6d4', hover: '#22d3ee' },
  emerald: { main: '#10b981', hover: '#34d399' },
  amber: { main: '#f59e0b', hover: '#fbbf24' },
  rose: { main: '#f43f5e', hover: '#fb7185' },
  violet: { main: '#8b5cf6', hover: '#a78bfa' },
  custom: { main: '#D5B261', hover: '#F3DDB0' },
};

function resolvePreset(value?: string): ConcreteThemePreset {
  if (value === 'system') return Appearance.getColorScheme() === 'light' ? 'light' : 'kintsugi';
  if (value && value in THEME_PRESETS) return value as ConcreteThemePreset;
  return 'kintsugi';
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function resolveAccent(
  key: string | undefined,
  custom: ThemeAppearance['customAccent'],
): { main: string; hover: string } {
  if (key === 'custom' && isHex(custom?.main) && isHex(custom?.hover)) {
    return { main: custom.main, hover: custom.hover };
  }
  return ACCENT_COLORS[key ?? 'gold'] ?? ACCENT_COLORS.gold;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function readableForeground(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.48 ? '#000000' : '#ffffff';
}

function fromAppearance(appearance: ThemeAppearance = {}): ThemeColors {
  const preset = THEME_PRESETS[resolvePreset(appearance.preset)];
  const accent = resolveAccent(appearance.accent, appearance.customAccent);
  const secondaryAccent = resolveAccent(
    appearance.secondaryAccent ?? appearance.accent,
    appearance.customSecondaryAccent ?? appearance.customAccent,
  );
  return {
    surface0: preset['--color-surface-0'],
    surface1: preset['--color-surface-1'],
    surface2: preset['--color-surface-2'],
    surface3: preset['--color-surface-3'],
    surface4: preset['--color-surface-4'],
    border: preset['--color-border'],
    borderBright: preset['--color-border-bright'],
    textPrimary: preset['--color-text-primary'],
    textSecondary: preset['--color-text-secondary'],
    textMuted: preset['--color-text-muted'],
    accent: accent.main,
    accentHover: accent.hover,
    accentSoft: rgba(accent.main, 0.12),
    accentSofter: rgba(accent.main, 0.07),
    secondaryAccent: secondaryAccent.main,
    secondaryAccentHover: secondaryAccent.hover,
    onAccent: readableForeground(accent.main),
    success: preset['--color-success'],
    successSoft: preset['--color-success-bg'],
    warning: preset['--color-warning'],
    warningSoft: preset['--color-warning-bg'],
    error: preset['--color-error'],
    errorSoft: preset['--color-error-bg'],
    info: preset['--color-info'],
    codex: '#42dce8',
    claude: '#e49b5d',
    google: '#5a95ef',
    kory: accent.main,
  };
}

let activeAppearance: ThemeAppearance = {
  preset: 'kintsugi',
  accent: 'gold',
  secondaryAccent: 'gold',
  font: 'inter',
};
let activeColors = fromAppearance(activeAppearance);

export function applyAppearanceSettings(appearance: ThemeAppearance | null | undefined): void {
  if (!appearance) return;
  activeAppearance = { ...activeAppearance, ...appearance };
  activeColors = fromAppearance(activeAppearance);
}

export function currentAppearance(): ThemeAppearance {
  return { ...activeAppearance };
}

export function isLightTheme(): boolean {
  return resolvePreset(activeAppearance.preset) === 'light';
}

export const colors = new Proxy({} as ThemeColors, {
  get(_target, property: string) {
    return activeColors[property as keyof ThemeColors];
  },
});

const initialTokenValues = fromAppearance({
  preset: 'kintsugi',
  accent: 'gold',
  secondaryAccent: 'gold',
});
const tokenForInitialValue = new Map<string, keyof ThemeColors>();
for (const [themeToken, value] of Object.entries(initialTokenValues) as [keyof ThemeColors, string][]) {
  if (!tokenForInitialValue.has(value)) tokenForInitialValue.set(value, themeToken);
}

const styleSheet = StyleSheet as unknown as {
  create: <T extends Record<string, object>>(styles: T) => T;
  __koryDynamicThemePatched?: boolean;
};
if (!styleSheet.__koryDynamicThemePatched) {
  styleSheet.create = <T extends Record<string, object>>(styles: T): T => {
    for (const style of Object.values(styles) as Record<string, unknown>[]) {
      for (const [property, value] of Object.entries(style)) {
        if (typeof value !== 'string') continue;
        const themeToken = tokenForInitialValue.get(value);
        if (!themeToken) continue;
        Object.defineProperty(style, property, {
          enumerable: true,
          configurable: true,
          get: () => activeColors[themeToken],
        });
      }
    }
    // React Native may skip style diffing when a component renders the exact
    // same style object reference again. Return a fresh snapshot each time a
    // named style is read so a host theme change reaches already-mounted native
    // views while the token getters still resolve against the current palette.
    return new Proxy(styles, {
      get(target, property, receiver) {
        const style = Reflect.get(target, property, receiver);
        if (!style || typeof style !== 'object' || Array.isArray(style)) return style;
        return { ...style };
      },
    }) as T;
  };
  styleSheet.__koryDynamicThemePatched = true;
}

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  huge: 40,
};

export const radii = {
  sm: 4,
  md: 8,
  lg: 10,
  xl: 14,
  xxl: 18,
  full: 999,
};

export const type = {
  xs: 11,
  sm: 13,
  base: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
};

export const breakpoints = {
  compact: 0,
  medium: 600,
  rail: 820,
  wide: 980,
  threeColumn: 1240,
};

export const card: ViewStyle = {
  backgroundColor: colors.surface2,
  borderRadius: radii.lg,
};

export const label: TextStyle = {
  color: colors.textMuted,
  fontSize: type.xs,
  fontWeight: '600',
  letterSpacing: 1.2,
  textTransform: 'uppercase',
};

export const mono: TextStyle = {
  fontFamily: 'monospace',
};
