import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import {
  buildContextSegments,
  CONTEXT_SEGMENT_DEFINITIONS,
  formatTokens,
  MobileContextRing,
} from './MobileSurface';

export function MobileContextPopover({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { snapshot, sendCommand } = useControl();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState('');
  const visibilityRequests = useRef(new Set<string>());
  const [pendingVisibility, setPendingVisibility] = useState<Set<string>>(() => new Set());
  const context = snapshot.context;
  const ratio =
    context.limit > 0 ? Math.max(0, Math.min(1, context.used / context.limit)) : null;
  const segments = useMemo(
    () => buildContextSegments(context.used, context.breakdown),
    [context.breakdown, context.used],
  );
  const free = Math.max(0, context.limit - context.used);
  const maxHeight = Math.max(80, height - insets.top - insets.bottom - 86);
  const legendSegments = segments.length
    ? segments
    : CONTEXT_SEGMENT_DEFINITIONS.map((segment) => ({ ...segment, tokens: 0 }));

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setDetailsOpen(false);
      setActivityOpen(false);
      setExpandedEntryId('');
    }, 0);
    return () => clearTimeout(timer);
  }, [visible]);

  const visibilityKey = (archiveId: string) =>
    JSON.stringify([snapshot.machine.id, snapshot.activeSessionId, archiveId]);
  const isVisibilityPending = (archiveId: string) => pendingVisibility.has(visibilityKey(archiveId));
  const setVisibility = (archiveId: string, hiddenFromAgent: boolean) => {
    const sessionId = snapshot.activeSessionId;
    if (!sessionId) return;
    const key = visibilityKey(archiveId);
    // Lock synchronously: two taps before the next render must not send twice.
    if (visibilityRequests.current.has(key)) return;
    visibilityRequests.current.add(key);
    setPendingVisibility(new Set(visibilityRequests.current));
    void (async () => {
      try {
        await sendCommand('context.visibility', { sessionId, archiveId, hiddenFromAgent });
      } catch {
        // ControlProvider publishes command failures and preserves host uncertainty.
      } finally {
        visibilityRequests.current.delete(key);
        setPendingVisibility(new Set(visibilityRequests.current));
      }
    })();
  };

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close context menu"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={[styles.card, { top: insets.top + 54, maxHeight }]}
          contentContainerStyle={styles.cardContent}
        >
          <View style={styles.summary}>
            <MobileContextRing
              used={context.used}
              limit={context.limit}
              breakdown={context.breakdown}
              size={42}
            />
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryValue}>
                {ratio === null ? formatTokens(context.used) : `${Math.round(ratio * 100)}%`}
              </Text>
              <Text style={styles.summaryMeta}>
                {context.limit > 0
                  ? `${formatTokens(context.used)} of ${formatTokens(context.limit)} tokens`
                  : context.used > 0
                    ? `${formatTokens(context.used)} tokens · window unknown`
                    : 'Awaiting provider usage'}
              </Text>
              {context.provider || context.model ? (
                <Text numberOfLines={1} style={styles.summaryProvider}>
                  {[context.provider, context.model].filter(Boolean).join(' / ')}
                  {context.estimated ? '  Estimated' : ''}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.legendWrap}>
            {legendSegments.map((segment) => (
              <View key={segment.key} style={styles.legendItem}>
                <View style={[styles.legendRing, { borderColor: segment.color }]} />
                <Text numberOfLines={1} style={styles.legendText}>{segment.label}</Text>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={detailsOpen ? 'Collapse context details' : 'Expand context details'}
            onPress={() => {
              setDetailsOpen((value) => !value);
              if (detailsOpen) setActivityOpen(false);
            }}
            style={({ pressed }) => [styles.expandRow, pressed && styles.pressed]}
          >
            <Text style={styles.expandLabel}>Details</Text>
            {detailsOpen ? (
              <ChevronUp size={16} color={colors.textMuted} />
            ) : (
              <ChevronDown size={16} color={colors.textMuted} />
            )}
          </Pressable>

          {detailsOpen ? (
            <View style={styles.details}>
              {segments.length ? (
                <View style={styles.segmentList}>
                  {segments.map((segment) => (
                    <View key={segment.key} style={styles.segmentRow}>
                      <View style={[styles.segmentRing, { borderColor: segment.color }]} />
                      <Text style={styles.segmentLabel}>{segment.label}</Text>
                      <Text style={styles.segmentValue}>~{formatTokens(segment.tokens)}</Text>
                    </View>
                  ))}
                  {context.limit > 0 ? (
                    <View style={styles.segmentRow}>
                      <View style={[styles.segmentRing, { borderColor: colors.surface4 }]} />
                      <Text style={styles.segmentLabel}>Free</Text>
                      <Text style={styles.segmentValue}>{formatTokens(free)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {context.cached > 0 ? (
                <View style={styles.factRow}>
                  <Text style={styles.factLabel}>Cached input</Text>
                  <Text style={styles.segmentValue}>{formatTokens(context.cached)}</Text>
                </View>
              ) : null}

              {context.archive.length ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={activityOpen ? 'Collapse context activity' : 'Expand context activity'}
                    onPress={() => setActivityOpen((value) => !value)}
                    style={({ pressed }) => [styles.activityRow, pressed && styles.pressed]}
                  >
                    <Text style={styles.expandLabel}>Context activity</Text>
                    <Text style={styles.expandCount}>{context.archive.length}</Text>
                    {activityOpen ? (
                      <ChevronUp size={16} color={colors.textMuted} />
                    ) : (
                      <ChevronDown size={16} color={colors.textMuted} />
                    )}
                  </Pressable>
                  {activityOpen ? (
                    <ScrollView style={styles.archiveScroll} contentContainerStyle={styles.archiveList}>
                      {context.archive.slice().reverse().map((entry) => (
                        <View key={entry.id} style={styles.archiveItem}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={expandedEntryId === entry.id ? 'Collapse context item' : 'Expand context item'}
                            onPress={() =>
                              setExpandedEntryId((current) => current === entry.id ? '' : entry.id)
                            }
                            style={({ pressed }) => [styles.archiveCopy, pressed && styles.pressed]}
                          >
                            <Text numberOfLines={1} style={styles.archiveLabel}>{entry.label}</Text>
                            <Text
                              selectable={expandedEntryId === entry.id}
                              numberOfLines={expandedEntryId === entry.id ? undefined : 2}
                              style={styles.archiveContent}
                            >
                              {entry.content}
                            </Text>
                            {expandedEntryId === entry.id ? (
                              <View style={styles.archiveMetaRow}>
                                <Text style={styles.archiveMeta}>{entry.kind}</Text>
                                {entry.redacted ? <Text style={styles.archiveMeta}>Redacted</Text> : null}
                                {entry.truncated ? <Text style={styles.archiveMeta}>Truncated</Text> : null}
                                {entry.originalByteCount ? (
                                  <Text style={styles.archiveMeta}>
                                    {entry.originalByteCount.toLocaleString()} bytes
                                  </Text>
                                ) : null}
                              </View>
                            ) : null}
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              entry.prunedForAgent
                                ? 'Show this context to the agent'
                                : 'Hide this context from the agent'
                            }
                            accessibilityState={{
                              disabled: !snapshot.activeSessionId || isVisibilityPending(entry.id),
                              busy: isVisibilityPending(entry.id),
                            }}
                            disabled={!snapshot.activeSessionId || isVisibilityPending(entry.id)}
                            onPress={() => setVisibility(entry.id, !entry.prunedForAgent)}
                            style={({ pressed }) => [styles.visibilityButton, pressed && styles.pressed]}
                          >
                            {entry.prunedForAgent ? (
                              <EyeOff size={16} color={colors.textMuted} />
                            ) : (
                              <Eye size={16} color={colors.textSecondary} />
                            )}
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    elevation: 30,
  },
  card: {
    position: 'absolute',
    right: spacing.sm,
    width: 312,
    maxWidth: '88%',
    borderRadius: radii.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderBright,
    backgroundColor: colors.surface2,
  },
  cardContent: {
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  summaryMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  summaryProvider: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 10,
  },
  segmentList: {
    gap: 7,
    paddingVertical: spacing.xxs,
  },
  legendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.sm,
    rowGap: 6,
    paddingVertical: 2,
  },
  legendItem: {
    minWidth: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendRing: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
  },
  legendText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  segmentRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  segmentRing: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  segmentLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '600',
  },
  segmentValue: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontVariant: ['tabular-nums'],
  },
  factRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  factLabel: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '600',
  },
  expandRow: {
    minHeight: 34,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  details: {
    gap: spacing.xs,
  },
  activityRow: {
    minHeight: 34,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  expandLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  expandCount: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontVariant: ['tabular-nums'],
  },
  archiveScroll: {
    maxHeight: 248,
  },
  archiveList: {
    gap: spacing.xxs,
  },
  archiveItem: {
    minHeight: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  archiveCopy: {
    flex: 1,
    minWidth: 0,
  },
  archiveLabel: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  archiveContent: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  archiveMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 6,
  },
  archiveMeta: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  visibilityButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
});
