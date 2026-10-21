import React from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, X } from 'lucide-react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, type as typography } from '../theme/tokens';
import type { ContextBreakdown } from '../types/control';
import { CommandFeedback } from './CommandFeedback';

export const CONTEXT_SEGMENT_DEFINITIONS = [
  { key: 'system', label: 'System prompt', color: '#8b5cf6' },
  { key: 'memory', label: 'Memory', color: '#14b8a6' },
  { key: 'skills', label: 'Skills', color: '#a78bfa' },
  { key: 'tools', label: 'Tool defs', color: '#f59e0b' },
  { key: 'chat', label: 'Chat', color: '#3b82f6' },
  { key: 'output', label: 'Output', color: '#f472b6' },
] as const;

export type ContextSegment = {
  key: string;
  label: string;
  color: string;
  tokens: number;
};

export function buildContextSegments(
  used: number,
  breakdown?: ContextBreakdown,
): ContextSegment[] {
  if (!breakdown || used <= 0) return [];
  const raw = CONTEXT_SEGMENT_DEFINITIONS.map((segment) => ({
    ...segment,
    tokens: Math.max(0, breakdown[segment.key]),
  })).filter((segment) => segment.tokens > 0);
  const sum = raw.reduce((total, segment) => total + segment.tokens, 0);
  if (sum <= 0) return [];
  if (used > sum) {
    return [
      ...raw,
      {
        key: 'unattributed',
        label: 'Unattributed',
        color: '#9ca3af',
        tokens: used - sum,
      },
    ];
  }
  return raw.map((segment) => ({
    ...segment,
    tokens: Math.round(used * (segment.tokens / sum)),
  }));
}

export function contextColor(ratio: number): string {
  if (ratio > 0.85) return colors.error;
  if (ratio > 0.65) return colors.warning;
  return colors.accent;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return value.toLocaleString();
}

export function MobileContextRing({
  used,
  limit,
  breakdown,
  onPress,
  size = 36,
}: {
  used: number;
  limit: number;
  breakdown?: ContextBreakdown;
  onPress?: () => void;
  size?: number;
}) {
  const stroke = Math.max(3, Math.round(size / 12));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = limit > 0 ? Math.max(0, Math.min(1, used / limit)) : null;
  const segments = ratio === null ? [] : buildContextSegments(used, breakdown);
  const label = ratio === null ? 'Context' : `Context ${Math.round(ratio * 100)} percent`;
  let segmentOffset = 0;

  const ring = (
    <View style={[styles.ringWrap, { width: size + 4, height: size + 4 }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.surface4}
          strokeWidth={stroke}
        />
        {ratio !== null && segments.length ? (
          segments.map((segment) => {
            const length = Math.min(
              circumference,
              circumference * (segment.tokens / Math.max(limit, 1)),
            );
            const offset = segmentOffset;
            segmentOffset += length;
            return (
              <SvgCircle
                key={segment.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
                strokeDasharray={[length, Math.max(0, circumference - length)]}
                strokeDashoffset={-offset}
                rotation={-90}
                originX={size / 2}
                originY={size / 2}
              />
            );
          })
        ) : ratio !== null ? (
          <SvgCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={contextColor(ratio)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={[circumference * ratio, circumference * (1 - ratio)]}
            rotation={-90}
            originX={size / 2}
            originY={size / 2}
          />
        ) : null}
      </Svg>
      <Text
        style={[
          styles.ringText,
          ratio !== null && !segments.length && { color: contextColor(ratio) },
        ]}
      >
        {ratio === null ? '—' : Math.round(ratio * 100)}
      </Text>
    </View>
  );

  if (!onPress) return <View accessibilityLabel={label}>{ring}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.ringButton, pressed && styles.pressed]}
    >
      {ring}
    </Pressable>
  );
}

export function MobileSurface({
  title,
  children,
  right,
  showBack = true,
  closeButton = false,
  background = colors.surface1,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  showBack?: boolean;
  closeButton?: boolean;
  background?: string;
}) {
  const { width, height } = useWindowDimensions();
  const screen = Dimensions.get('screen');
  const windowedIPad = Platform.OS === 'ios' && Platform.isPad &&
    (width < screen.width - 24 || height < screen.height - 24);
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/workspace');
  };

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        windowedIPad && styles.windowedIPadSafeArea,
        { backgroundColor: background },
      ]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <View style={styles.header}>
        {showBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={goBack}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          >
            <ArrowLeft size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        <Text numberOfLines={1} style={styles.title}>{title}</Text>
        {right}
        {closeButton ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={goBack}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          >
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <CommandFeedback />
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  windowedIPadSafeArea: {
    paddingTop: 42,
  },
  header: {
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface1,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    position: 'absolute',
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.65,
  },
});
