import React, { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { CheckCircle2, CircleAlert, CircleDot, RefreshCw, X } from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { isHostConnectionError, readableControlError } from '../control/connectionPresentation';
import { colors, spacing, type as typography } from '../theme/tokens';

/** Both screen shells use this so feedback remains visible on phones and sheets. */
export function CommandFeedback() {
  const pathname = usePathname();
  const { commandStatuses, dismissCommandStatus, error, pairing, refreshing, refresh } = useControl();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  const running = commandStatuses.filter((item) => item.state === 'running');
  const unresolved = commandStatuses.filter((item) => item.state === 'warning' || item.state === 'error');
  const status = running.at(-1) ?? unresolved.at(-1) ?? commandStatuses.at(-1);
  const announcement = status ? `${status.label}. ${status.message}` : '';

  useEffect(() => {
    if (focused && announcement) AccessibilityInfo.announceForAccessibility(announcement);
  }, [focused, announcement, status?.id]);

  useEffect(() => {
    if (!focused || !status || !['accepted', 'success'].includes(status.state) || status.reconciledAt === undefined) return;
    const timer = setTimeout(() => dismissCommandStatus(status.id), 6000);
    return () => clearTimeout(timer);
  }, [focused, status, dismissCommandStatus]);

  // These routes render pairing-specific errors inline. An earlier failed
  // direct connection must not follow the user into QR linking.
  if (!focused || (!status && !error) ||
      (!pairing && !status && (pathname === '/machines' || pathname === '/link-device'))) return null;
  const warning = !status || status.state === 'error' || status.state === 'warning';
  const connectionFailure = Boolean(error && isHostConnectionError(error) && !status);
  const Icon = warning ? CircleAlert : status?.state === 'accepted' ? CircleDot : CheckCircle2;
  const tint = warning ? colors.warning : status?.state === 'accepted' ? colors.textSecondary : colors.success;

  return (
    <View style={styles.container} testID="command-feedback">
      {status?.state === 'running'
        ? <ActivityIndicator color={colors.accent} accessibilityLabel="Request in progress" />
        : <Icon size={18} color={tint} />}
      <View style={styles.copy}>
        <Text style={styles.title} accessibilityRole="header">
          {status?.label ?? (connectionFailure ? 'Desktop unavailable' : 'Connection needs attention')}
          {running.length > 1 ? ` · ${running.length} requests in progress` : ''}
        </Text>
        <Text style={styles.message} accessibilityLiveRegion="polite">
          {status ? (status.state === 'error' || status.state === 'warning'
            ? readableControlError(status.message, pairing) : status.message)
            : readableControlError(error ?? '', pairing)}
        </Text>
      </View>
      {warning && pairing ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh host state"
          accessibilityHint="Checks the result without repeating the command"
          accessibilityState={{ disabled: refreshing }} disabled={refreshing}
          style={styles.button} onPress={() => void refresh()}>
          <RefreshCw size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
      {!status && error && pathname !== '/machines' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open machines to check pairing"
          style={styles.machineButton} onPress={() => router.push('/machines')}>
          <Text style={styles.machineButtonText}>Machines</Text>
        </Pressable>
      ) : null}
      {status && status.state !== 'running' ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss command feedback"
          style={styles.button} onPress={() => dismissCommandStatus(status.id)}>
          <X size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingLeft: spacing.sm, paddingRight: spacing.xxs, paddingVertical: spacing.xs,
    backgroundColor: colors.surface2,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontWeight: '600', fontSize: typography.sm },
  message: { color: colors.textSecondary, fontSize: typography.sm, marginTop: 2 },
  button: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  machineButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  machineButtonText: { color: colors.accent, fontWeight: '600', fontSize: typography.sm },
});
