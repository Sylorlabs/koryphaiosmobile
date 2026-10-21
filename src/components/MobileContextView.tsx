import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import { formatTokens, MobileContextRing, MobileSurface } from './MobileSurface';

export function MobileContextView() {
  const { snapshot } = useControl();
  const { used, limit, cached } = snapshot.context;
  const ratio = limit > 0 ? Math.max(0, Math.min(1, used / limit)) : null;
  return (
    <MobileSurface title="Context">
      <View style={styles.content}>
        <View style={styles.hero}>
          <MobileContextRing used={used} limit={limit} size={68} />
          <View style={styles.heroCopy}>
            <Text style={styles.value}>{ratio === null ? formatTokens(used) : `${Math.round(ratio * 100)}%`}</Text>
            <Text style={styles.meta}>
              {limit > 0 ? `${formatTokens(used)} of ${formatTokens(limit)} tokens` : `${formatTokens(used)} tokens`}
            </Text>
          </View>
        </View>
        {cached > 0 ? (
          <View style={styles.fact}>
            <Text style={styles.factLabel}>Cached</Text>
            <Text style={styles.factValue}>{formatTokens(cached)}</Text>
          </View>
        ) : null}
      </View>
    </MobileSurface>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  hero: {
    minHeight: 112,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  value: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  meta: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: typography.sm,
  },
  fact: {
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  factLabel: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  factValue: {
    color: colors.textMuted,
    fontSize: typography.sm,
    fontVariant: ['tabular-nums'],
  },
});
