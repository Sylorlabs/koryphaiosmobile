import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Download, RefreshCw, Search } from 'lucide-react-native';
import { safeGetItem, safeSetItem } from '../control/safeSecureStore';

import { useControl } from '../control/ControlProvider';
import { shareTextFile } from '../native/mobileFiles';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type { BillingInspection, BillingSessionCostSummary } from '../types/control';
import { ActionButton } from './ui';

const billingPreferenceKey = 'koryphaios.mobile.billing.v1';

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

function count(value: number): string {
  return Math.round(value).toLocaleString();
}

export function BillingControlView() {
  const { inspect, snapshot } = useControl();
  const [data, setData] = useState<BillingInspection | null>(null);
  const [expandedSession, setExpandedSession] = useState('');
  const [sessionDetails, setSessionDetails] = useState<Record<string, BillingSessionCostSummary | null>>({});
  const [loading, setLoading] = useState(false);
  const [busySession, setBusySession] = useState('');
  const [exporting, setExporting] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [excludedProviders, setExcludedProviders] = useState<string[]>([]);
  const [showSubscriptionApiEquivalent, setShowSubscriptionApiEquivalent] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await inspect<BillingInspection>('billing.inspect', { excludedProviders }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load billing usage');
    } finally {
      setLoading(false);
    }
  }, [excludedProviders, inspect]);

  useEffect(() => {
    let mounted = true;
    void safeGetItem(billingPreferenceKey).then((raw) => {
      if (!mounted || !raw) return;
      try {
        const parsed = JSON.parse(raw) as {
          excludedProviders?: unknown;
          showSubscriptionApiEquivalent?: unknown;
        };
        if (Array.isArray(parsed.excludedProviders)) {
          setExcludedProviders(
            parsed.excludedProviders.map((provider) => String(provider).toLowerCase()).filter(Boolean),
          );
        }
        if (typeof parsed.showSubscriptionApiEquivalent === 'boolean') {
          setShowSubscriptionApiEquivalent(parsed.showSubscriptionApiEquivalent);
        }
      } catch {
        // Ignore stale local preferences and use current defaults.
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const sessionTitle = useMemo(
    () => new Map(snapshot.sessions.map((session) => [session.id, session.title] as const)),
    [snapshot.sessions],
  );

  const sessionRows = useMemo(
    () => Object.entries(data?.sessions ?? {}).sort(([, left], [, right]) => right.spendUsd - left.spendUsd),
    [data?.sessions],
  );

  const availableProviders = useMemo(
    () => data?.credits.availableBillingProviders ?? [],
    [data?.credits.availableBillingProviders],
  );
  const filteredProviders = useMemo(() => {
    const query = providerSearch.trim().toLowerCase();
    if (!query) return availableProviders;
    return availableProviders.filter((provider) => provider.toLowerCase().includes(query));
  }, [availableProviders, providerSearch]);

  const saveBillingPreferences = useCallback(
    async (nextExcluded: string[], nextShowEquivalent = showSubscriptionApiEquivalent) => {
      await safeSetItem(
        billingPreferenceKey,
        JSON.stringify({
          excludedProviders: nextExcluded,
          showSubscriptionApiEquivalent: nextShowEquivalent,
        }),
      );
    },
    [showSubscriptionApiEquivalent],
  );

  const toggleProvider = (provider: string) => {
    const normalized = provider.toLowerCase();
    const next = excludedProviders.includes(normalized)
      ? excludedProviders.filter((item) => item !== normalized)
      : [...excludedProviders, normalized];
    setExcludedProviders(next);
    void saveBillingPreferences(next);
  };

  const toggleApiEquivalent = () => {
    const next = !showSubscriptionApiEquivalent;
    setShowSubscriptionApiEquivalent(next);
    void saveBillingPreferences(excludedProviders, next);
  };

  const openSession = async (sessionId: string) => {
    if (expandedSession === sessionId) {
      setExpandedSession('');
      return;
    }
    setExpandedSession(sessionId);
    if (Object.prototype.hasOwnProperty.call(sessionDetails, sessionId)) return;
    setBusySession(sessionId);
    setError('');
    try {
      const detail = await inspect<BillingSessionCostSummary | null>('billing.session', {
        sessionId,
        excludedProviders,
      });
      setSessionDetails((current) => ({ ...current, [sessionId]: detail }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load chat cost details');
    } finally {
      setBusySession('');
    }
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    setError('');
    try {
      const csv = await inspect<string>('billing.usage_export', { excludedProviders });
      const day = new Date().toISOString().slice(0, 10);
      await shareTextFile(`koryphaios-api-usage-${day}.csv`, csv, 'text/csv');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not export usage');
    } finally {
      setExporting(false);
    }
  };

  const totals = data?.usage.totals;
  const last30 = (data?.daily ?? []).reduce((sum, bucket) => sum + (bucket.estimatedCostUsd ?? 0), 0);
  const includedProviderCount = Math.max(0, availableProviders.length - excludedProviders.length);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.title}>Usage & billing</Text>
            <Text style={styles.meta}>Host-reported API usage and per-chat costs.</Text>
          </View>
          <Pressable accessibilityLabel="Refresh billing" onPress={() => void refresh()} style={styles.iconButton}>
            <RefreshCw size={17} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricValue}>{money(data?.credits.totalSpendUsd)}</Text><Text style={styles.metricLabel}>Billing total</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{count(totals?.totalCount ?? 0)}</Text><Text style={styles.metricLabel}>Calls</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{data?.credits.remainingCents == null ? money(last30) : money(data.credits.remainingCents / 100)}</Text><Text style={styles.metricLabel}>{data?.credits.remainingCents == null ? 'Last 30 days' : 'Balance'}</Text></View>
        </View>
        <ActionButton label={exporting ? 'Preparing…' : 'Export CSV'} icon={Download} disabled={exporting} onPress={() => void exportCsv()} />
      </View>

      <View style={styles.card}>
        <Pressable onPress={() => setControlsOpen((open) => !open)} style={styles.controlsHeader}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Billing controls</Text>
            <Text style={styles.meta}>
              {availableProviders.length
                ? `${includedProviderCount} of ${availableProviders.length} providers included`
                : 'Choose which providers contribute to Billing totals'}
            </Text>
          </View>
          {controlsOpen ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
        </Pressable>
        {controlsOpen ? (
          <View style={styles.controlsBody}>
            <Pressable onPress={toggleApiEquivalent} style={styles.toggleRow}>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>Show subscription API-equivalent values</Text>
                <Text style={styles.rowMeta}>Comparison only; never added to tracked spend.</Text>
              </View>
              <View style={[styles.checkBox, showSubscriptionApiEquivalent && styles.checkBoxOn]}>
                {showSubscriptionApiEquivalent ? <Check size={13} color={colors.onAccent} /> : null}
              </View>
            </Pressable>
            {availableProviders.length ? (
              <>
                <View style={styles.searchBox}>
                  <Search size={14} color={colors.textMuted} />
                  <TextInput
                    value={providerSearch}
                    onChangeText={setProviderSearch}
                    placeholder="Search providers"
                    placeholderTextColor={colors.textMuted}
                    autoCorrect={false}
                    autoCapitalize="none"
                    style={styles.searchInput}
                  />
                </View>
                <View style={styles.providerControls}>
                  {filteredProviders.map((provider) => {
                    const included = !excludedProviders.includes(provider.toLowerCase());
                    return (
                      <Pressable key={provider} onPress={() => toggleProvider(provider)} style={styles.toggleRow}>
                        <Text style={styles.rowTitle}>{provider}</Text>
                        <View style={[styles.checkBox, included && styles.checkBoxOn]}>
                          {included ? <Check size={13} color={colors.onAccent} /> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Chats</Text>
        {sessionRows.map(([sessionId, summary]) => {
          const open = expandedSession === sessionId;
          const detail = sessionDetails[sessionId];
          return (
            <View key={sessionId} style={styles.sessionRow}>
              <Pressable onPress={() => void openSession(sessionId)} style={styles.sessionHeader}>
                <View style={styles.flex}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{sessionTitle.get(sessionId) || `Chat ${sessionId.slice(0, 8)}`}</Text>
                  <Text style={styles.rowMeta}>{summary.hasSubscriptionUsage ? 'Subscription usage' : 'Metered usage'}{summary.pricingIncomplete ? '  partial pricing' : ''}</Text>
                </View>
                <Text style={styles.cost}>{summary.hasKnownCost ? money(summary.spendUsd) : summary.hasSubscriptionUsage ? '$0.00' : '—'}</Text>
                {open ? <ChevronUp size={15} color={colors.textMuted} /> : <ChevronDown size={15} color={colors.textMuted} />}
              </Pressable>
              {open ? (
                <View style={styles.detailBlock}>
                  {busySession === sessionId ? <Text style={styles.meta}>Loading details…</Text> : null}
                  {detail?.providers?.map((provider) => (
                    <View key={provider.name} style={styles.providerBlock}>
                      <View style={styles.providerHeader}>
                        <Text style={styles.rowTitle}>{provider.name}</Text>
                        <Text style={styles.rowMeta}>{provider.subscription && showSubscriptionApiEquivalent ? `API equivalent ${money(provider.apiEquivalentUsd)}` : money(provider.spendUsd)}</Text>
                      </View>
                      {provider.models.map((model) => (
                        <View key={model.model} style={styles.modelRow}>
                          <View style={styles.flex}>
                            <Text numberOfLines={1} style={styles.rowMeta}>{model.model}</Text>
                            <Text style={styles.muted}>{count(model.tokensIn)} in  {count(model.tokensOut)} out</Text>
                          </View>
                          <Text style={styles.muted}>{model.subscription && showSubscriptionApiEquivalent ? money(model.apiEquivalentUsd) : money(model.spendUsd)}</Text>
                        </View>
                      ))}
                    </View>
                  ))}
                  {detail === null ? <Text style={styles.meta}>No detailed usage for this chat.</Text> : null}
                </View>
              ) : null}
            </View>
          );
        })}
        {!loading && !sessionRows.length ? <Text style={styles.meta}>No session usage recorded.</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Recent API activity</Text>
        {(data?.usage.entries ?? []).map((entry) => (
          <View key={entry.id} style={styles.usageRow}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>{entry.kind}  {entry.provider}</Text>
              <Text numberOfLines={1} style={styles.rowMeta}>{entry.model}{entry.detail ? `  ${entry.detail}` : ''}</Text>
            </View>
            <Text style={styles.cost}>{money(entry.estimatedCostUsd)}</Text>
          </View>
        ))}
        {!loading && !(data?.usage.entries.length ?? 0) ? <Text style={styles.meta}>No API usage recorded.</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: spacing.md, paddingBottom: spacing.huge, gap: spacing.sm },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  controlsHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  controlsBody: { gap: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700' },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.base, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: typography.xs, lineHeight: 17 },
  metrics: { flexDirection: 'row', gap: spacing.xs },
  metric: { flex: 1, minWidth: 0, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface3 },
  metricValue: { color: colors.textPrimary, fontSize: typography.base, fontWeight: '700' },
  metricLabel: { marginTop: 2, color: colors.textMuted, fontSize: 10 },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sessionRow: { overflow: 'hidden', borderRadius: radii.lg, backgroundColor: colors.surface1 },
  sessionHeader: { minHeight: 52, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '600' },
  rowMeta: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
  cost: { color: colors.textSecondary, fontSize: typography.xs, fontVariant: ['tabular-nums'] },
  detailBlock: { gap: spacing.xs, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  providerBlock: { gap: 4, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface2 },
  providerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: 4 },
  muted: { color: colors.textMuted, fontSize: 10, fontVariant: ['tabular-nums'] },
  toggleRow: {
    minHeight: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.surface1,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  searchBox: {
    minHeight: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.surface1,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  searchInput: { flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: typography.sm },
  providerControls: { gap: 3 },
  usageRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  error: { color: colors.error, fontSize: typography.xs, lineHeight: 18 },
});
