import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronDown, ChevronUp, RefreshCw, Search, Trash2 } from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  NoteContextActivation,
  NoteRelationship,
  NoteSemanticIndexRebuildResult,
  NoteSemanticIndexStatus,
  RemoteNote,
} from '../types/control';
import { ActionButton } from './ui';

type RelationshipFilter = '' | 'proposed' | 'accepted' | 'rejected';

const relationshipLabels: Record<NoteRelationship['type'], string> = {
  related_to: 'Related to',
  supports: 'Supports',
  contradicts: 'Contradicts',
  depends_on: 'Depends on',
  supersedes: 'Supersedes',
};

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
    >
      <Text style={styles.rowTitle}>{label}</Text>
      <View style={[styles.switchTrack, value && styles.switchTrackActive]}>
        <View style={[styles.switchThumb, value && styles.switchThumbActive]} />
      </View>
    </Pressable>
  );
}

function FilterChips({ value, onChange }: { value: RelationshipFilter; onChange: (value: RelationshipFilter) => void }) {
  const options: { value: RelationshipFilter; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'proposed', label: 'Proposed' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'rejected', label: 'Rejected' },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((option) => (
        <Pressable
          key={option.label}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => [styles.chip, value === option.value && styles.chipActive, pressed && styles.pressed]}
        >
          <Text style={[styles.chipText, value === option.value && styles.chipTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function NotesNetworkControlView({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const { inspect, sendCommand } = useControl();
  const [filter, setFilter] = useState<RelationshipFilter>('');
  const [offset, setOffset] = useState(0);
  const [relationships, setRelationships] = useState<NoteRelationship[]>([]);
  const [loadingRelationships, setLoadingRelationships] = useState(false);
  const [expanded, setExpanded] = useState('');
  const [removal, setRemoval] = useState('');
  const [refreshing, setRefreshing] = useState<NoteRelationship | null>(null);
  const [refreshSource, setRefreshSource] = useState<RemoteNote | null>(null);
  const [refreshTarget, setRefreshTarget] = useState<RemoteNote | null>(null);
  const [refreshEvidence, setRefreshEvidence] = useState('');
  const [query, setQuery] = useState('');
  const [semantic, setSemantic] = useState(false);
  const [maxHops, setMaxHops] = useState(1);
  const [maxChars, setMaxChars] = useState('6000');
  const [activation, setActivation] = useState<NoteContextActivation | null>(null);
  const [indexStatus, setIndexStatus] = useState<NoteSemanticIndexStatus | null>(null);
  const [indexConsent, setIndexConsent] = useState(false);
  const [batchLimit, setBatchLimit] = useState('32');
  const [rebuild, setRebuild] = useState<NoteSemanticIndexRebuildResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const loadRelationships = useCallback(async (nextFilter = filter, nextOffset = offset) => {
    setLoadingRelationships(true);
    setError('');
    try {
      const rows = await inspect<NoteRelationship[]>('notes.relationships', {
        status: nextFilter,
        limit: 100,
        offset: nextOffset,
      });
      setRelationships(rows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load relationships');
    } finally {
      setLoadingRelationships(false);
    }
  }, [filter, inspect, offset]);

  const loadIndex = useCallback(async () => {
    try {
      setIndexStatus(await inspect<NoteSemanticIndexStatus>('notes.semantic_index'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load semantic index status');
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRelationships('', 0);
      void loadIndex();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadIndex, loadRelationships]);

  const relationshipKey = (row: NoteRelationship) => `${row.fromId}:${row.toId}`;
  const canNext = relationships.length === 100;
  const canRebuild = Boolean(
    indexStatus?.available &&
      indexStatus.providerIdentity &&
      ['not_opted_in', 'partial', 'ready'].includes(indexStatus.mode),
  );

  const startRefresh = async (row: NoteRelationship) => {
    setBusy('refresh-load');
    setError('');
    try {
      const [source, target] = await Promise.all([
        inspect<RemoteNote>('notes.read', { noteId: row.fromId }),
        inspect<RemoteNote>('notes.read', { noteId: row.toId }),
      ]);
      setRefreshing(row);
      setRefreshSource(source);
      setRefreshTarget(target);
      setRefreshEvidence(row.evidence);
      setExpanded(relationshipKey(row));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not refresh relationship endpoints');
    } finally {
      setBusy('');
    }
  };

  const review = async (row: NoteRelationship, status: 'accepted' | 'rejected') => {
    setBusy('relationship');
    setError('');
    try {
      await sendCommand('notes.relationship_review', {
        fromId: row.fromId,
        toId: row.toId,
        status,
        expectedRevision: row.revision,
      });
      await loadRelationships();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not review relationship');
    } finally {
      setBusy('');
    }
  };

  const remove = async (row: NoteRelationship) => {
    setBusy('relationship');
    setError('');
    try {
      await sendCommand('notes.relationship_remove', {
        fromId: row.fromId,
        toId: row.toId,
        expectedRelationshipRevision: row.revision,
      });
      setRemoval('');
      await loadRelationships();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove relationship');
    } finally {
      setBusy('');
    }
  };

  const saveRefresh = async () => {
    if (!refreshing || !refreshSource || !refreshTarget || !refreshEvidence.trim()) return;
    setBusy('relationship');
    setError('');
    try {
      await sendCommand('notes.relationship_refresh', {
        fromId: refreshing.fromId,
        toId: refreshing.toId,
        type: refreshing.type,
        evidence: refreshEvidence.trim(),
        expectedRevision: refreshing.revision,
        expectedSourceRevision: refreshSource.revision,
        expectedTargetRevision: refreshTarget.revision,
        ...(refreshing.weight ? { weight: refreshing.weight } : {}),
      });
      setRefreshing(null);
      setRefreshSource(null);
      setRefreshTarget(null);
      setRefreshEvidence('');
      await loadRelationships();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not refresh relationship evidence');
    } finally {
      setBusy('');
    }
  };

  const runQuery = async () => {
    if (!query.trim()) return;
    setBusy('query');
    setError('');
    try {
      setActivation(await inspect<NoteContextActivation>('notes.context_query', {
        query: query.trim(),
        semantic,
        maxHops,
        maxChars: Number(maxChars) || 6000,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not run Notes query');
    } finally {
      setBusy('');
    }
  };

  const rebuildIndex = async (reset: boolean) => {
    if (!indexConsent || !canRebuild) return;
    setBusy('index');
    setError('');
    try {
      const result = await sendCommand('notes.semantic_index_rebuild', {
        limit: Number(batchLimit) || 32,
        reset,
      });
      const next = result.data as NoteSemanticIndexRebuildResult | undefined;
      if (next) {
        setRebuild(next);
        setIndexStatus(next.status);
      } else {
        await loadIndex();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not rebuild semantic index');
    } finally {
      setBusy('');
    }
  };

  const retrievalBudget = useMemo(() => activation ? Object.entries(activation.budget.used) : [], [activation]);

  return (
    <View style={styles.page}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Evidence relationships</Text>
            <Text style={styles.meta}>Typed claims stay separate from document links.</Text>
          </View>
          <Pressable accessibilityLabel="Refresh relationships" onPress={() => void loadRelationships()} style={styles.iconButton}>
            <RefreshCw size={16} color={colors.textMuted} />
          </Pressable>
        </View>
        <FilterChips
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setOffset(0);
            void loadRelationships(value, 0);
          }}
        />
        {loadingRelationships ? <Text style={styles.meta}>Loading…</Text> : null}
        <View style={styles.list}>
          {relationships.map((row) => {
            const key = relationshipKey(row);
            const open = expanded === key;
            const deleting = removal === key;
            const isRefresh = refreshing && relationshipKey(refreshing) === key;
            return (
              <View key={key} style={styles.relationshipRow}>
                <Pressable onPress={() => setExpanded(open ? '' : key)} style={styles.relationshipHeader}>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.rowTitle}>{row.fromTitle || row.fromId}</Text>
                    <Text numberOfLines={1} style={styles.rowMeta}>
                      {relationshipLabels[row.type]}  {row.toTitle || row.toId}
                    </Text>
                  </View>
                  <Text style={[styles.badge, row.stale && styles.warning]}>{row.status}{row.stale ? '  stale' : ''}</Text>
                  {open ? <ChevronUp size={15} color={colors.textMuted} /> : <ChevronDown size={15} color={colors.textMuted} />}
                </Pressable>
                {open ? (
                  <View style={styles.expanded}>
                    <Text style={styles.evidence}>{row.evidence}</Text>
                    <View style={styles.actions}>
                      <ActionButton label="Source" onPress={() => onOpenNote(row.fromId)} />
                      <ActionButton label="Target" onPress={() => onOpenNote(row.toId)} />
                      <ActionButton label="Refresh evidence" onPress={() => void startRefresh(row)} />
                    </View>
                    {row.status === 'proposed' ? (
                      <View style={styles.actions}>
                        <ActionButton label="Accept" primary disabled={row.stale || busy === 'relationship'} onPress={() => void review(row, 'accepted')} />
                        <ActionButton label="Reject" disabled={busy === 'relationship'} onPress={() => void review(row, 'rejected')} />
                      </View>
                    ) : null}
                    {isRefresh && refreshSource && refreshTarget ? (
                      <View style={styles.refreshBox}>
                        <Text style={styles.meta}>Latest endpoints: r{refreshSource.revision} / r{refreshTarget.revision}</Text>
                        <TextInput
                          value={refreshEvidence}
                          onChangeText={setRefreshEvidence}
                          multiline
                          textAlignVertical="top"
                          placeholder="Updated evidence"
                          placeholderTextColor={colors.textMuted}
                          style={styles.textarea}
                        />
                        <View style={styles.actions}>
                          <ActionButton label="Save proposal" primary disabled={!refreshEvidence.trim() || busy === 'relationship'} onPress={() => void saveRefresh()} />
                          <ActionButton label="Cancel" onPress={() => setRefreshing(null)} />
                        </View>
                      </View>
                    ) : null}
                    {deleting ? (
                      <View style={styles.removeConfirm}>
                        <Text style={styles.meta}>Remove this typed relationship?</Text>
                        <View style={styles.actions}>
                          <ActionButton label="Remove" disabled={busy === 'relationship'} onPress={() => void remove(row)} />
                          <ActionButton label="Cancel" onPress={() => setRemoval('')} />
                        </View>
                      </View>
                    ) : (
                      <Pressable onPress={() => setRemoval(key)} style={styles.removeRow}>
                        <Trash2 size={14} color={colors.error} />
                        <Text style={styles.removeText}>Remove relationship</Text>
                      </Pressable>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
          {!relationships.length && !loadingRelationships ? <Text style={styles.meta}>No relationships in this view.</Text> : null}
        </View>
        <View style={styles.pager}>
          <ActionButton
            label="Previous"
            disabled={offset === 0 || loadingRelationships}
            onPress={() => {
              const next = Math.max(0, offset - 100);
              setOffset(next);
              void loadRelationships(filter, next);
            }}
          />
          <Text style={styles.meta}>Page {Math.floor(offset / 100) + 1}</Text>
          <ActionButton
            label="Next"
            disabled={!canNext || loadingRelationships}
            onPress={() => {
              const next = offset + 100;
              setOffset(next);
              void loadRelationships(filter, next);
            }}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Query activation</Text>
        <Text style={styles.meta}>Read only retrieval across the current Notes network.</Text>
        <View style={styles.searchRow}>
          <Search size={15} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void runQuery()}
            returnKeyType="search"
            placeholder="What should these notes help answer?"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
        <Toggle label="Use semantic retrieval" value={semantic} onChange={setSemantic} />
        <View style={styles.inlineControls}>
          <Text style={styles.meta}>Graph hops</Text>
          {[0, 1, 2].map((value) => (
            <Pressable key={value} onPress={() => setMaxHops(value)} style={[styles.numberChip, maxHops === value && styles.chipActive]}>
              <Text style={[styles.chipText, maxHops === value && styles.chipTextActive]}>{value}</Text>
            </Pressable>
          ))}
          <TextInput
            value={maxChars}
            onChangeText={setMaxChars}
            keyboardType="number-pad"
            style={styles.numberInput}
            accessibilityLabel="Excerpt character budget"
          />
        </View>
        <ActionButton label={busy === 'query' ? 'Retrieving…' : 'Run query'} primary disabled={!query.trim() || busy === 'query'} onPress={() => void runQuery()} />
        {activation ? (
          <View style={styles.results}>
            <Text style={styles.rowMeta}>
              {activation.results.length} notes  {activation.retrieval.exhaustive ? 'exhaustive' : 'bounded'}  semantic {activation.retrieval.semantic}
            </Text>
            {activation.truncation.truncated ? <Text style={styles.warning}>Truncated: {activation.truncation.reasons.join(', ') || 'budget reached'}</Text> : null}
            {retrievalBudget.length ? (
              <Text style={styles.meta}>
                {retrievalBudget.map(([key, value]) => `${key} ${value}`).join('  ')}
              </Text>
            ) : null}
            {activation.conflicts.map((conflict) => (
              <Text key={`${conflict.noteId}:${conflict.reason}`} style={styles.warning}>{conflict.noteId}: {conflict.reason}</Text>
            ))}
            {activation.results.map((result) => (
              <Pressable key={result.id} onPress={() => onOpenNote(result.id)} style={styles.resultRow}>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{result.title}</Text>
                  <Text style={styles.rowMeta}>{result.explanation}</Text>
                  <Text numberOfLines={3} style={styles.excerpt}>{result.excerpt}</Text>
                </View>
                <Text style={styles.score}>{result.score.toFixed(2)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <Text style={styles.sectionTitle}>Semantic index</Text>
            <Text style={styles.meta}>Explicit project indexing controls.</Text>
          </View>
          <Pressable accessibilityLabel="Refresh semantic index" onPress={() => void loadIndex()} style={styles.iconButton}>
            <RefreshCw size={16} color={colors.textMuted} />
          </Pressable>
        </View>
        {indexStatus ? (
          <View style={styles.indexStats}>
            <Text style={styles.rowMeta}>Mode {indexStatus.mode}</Text>
            <Text style={styles.rowMeta}>
              {indexStatus.countsAvailable === false
                ? 'Coverage not evaluated'
                : `${indexStatus.indexedNotes} / ${indexStatus.eligibleNotes} indexed  ${Math.round(indexStatus.coverage * 100)}%`}
            </Text>
            <Text style={styles.rowMeta}>{indexStatus.staleNotes} stale  {indexStatus.representationChars} chars/note</Text>
          </View>
        ) : <Text style={styles.meta}>Index status unavailable.</Text>}
        <Toggle label="Allow this index rebuild" value={indexConsent} onChange={setIndexConsent} />
        <View style={styles.inlineControls}>
          <Text style={styles.meta}>Batch size</Text>
          <TextInput value={batchLimit} onChangeText={setBatchLimit} keyboardType="number-pad" style={styles.numberInput} />
        </View>
        <View style={styles.actions}>
          <ActionButton label="Rebuild" primary disabled={!indexConsent || !canRebuild || busy === 'index'} onPress={() => void rebuildIndex(false)} />
          <ActionButton label="Restart" disabled={!indexConsent || !canRebuild || busy === 'index'} onPress={() => void rebuildIndex(true)} />
        </View>
        {rebuild ? (
          <Text style={styles.meta}>
            Processed {rebuild.processed}  Indexed {rebuild.indexed}  Skipped {rebuild.skipped}{rebuild.hasMore ? '  More remain' : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.sm },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.xl, backgroundColor: colors.surface2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.base, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: typography.xs, lineHeight: 17 },
  rowTitle: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '600' },
  rowMeta: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
  chips: { gap: 6 },
  chip: { minHeight: 32, paddingHorizontal: 11, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3 },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '600' },
  chipTextActive: { color: colors.onAccent },
  list: { gap: 1, overflow: 'hidden', borderRadius: radii.lg, backgroundColor: colors.surface3 },
  relationshipRow: { backgroundColor: colors.surface1 },
  relationshipHeader: { minHeight: 52, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { color: colors.textMuted, fontSize: 10, textTransform: 'capitalize' },
  warning: { color: colors.warning, fontSize: typography.xs },
  expanded: { gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  evidence: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  refreshBox: { gap: spacing.xs, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface2 },
  textarea: { minHeight: 86, borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, backgroundColor: colors.surface3, color: colors.textPrimary, fontSize: typography.sm },
  removeConfirm: { gap: spacing.xs, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface2 },
  removeRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6 },
  removeText: { color: colors.error, fontSize: typography.xs, fontWeight: '600' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  toggle: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  switchTrack: { width: 42, height: 24, borderRadius: 12, padding: 3, backgroundColor: colors.surface4 },
  switchTrackActive: { backgroundColor: colors.accent },
  switchThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.textMuted },
  switchThumbActive: { marginLeft: 18, backgroundColor: colors.onAccent },
  searchRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface3 },
  searchInput: { flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: typography.sm },
  inlineControls: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  numberChip: { width: 34, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.surface3 },
  numberInput: { minWidth: 74, height: 36, paddingHorizontal: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface3, color: colors.textPrimary, fontSize: typography.sm, textAlign: 'center' },
  results: { gap: spacing.xs },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface1 },
  excerpt: { marginTop: 4, color: colors.textMuted, fontSize: typography.xs, lineHeight: 16 },
  score: { color: colors.textMuted, fontSize: 10, fontVariant: ['tabular-nums'] },
  indexStats: { gap: 3 },
  error: { color: colors.error, fontSize: typography.xs, lineHeight: 18 },
  pressed: { opacity: 0.7 },
});
