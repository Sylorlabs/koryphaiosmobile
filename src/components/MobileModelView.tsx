import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Search, Zap, X } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type { Agent, ContextBreakdown, ModelCatalogEntry } from '../types/control';
import { formatTokens, MobileContextRing, MobileSurface } from './MobileSurface';

type ContextPreview = {
  provider?: string;
  model?: string;
  used?: number;
  contextWindow?: number;
  contextKnown?: boolean;
  contextSource?: 'live' | 'catalog' | 'alias';
  usageKnown?: boolean;
  cachedInputTokens?: number;
  breakdown?: ContextBreakdown;
};

function managerAgent(agents: Agent[]): Agent | undefined {
  return agents.find((agent) => agent.id === 'kory-manager') ?? agents.find((agent) => agent.role.toLowerCase() === 'manager') ?? agents[0];
}

function inferredSelection(manager: Agent | undefined, models: ModelCatalogEntry[]): string {
  if (!manager) return '';
  const targetModel = manager.model.trim().toLowerCase();
  const targetProvider = manager.provider.trim().toLowerCase();
  const candidates = models.filter((model) =>
    [model.id, model.name, model.selection].some((value) => value.trim().toLowerCase() === targetModel),
  );

  return (
    candidates.find((model) =>
      [model.provider, model.providerLabel].some(
        (value) => value.trim().toLowerCase() === targetProvider,
      ),
    )?.selection ??
    candidates[0]?.selection ??
    ''
  );
}

export function MobileModelView() {
  const { snapshot, pairing } = useControl();
  const params = useLocalSearchParams<{ agentId?: string }>();
  const requestedAgentId = typeof params.agentId === 'string' ? params.agentId : '';
  const scopeKey = JSON.stringify([
    pairing?.baseUrl ?? '', pairing?.machineId ?? '', snapshot.machine.id,
    snapshot.activeSessionId, requestedAgentId,
  ]);
  return <ScopedMobileModelView key={scopeKey} requestedAgentId={requestedAgentId} />;
}

