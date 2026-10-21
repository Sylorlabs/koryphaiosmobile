import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Play } from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type { NativeCommandInspection } from '../types/control';
import { ActionButton } from './ui';

export function NativeCommandsView() {
  const { snapshot, pairing, live, inspect, sendCommand, modelChoices } = useControl();
  const manager = snapshot.agents.find((agent) => agent.id === 'kory-manager') ?? snapshot.agents[0];
  const activeSession = snapshot.sessions.find((session) => session.id === snapshot.activeSessionId);
  const isolated = activeSession?.gitWorkspace?.isolation === 'independent-repository';
  const modelChoice = modelChoices[snapshot.activeSessionId]?.selection ?? '';
  const selectedModel = snapshot.modelCatalog.find((model) => model.selection === modelChoice);
  const providerCandidates = useMemo(
    () => [...new Set([
      selectedModel?.provider,
      manager?.provider,
      ...snapshot.modelCatalog.map((model) => model.provider),
    ].filter((value): value is string => Boolean(value?.trim())))],
    [manager?.provider, selectedModel?.provider, snapshot.modelCatalog],
  );
  const providerKey = providerCandidates.join('|');
  const [catalogs, setCatalogs] = useState<NativeCommandInspection[]>([]);
  const [provider, setProvider] = useState('');
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [commandError, setCommandError] = useState('');
  // A second tap/keyboard submission can arrive before React commits running.
  const runInFlight = useRef(false);
  // A delayed result belongs to the host/project/chat that submitted it.
  const contextKey = JSON.stringify([
    pairing?.baseUrl ?? null, pairing?.machineId ?? null,
    snapshot.activeProjectId, snapshot.activeSessionId,
  ]);
  const currentContext = useRef(contextKey);
  useLayoutEffect(() => { currentContext.current = contextKey; }, [contextKey]);
  // Comparing the text alone loses an edit-away-and-back draft while a command is pending.
  const commandEditVersion = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void Promise.all(
        providerCandidates.map((candidate) =>
          inspect<NativeCommandInspection>('native_commands.inspect', { provider: candidate }).catch(
            () => ({ provider: candidate, label: null, commands: [] }),
          ),
        ),
      ).then((results) => {
        if (cancelled) return;
        const available = results.filter((result) => result.commands.length > 0);
        setCatalogs(available);
        const preferred = available.find((result) => result.provider === selectedModel?.provider)
          ?? available.find((result) => result.provider === manager?.provider)
          ?? available[0];
        setProvider((current) => available.some((result) => result.provider === current)
          ? current
          : (preferred?.provider ?? ''));
        setLoading(false);
      });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Provider catalog identity is represented by providerKey to avoid reloading on array identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspect, manager?.provider, providerKey, selectedModel?.provider]);

  const catalog = catalogs.find((item) => item.provider === provider);
  const output = live.nativeCommands[snapshot.activeSessionId] ?? [];
  const selectedModelForProvider = snapshot.modelCatalog.find(
    (model) => model.provider === provider && model.selection === modelChoice,
  )?.selection;

  const run = async (value = command) => {
    const next = value.trim();
    if (!next || !snapshot.activeSessionId || runInFlight.current || isolated || loading || !catalog) return;
    const submittedContext = contextKey;
    const submittedEditVersion = commandEditVersion.current;
    runInFlight.current = true;
    setRunning(true);
    setCommandError('');
    try {
      const result = await sendCommand('native_command.run', {
        sessionId: snapshot.activeSessionId,
        command: next,
        ...(selectedModelForProvider ? { model: selectedModelForProvider } : {}),
      });
      if (!result.accepted) throw new Error('Command was not accepted.');
      if (currentContext.current === submittedContext && commandEditVersion.current === submittedEditVersion) {
        setCommand((current) => current.trim() === next ? '' : current);
      }
    } catch {
      if (currentContext.current === submittedContext) {
        setCommandError('Command was not confirmed. Check the desktop before retrying.');
      }
    } finally {
      runInFlight.current = false;
      setRunning(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {catalogs.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.providerRow}>
          {catalogs.map((item) => {
            const active = item.provider === provider;
            return (
              <Pressable
                key={item.provider ?? item.label ?? 'provider'}
                accessibilityRole="button"
                accessibilityLabel={`Select command provider ${item.label ?? item.provider}`}
                accessibilityState={{ selected: active, disabled: running }}
                disabled={running}
                onPress={() => setProvider(item.provider ?? '')}
                style={({ pressed }) => [styles.providerChip, active && styles.providerChipActive, pressed && styles.pressed]}
              >
                <Text style={[styles.providerText, active && styles.providerTextActive]}>
                  {item.label ?? item.provider}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Native command"
          value={command}
          onChangeText={(value) => { commandEditVersion.current += 1; setCommand(value); setCommandError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="/status"
          placeholderTextColor={colors.textMuted}
          returnKeyType="send"
          onSubmitEditing={() => void run()}
          style={styles.input}
        />
        <ActionButton
          label="Run"
          icon={Play}
          primary
          loading={running}
          disabled={!command.trim() || !snapshot.activeSessionId || !catalog || loading || isolated || running}
          onPress={() => void run()}
        />
      </View>

      {commandError ? <Text accessibilityRole="alert" style={styles.commandError}>{commandError}</Text> : null}
      {!snapshot.activeSessionId ? <Text style={styles.muted}>Select a chat before running commands.</Text> : null}

      {isolated ? <Text style={styles.muted}>Native CLI commands are unavailable in this isolated chat.</Text> : null}

      {loading ? <Text style={styles.muted}>Loading commands…</Text> : null}
      {!loading && !catalogs.length ? <Text style={styles.muted}>No native CLI commands available.</Text> : null}

      {catalog ? (
        <View style={styles.commandList}>
          {catalog.commands.map((item) => (
            <Pressable
              key={`${catalog.provider}:${item.command}`}
              accessibilityRole="button"
              accessibilityLabel={`Insert command /${item.command}`}
              onPress={() => {
                commandEditVersion.current += 1;
                setCommand(`/${item.command}${item.argsHint ? ' ' : ''}`);
                setCommandError('');
              }}
              style={({ pressed }) => [styles.commandRow, pressed && styles.pressed]}
            >
              <View style={styles.commandCopy}>
                <Text style={styles.commandName}>/{item.command}</Text>
                <Text numberOfLines={2} style={styles.commandDetail}>{item.description}</Text>
              </View>
              {item.argsHint ? <Text style={styles.args}>{item.argsHint}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {output.length ? (
        <View style={styles.outputList}>
          {output.map((item) => (
            <View key={item.messageId} style={styles.outputCard}>
              <View style={styles.outputHeader}>
                <Text numberOfLines={1} style={styles.outputCommand}>{item.rawCommand}</Text>
                <Text style={[styles.outputProvider, item.isError && styles.outputError]}>{item.providerLabel}</Text>
              </View>
              <Text selectable style={[styles.outputText, item.isError && styles.outputError]}>
                {item.text || (item.complete ? 'Done' : 'Running…')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  providerRow: { gap: spacing.xs },
  providerChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: 17,
    backgroundColor: colors.surface2,
  },
  providerChipActive: { backgroundColor: colors.accentSoft },
  providerText: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700' },
  providerTextActive: { color: colors.accent },
  composer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontFamily: 'monospace',
  },
  commandList: { gap: 3 },
  commandRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
  },
  commandCopy: { flex: 1, minWidth: 0 },
  commandName: { color: colors.textPrimary, fontSize: typography.sm, fontFamily: 'monospace', fontWeight: '700' },
  commandDetail: { marginTop: 3, color: colors.textMuted, fontSize: typography.xs, lineHeight: 16 },
  args: { color: colors.textMuted, fontSize: 10, fontFamily: 'monospace' },
  outputList: { gap: spacing.xs, paddingTop: spacing.xs },
  outputCard: { borderRadius: radii.lg, padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.surface2 },
  outputHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  outputCommand: { flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: typography.xs, fontFamily: 'monospace' },
  outputProvider: { color: colors.accent, fontSize: 10, fontWeight: '700' },
  outputText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, fontFamily: 'monospace' },
  outputError: { color: colors.error },
  commandError: { color: colors.warning, fontSize: typography.sm },
  muted: { color: colors.textMuted, fontSize: typography.sm, paddingVertical: spacing.xs },
  pressed: { opacity: 0.68 },
});
