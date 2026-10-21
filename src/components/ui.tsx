import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type { Agent, AgentStatus } from '../types/control';

export function StatusDot({ status, size = 8 }: { status: AgentStatus | 'online' | 'offline' | 'connecting'; size?: number }) {
  const color =
    status === 'running' || status === 'online'
      ? colors.success
      : status === 'paused' || status === 'connecting'
        ? colors.warning
        : status === 'error' || status === 'offline'
          ? colors.error
          : status === 'blocked'
            ? colors.warning
            : colors.textMuted;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export function AgentGlyph({ agent, size = 36 }: { agent: Agent; size?: number }) {
  const providerColor =
    agent.provider === 'Claude'
      ? colors.claude
      : agent.provider === 'Google'
        ? colors.google
        : agent.id === 'manager' || agent.id === 'kory-manager' || agent.role === 'Manager'
          ? colors.kory
          : colors.codex;
  const initials = agent.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <View
      style={[
        styles.agentGlyph,
        {
          width: size,
          height: size,
          borderRadius: Math.max(radii.md, size * 0.28),
          borderColor: `${providerColor}88`,
          backgroundColor: `${providerColor}16`,
        },
      ]}
    >
      <Text style={[styles.agentGlyphText, { color: providerColor, fontSize: Math.max(10, size * 0.31) }]}>{initials}</Text>
      <View style={styles.agentStatusDot}>
        <StatusDot status={agent.status} size={7} />
      </View>
    </View>
  );
}

export function ProgressBar({ value, height = 4 }: { value: number; height?: number }) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.progressTrack, { height, borderRadius: height / 2 }]}>
      <View style={[styles.progressFill, { width: `${normalized * 100}%`, height, borderRadius: height / 2 }]} />
    </View>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  active = false,
  disabled = false,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  const foreground = danger ? colors.error : active ? colors.accent : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        active && styles.iconButtonActive,
        danger && styles.iconButtonDanger,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon size={18} color={foreground} strokeWidth={1.9} />
    </Pressable>
  );
}

export function ActionButton({
  label,
  accessibilityLabel,
  icon: Icon,
  onPress,
  primary = false,
  danger = false,
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  accessibilityLabel?: string;
  icon?: LucideIcon;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const foreground = primary ? colors.onAccent : danger ? colors.error : colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        primary && styles.actionButtonPrimary,
        danger && styles.actionButtonDanger,
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={foreground} /> : Icon ? <Icon size={16} color={foreground} strokeWidth={1.9} /> : null}
      <Text style={[styles.actionButtonText, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function Eyebrow({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  agentGlyph: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  agentGlyphText: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  agentStatusDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    overflow: 'hidden',
    backgroundColor: colors.surface4,
  },
  progressFill: {
    backgroundColor: colors.accent,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconButtonActive: {
    backgroundColor: colors.accentSoft,
  },
  iconButtonDanger: {
    backgroundColor: colors.errorSoft,
  },
  actionButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface3,
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent,
  },
  actionButtonDanger: {
    backgroundColor: colors.errorSoft,
  },
  actionButtonText: {
    fontSize: typography.sm,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.4,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
    letterSpacing: 1.15,
    textTransform: 'uppercase',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '700',
  },
  sectionDetail: {
    color: colors.textMuted,
    fontSize: typography.sm,
    marginTop: spacing.xxs,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