function ScopedMobileModelView({ requestedAgentId }: { requestedAgentId: string }) {
  const { snapshot, modelChoices, setModelChoice, inspect } = useControl();
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<ContextPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const mounted = useRef(true);
  const previewRequest = useRef(0);
  const manager = managerAgent(snapshot.agents);
  const missingAgent = Boolean(requestedAgentId && !snapshot.agents.some((agent) => agent.id === requestedAgentId));
  const targetAgent = requestedAgentId
    ? snapshot.agents.find((agent) => agent.id === requestedAgentId)
    : manager;
  const choiceKey = requestedAgentId
    ? `${snapshot.activeSessionId}:agent:${requestedAgentId}`
    : snapshot.activeSessionId;
  const fallback = inferredSelection(targetAgent, snapshot.modelCatalog);
  const choice = modelChoices[choiceKey];
  const selected = choice?.selection || fallback;
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      previewRequest.current += 1;
    };
  }, []);
  const reasoningLevel = choice?.reasoningLevel ?? '';
  const fastMode = choice?.fastMode === true;
  const selectedEntry = snapshot.modelCatalog.find((model) => model.selection === selected);
  const fastModeSupported = Boolean(
    selectedEntry &&
      (selectedEntry.provider === 'openai' ||
        ((selectedEntry.provider === 'codex' || selectedEntry.provider === 'codex-auth') &&
          selectedEntry.supportsFastMode === true)),
  );
  const fastModeLabel = selectedEntry?.provider === 'openai' ? 'Priority' : 'Fast';
  const normalized = query.trim().toLowerCase();
  const { providers, modelCount } = useMemo(() => {
    const grouped = new Map<string, ModelCatalogEntry[]>();
    let count = 0;
    for (const model of snapshot.modelCatalog) {
      if (normalized && !`${model.name} ${model.id} ${model.providerLabel}`.toLowerCase().includes(normalized)) continue;
      let entries = grouped.get(model.providerLabel);
      if (!entries) {
        entries = [];
        grouped.set(model.providerLabel, entries);
      }
      entries.push(model);
      count += 1;
    }
    return { providers: [...grouped.entries()], modelCount: count };
  }, [normalized, snapshot.modelCatalog]);

  const chooseModel = async (model: ModelCatalogEntry) => {
    if (!snapshot.activeSessionId || missingAgent) return;
    const request = ++previewRequest.current;
    let nextReasoning = reasoningLevel;
    if (!model.reasoningLevels.length) nextReasoning = '';
    else if (!model.reasoningLevels.includes(nextReasoning)) {
      nextReasoning = model.reasoningLevels.includes('medium') ? 'medium' : model.reasoningLevels[0];
    }
    const nextFastMode =
      model.provider === 'openai' ||
      ((model.provider === 'codex' || model.provider === 'codex-auth') &&
        model.supportsFastMode === true)
        ? fastMode
        : false;
    setModelChoice(choiceKey, {
      selection: model.selection,
      reasoningLevel: nextReasoning,
      fastMode: nextFastMode,
    });
    // A second tap can happen before React commits the new selected model.
    selectedRef.current = model.selection;
    setPreview(null);
    setPreviewError('');
    setPreviewing(true);
    try {
      const result = await inspect<ContextPreview>('context.model_preview', {
        sessionId: snapshot.activeSessionId,
        model: model.id,
        provider: model.provider,
        contextWindow: model.contextWindow,
      });
      if (mounted.current && request === previewRequest.current && selectedRef.current === model.selection) {
        setPreview(result);
      }
    } catch (caught) {
      if (mounted.current && request === previewRequest.current && selectedRef.current === model.selection) {
        setPreviewError(caught instanceof Error ? caught.message : 'Could not preview context');
      }
    } finally {
      if (mounted.current && request === previewRequest.current && selectedRef.current === model.selection) {
        setPreviewing(false);
      }
    }
  };

  const previewUsed = preview?.used ?? (selected === fallback ? snapshot.context.used : 0);
  const previewLimit =
    preview?.contextWindow ?? (selected === fallback ? snapshot.context.limit : selectedEntry?.contextWindow ?? 0);
  const previewBreakdown =
    preview?.breakdown ?? (selected === fallback ? snapshot.context.breakdown : undefined);

  if (!snapshot.activeSessionId || missingAgent) {
    const needsChat = !snapshot.activeSessionId;
    const destination = needsChat ? '/chats' : '/agents';
    const actionLabel = needsChat ? 'Open chats' : 'Open agents';
    return (
      <MobileSurface title="Model" showBack={false} closeButton>
        <View style={styles.unavailable}>
          <Text style={styles.unavailableTitle}>{needsChat ? 'Choose a chat' : 'Agent unavailable'}</Text>
          <Text style={styles.unavailableBody}>
            {needsChat
              ? 'Select or create a chat before choosing its model.'
              : 'This agent is no longer available on the selected machine. Open an active agent to choose its model.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={() => router.navigate(destination)}
            style={({ pressed }) => [styles.unavailableAction, pressed && styles.pressed]}
          >
            <Text style={styles.unavailableActionText}>{actionLabel}</Text>
          </Pressable>
        </View>
      </MobileSurface>
    );
  }

  return (
    <MobileSurface title="Model" showBack={false} closeButton>
      <View style={styles.topContent}>
        <View style={styles.searchWrap}>
          <Search size={17} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search models"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Search models"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clearButton}>
              <X size={15} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {selectedEntry ? (
          <View style={styles.contextPreview}>
            <MobileContextRing
              used={previewUsed}
              limit={previewLimit}
              breakdown={previewBreakdown}
              size={36}
            />
            <View style={styles.contextPreviewCopy}>
              <Text style={styles.contextPreviewLabel}>Context</Text>
              <Text style={styles.contextPreviewValue}>
                {previewing
                  ? 'Checking window…'
                  : previewLimit > 0
                    ? `${formatTokens(previewUsed)} of ${formatTokens(previewLimit)}`
                    : 'Window unavailable'}
              </Text>
              {previewError ? <Text numberOfLines={1} style={styles.previewError}>{previewError}</Text> : null}
            </View>
          </View>
        ) : null}

        {selectedEntry?.reasoningLevels.length ? (
          <View style={styles.reasoning}>
            <Text style={styles.label}>Reasoning</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reasoningRow}>
              {selectedEntry.reasoningLevels.map((level) => {
                const active = level === reasoningLevel;
                return (
                  <Pressable
                    key={level}
                    accessibilityRole="button"
                    accessibilityLabel={`Reasoning level ${level}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => setModelChoice(choiceKey, { reasoningLevel: level })}
                    style={({ pressed }) => [styles.reasoningChip, active && styles.reasoningChipActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.reasoningText, active && styles.reasoningTextActive]}>{level}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {fastModeSupported ? (
          <View style={styles.processing}>
            <Text style={styles.label}>Processing</Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={`${fastModeLabel} processing`}
              accessibilityState={{ checked: fastMode }}
              onPress={() =>
                setModelChoice(choiceKey, { fastMode: !fastMode })
              }
              style={({ pressed }) => [
                styles.fastModeButton,
                fastMode && styles.fastModeButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Zap
                size={15}
                color={fastMode ? colors.accent : colors.textMuted}
                fill={fastMode ? colors.accent : 'none'}
              />
              <Text style={[styles.fastModeText, fastMode && styles.fastModeTextActive]}>
                {fastModeLabel}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {providers.map(([provider, models]) => (
          <View key={provider} style={styles.group}>
            <Text style={styles.label}>{provider}</Text>
            {models.map((model) => {
              const active = model.selection === selected;
              return (
                <Pressable
                  key={model.selection}
                  accessibilityRole="button"
                  accessibilityLabel={`Select model ${model.name}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => void chooseModel(model)}
                  style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.pressed]}
                >
                  <View style={styles.rowCopy}>
                    <Text numberOfLines={1} style={[styles.name, active && styles.nameActive]}>{model.name}</Text>
                  </View>
                  {active ? <Check size={18} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        {!modelCount ? <Text style={styles.empty}>No models</Text> : null}
      </ScrollView>
    </MobileSurface>
  );
}

const styles = StyleSheet.create({
  unavailable: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  unavailableTitle: {
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  unavailableBody: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    textAlign: 'center',
  },
  unavailableAction: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableActionText: {
    color: colors.accent,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  topContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  searchWrap: {
    minHeight: 44,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    borderRadius: 18,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface3,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sm,
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasoning: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  processing: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  contextPreview: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contextPreviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  contextPreviewLabel: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  contextPreviewValue: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.xs,
    fontVariant: ['tabular-nums'],
  },
  previewError: {
    marginTop: 2,
    color: colors.error,
    fontSize: 10,
  },
  reasoningRow: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  reasoningChip: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: 17,
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  reasoningChipActive: {
    backgroundColor: colors.accentSoft,
  },
  reasoningText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    textTransform: 'capitalize',
  },
  reasoningTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  fastModeButton: {
    minHeight: 44,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface2,
  },
  fastModeButtonActive: {
    backgroundColor: colors.accentSoft,
  },
  fastModeText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  fastModeTextActive: {
    color: colors.accent,
  },
  list: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.huge,
    gap: spacing.lg,
  },
  group: {
    gap: 3,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  row: {
    minHeight: 58,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowActive: {
    backgroundColor: colors.surface2,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  nameActive: {
    color: colors.textPrimary,
  },
  empty: {
    paddingVertical: spacing.xl,
    color: colors.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.68,
  },
});
