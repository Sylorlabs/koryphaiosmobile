import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  CheckCircle2,
  CircleAlert,
  CircleDot,
  CircleStop,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  SendHorizontal,
  Terminal,
  Trash2,
  X,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { processInputDraftKey as processKey } from '../control/processInputDrafts';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type { ProcessInspection } from '../types/control';
import { ActionButton, AgentGlyph, Eyebrow, StatusDot } from './ui';

export function ActivityView() {
  const { processInputDrafts } = useControl();
  const generation = useSyncExternalStore(processInputDrafts.subscribe, processInputDrafts.snapshot).generation;
  // Explicit disconnect/re-pair invalidates local console selections. Keep the
  // same body across machine switches so pending Alert callbacks still consult
  // the machine ref updated by its effect before sending any command.
  return <ActivityBody key={generation} />;
}

function ActivityBody() {
  const { snapshot, live, refreshing, refresh, processInputDrafts, setSelectedAgentId, sendCommand, inspect } = useControl();
  const machineId = snapshot.machine.id;
  const machineOnline = snapshot.machine.status === 'online' && machineId !== 'unpaired';
  const liveConnected = live.connection === 'connected';
  const machineName = machineId === 'unpaired' ? 'No machine selected' : snapshot.machine.name;
  const connectionLabel = !machineOnline
    ? snapshot.machine.status === 'connecting' ? 'Connecting to host' : 'Host offline'
    : liveConnected ? 'Host online · live connected'
      : live.connection === 'connecting' ? 'Host online · live reconnecting'
        : 'Host online · live updates unavailable';
  // A newly visited machine gets a new console scope, including A -> B -> A.
  // Old selections must not reappear merely because the host ID matches again.
  const consoleScope = useMemo(() => ({ machineId }), [machineId]);
  const currentMachineRef = useRef(machineId);
  const currentConsoleScopeRef = useRef(consoleScope);
  const mounted = useRef(true);
  const inspectionVersion = useRef(0);
  const currentProcessId = useRef('');
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState('');
  const [selectedProcessScope, setSelectedProcessScope] = useState(consoleScope);
  const visibleProcessId = selectedProcessScope === consoleScope ? selectedProcessId : '';
  const [processInspection, setProcessInspection] = useState<ProcessInspection | null>(null);
  const processActivity = useSyncExternalStore(processInputDrafts.subscribe, processInputDrafts.snapshot);
  const draftsReady = processInputDrafts.isReady();
  const recoveryError = processInputDrafts.getRecoveryError();
  const saveError = processInputDrafts.getPersistenceError();
  const processDrafts = processActivity.drafts;
  const { command, name: processName, owner: commandOwner } = processActivity.launcher;
  const commandBusy = processActivity.pendingStarts.includes(machineId);
  const commandFeedback = processActivity.startFeedback[machineId];
  const cleanupBusy = processActivity.pendingCleanups.includes(machineId);
  const cleanupResult = processActivity.cleanupFeedback[machineId]?.message ?? '';
  const inputFeedback = processActivity.inputFeedback;
  const [processError, setProcessError] = useState('');
  const [loadingProcessId, setLoadingProcessId] = useState('');
  const controlFeedback = processActivity.controlFeedback;

  useEffect(() => {
    // A reply for the previous machine must never populate the new machine's console.
    currentMachineRef.current = machineId;
    currentConsoleScopeRef.current = consoleScope;
    inspectionVersion.current += 1;
    currentProcessId.current = '';
  }, [machineId, consoleScope]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; inspectionVersion.current += 1; };
  }, []);

  const loadProcess = async (processId: string) => {
    const host = machineId;
    const version = ++inspectionVersion.current;
    currentProcessId.current = processId;
    setSelectedProcessScope(consoleScope);
    setSelectedProcessId(processId);
    setLoadingProcessId(processId);
    setProcessError('');
    setProcessInspection((previous) => selectedProcessScope === consoleScope && previous?.processId === processId ? previous : null);
    const isCurrent = () =>
      version === inspectionVersion.current && currentMachineRef.current === host && currentProcessId.current === processId;
    try {
      const result = await inspect<ProcessInspection>('process.inspect', { processId });
      if (isCurrent() && result.processId === processId) setProcessInspection(result);
    } catch (caught) {
      if (isCurrent()) setProcessError(caught instanceof Error ? caught.message : 'Could not load process console');
    } finally {
      if (isCurrent()) setLoadingProcessId('');
    }
  };

  const toggleProcess = (processId: string) => {
    if (visibleProcessId === processId) {
      inspectionVersion.current += 1;
      currentProcessId.current = '';
      setSelectedProcessId('');
      setProcessInspection(null);
      setProcessError('');
      setLoadingProcessId('');
      return;
    }
    void loadProcess(processId);
  };

  const sendProcessInput = async (processId: string) => {
    const host = machineId;
    const owner = consoleScope;
    const key = processKey(host, processId);
    if (!machineOnline) return;
    if (currentProcessId.current !== processId || selectedProcessScope !== consoleScope || currentMachineRef.current !== host) return;
    const draft = processDrafts[key];
    const input = draft?.text;
    if (!input) return;
    const generation = processInputDrafts.beginInput(key);
    if (generation === null) return;
    setProcessError('');
    let dispatched = false;
    try {
      // Persist the pending marker and unsent text before touching the desktop.
      await processInputDrafts.flush();
      if (!processInputDrafts.isCurrent(generation) || currentConsoleScopeRef.current !== owner) return;
      const currentDraft = processInputDrafts.snapshot().drafts[key];
      if (!currentDraft || currentDraft.revision !== draft.revision || currentDraft.text !== input) return;
      dispatched = true;
      const result = await sendCommand('process.control', {
        processId,
        action: 'input',
        input: input.endsWith('\n') ? input : `${input}\n`,
      });
      if (!result.accepted) throw new Error('Host did not accept the input');
      if (!processInputDrafts.isCurrent(generation)) return;
      processInputDrafts.confirm(key, draft, generation);
      processInputDrafts.reportInput(key, generation, {
        error: false, message: 'Input accepted by the host. Check console output to confirm it was processed.',
      });
      if (mounted.current && currentMachineRef.current === host && currentProcessId.current === processId) {
        await loadProcess(processId);
      }
    } catch (caught) {
      if (processInputDrafts.isCurrent(generation)) {
        processInputDrafts.reportInput(key, generation, {
          error: true,
          message: dispatched
            ? `${caught instanceof Error ? caught.message : 'Input not confirmed'}. Check the host before sending again.`
            : `${caught instanceof Error ? caught.message : 'Could not save input'}. Input was not sent. Retry after saving.`,
        });
      }
    } finally {
      processInputDrafts.finishInput(key, generation);
    }
  };

  const controlProcess = async (host: string, processId: string, action: 'stop' | 'restart') => {
    if (!machineOnline || !processId || host !== machineId || currentMachineRef.current !== host) return;
    const owner = consoleScope;
    const key = processKey(host, processId);
    const generation = processInputDrafts.beginControl(key);
    if (generation === null) return;
    let dispatched = false;
    try {
      await processInputDrafts.flush();
      if (!processInputDrafts.isCurrent(generation) || currentConsoleScopeRef.current !== owner) return;
      dispatched = true;
      const result = await sendCommand('process.control', { processId, action });
      if (!result.accepted) throw new Error('Host did not accept this request');
      if (!processInputDrafts.isCurrent(generation)) return;
      processInputDrafts.reportControl(key, generation, {
        error: false,
        message: `${action === 'stop' ? 'Stop' : 'Restart'} request accepted by the host. Check process status before repeating it.`,
      });
    } catch (caught) {
      if (processInputDrafts.isCurrent(generation)) {
        processInputDrafts.reportControl(key, generation, {
          error: true,
          message: dispatched
            ? `${caught instanceof Error ? caught.message : 'Process control not confirmed'}. Check the host before retrying.`
            : `${caught instanceof Error ? caught.message : 'Could not save process request'}. Request was not sent.`,
        });
      }
    } finally {
      processInputDrafts.finishControl(key, generation);
    }
  };

  const confirmRestart = (host: string, processId: string) => {
    const generation = processInputDrafts.getGeneration();
    Alert.alert(
      'Restart this process?',
      `Restart on ${snapshot.machine.name}? This may repeat actions the process already performed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restart', onPress: () => {
          if (processInputDrafts.isCurrent(generation)) void controlProcess(host, processId, 'restart');
        } },
      ],
    );
  };

  const startProcess = async () => {
    const draft = processInputDrafts.snapshot().launcher;
    if (!machineOnline || !snapshot.activeSessionId || draft.owner !== machineId || currentMachineRef.current !== machineId) return;
    const commandText = draft.command.trim();
    if (!commandText) return;
    const host = machineId;
    const owner = consoleScope;
    const generation = processInputDrafts.beginStart(host);
    if (generation === null) return;
    let dispatched = false;
    try {
      await processInputDrafts.flush();
      if (!processInputDrafts.isCurrent(generation) || currentConsoleScopeRef.current !== owner) return;
      if (processInputDrafts.snapshot().launcher.revision !== draft.revision) return;
      dispatched = true;
      const result = await sendCommand('process.start', { command: commandText, name: draft.name.trim() || 'Mobile command' });
      if (!result.accepted) throw new Error('Host did not accept this command');
      const cleared = processInputDrafts.confirmLauncherStart(draft, generation);
      processInputDrafts.reportStart(host, generation, {
        error: false, message: 'Command accepted by the host. Check Activity for the new process.',
      });
      if (cleared && mounted.current && currentMachineRef.current === host) setLauncherOpen(false);
    } catch (caught) {
      processInputDrafts.reportStart(host, generation, {
        error: true,
        message: dispatched
          ? `${caught instanceof Error ? caught.message : 'Command not confirmed'}. Check the host before running it again.`
          : `${caught instanceof Error ? caught.message : 'Could not save command'}. Command was not sent.`,
      });
    } finally {
      processInputDrafts.finishStart(host, generation);
    }
  };

  const cleanupProcesses = async () => {
    if (!machineOnline || currentMachineRef.current !== machineId) {
      return;
    }
    const host = machineId;
    const owner = consoleScope;
    const generation = processInputDrafts.beginCleanup(host);
    if (generation === null) return;
    let dispatched = false;
    try {
      await processInputDrafts.flush();
      if (!processInputDrafts.isCurrent(generation) || currentConsoleScopeRef.current !== owner) return;
      dispatched = true;
      const result = await sendCommand('process.cleanup', { daysToKeep: 7 });
      if (!result.accepted) throw new Error('Host did not accept cleanup');
      const deleted = Number((result.data as { deleted?: number } | undefined)?.deleted ?? 0);
      processInputDrafts.reportCleanup(host, generation, {
        error: false,
        message: deleted ? `Removed ${deleted} old process records` : 'No old process records to remove',
      });
    } catch (caught) {
      processInputDrafts.reportCleanup(host, generation, {
        error: true,
        message: dispatched
          ? `${caught instanceof Error ? caught.message : 'Cleanup not confirmed'}. Check the host before retrying.`
          : `${caught instanceof Error ? caught.message : 'Could not save cleanup request'}. Request was not sent.`,
      });
    } finally {
      processInputDrafts.finishCleanup(host, generation);
    }
  };

  const confirmCleanup = () => {
    const generation = processInputDrafts.getGeneration();
    Alert.alert(
      'Clean up old process records?',
      `Remove process history older than 7 days on ${snapshot.machine.name}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clean up', style: 'destructive', onPress: () => {
          if (processInputDrafts.isCurrent(generation)) void cleanupProcesses();
        } },
      ],
    );
  };

  const foreignCommand = Boolean(command.trim()) && commandOwner !== machineId;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {!draftsReady || saveError ? (
        <View style={styles.connectionHelp}>
          <Text style={styles.connectionHelpText}>
            {recoveryError
              ? `Saved Activity drafts could not be restored: ${recoveryError}. Existing data has been preserved.`
              : !draftsReady
                ? 'Restoring saved Activity drafts. Commands will be available when recovery finishes.'
                : `Activity changes are not yet saved: ${saveError}. Remote commands require a successful save.`}
          </Text>
          {recoveryError ? <ActionButton label="Retry recovery" onPress={() => processInputDrafts.retryLoad()} /> : null}
          {saveError ? <ActionButton label="Retry save" onPress={() => void processInputDrafts.flush().catch(() => {})} /> : null}
        </View>
      ) : null}
      <View style={styles.intro}>
        <View style={styles.machineDetails}>
          <Eyebrow>Selected machine</Eyebrow>
          <Text numberOfLines={1} style={styles.machineName}>{machineName}</Text>
          <View style={styles.machineHealth}>
            <StatusDot status={machineOnline ? liveConnected ? 'online' : 'connecting' : snapshot.machine.status} size={7} />
            <Text style={styles.machineStatus}>{connectionLabel}</Text>
          </View>
        </View>
        <View style={styles.introActions}>
          <ActionButton
            label="Clean up"
            icon={Trash2}
            danger
            loading={cleanupBusy}
            disabled={!machineOnline || !draftsReady}
            onPress={confirmCleanup}
          />
          <ActionButton
            label={launcherOpen ? 'Close' : 'Run command'}
            icon={launcherOpen ? X : Terminal}
            onPress={() => setLauncherOpen((open) => !open)}
          />
        </View>
      </View>
      {!machineOnline || !liveConnected ? (
        <View style={styles.connectionHelp}>
          <Text style={styles.connectionHelpText}>
            {machineOnline
              ? 'Live updates are interrupted. Check the host before repeating any command.'
              : 'Reconnect to this machine from Machines before using process controls.'}
          </Text>
          <ActionButton label="Check host" icon={RefreshCw} loading={refreshing} onPress={() => void refresh()} />
        </View>
      ) : null}
      {cleanupResult ? <Text style={styles.cleanupResult}>{cleanupResult}</Text> : null}
      {commandFeedback && !launcherOpen ? (
        <Text style={commandFeedback.error ? styles.consoleError : styles.consoleNotice}>{commandFeedback.message}</Text>
      ) : null}

      {launcherOpen ? (
        <View style={styles.launcher}>
          <View style={styles.launcherHeader}>
            <Text style={styles.launcherTitle}>Command</Text>
            <Terminal size={19} color={colors.accent} />
          </View>
          <TextInput
            accessibilityLabel="Process name (optional)"
            value={processName}
            onChangeText={(value) => processInputDrafts.editLauncherName(value)}
            placeholder="Process name (optional)"
            placeholderTextColor={colors.textMuted}
            editable={draftsReady && !commandBusy}
            style={styles.nameInput}
          />
          <View style={styles.commandRow}>
            <TextInput
              accessibilityLabel="Command"
              value={command}
              onChangeText={(value) => processInputDrafts.editLauncherCommand(machineId, value)}
              placeholder="Command"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={draftsReady && !commandBusy}
              style={styles.commandInput}
              onSubmitEditing={() => void startProcess()}
            />
            <Pressable
              accessibilityLabel="Run command"
              accessibilityRole="button"
              disabled={!draftsReady || !machineOnline || !command.trim() || !snapshot.activeSessionId || commandBusy || foreignCommand}
              onPress={() => void startProcess()}
              style={({ pressed }) => [
                styles.runButton,
                (!machineOnline || !command.trim() || !snapshot.activeSessionId || commandBusy || foreignCommand) && styles.runButtonDisabled,
                pressed && !commandBusy && !foreignCommand && command.trim() ? styles.pressed : null,
              ]}
            >
              <Play size={17} color={colors.onAccent} fill={colors.onAccent} />
            </Pressable>
          </View>
          {!snapshot.activeSessionId ? (
            <View style={styles.draftWarning}>
              <Text style={styles.launcherNote}>Choose a chat before running this command. Your draft will be kept while you navigate.</Text>
              {machineOnline ? <ActionButton label="Choose chat" onPress={() => router.push('/chats')} /> : null}
            </View>
          ) : null}
          {!machineOnline ? (
            <Text style={styles.launcherNote}>Reconnect to the machine before running this command. Your draft will stay here.</Text>
          ) : null}
          {foreignCommand ? (
            <View style={styles.draftWarning}>
              <Text style={styles.launcherNote}>This command was drafted on another machine. Return to that machine, or explicitly move the draft here.</Text>
              <ActionButton
                label="Use on this machine"
                disabled={!draftsReady || processActivity.pendingStarts.length > 0}
                onPress={() => processInputDrafts.moveLauncher(machineId)}
              />
            </View>
          ) : null}
          {commandFeedback ? (
            <Text style={commandFeedback.error ? styles.consoleError : styles.consoleNotice}>{commandFeedback.message}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.timeline}>
        {snapshot.activity.length === 0 ? (
          <View style={styles.emptyState}>
            <Terminal size={30} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>{snapshot.machine.status === 'online' ? 'No process activity yet' : 'No process activity available'}</Text>
            <Text style={styles.emptyDescription}>
              {snapshot.machine.status === 'online'
                ? snapshot.activeSessionId
                  ? 'Commands and background processes on this desktop will appear here. Use Run command to start one.'
                  : 'Commands and background processes on this desktop will appear here. Choose a chat before running a command.'
                : 'Connect to your desktop to view process history and controls.'}
            </Text>
            {machineOnline && !snapshot.activeSessionId ? (
              <ActionButton primary label="Open chats" onPress={() => router.push('/chats')} />
            ) : null}
          </View>
        ) : null}
        {snapshot.activity.map((item) => {
          const key = item.processId ? processKey(machineId, item.processId) : '';
          const inputDraft = processDrafts[key]?.text ?? '';
          const sendingInput = processActivity.pendingInputs.includes(key);
          const agent = item.agentId ? snapshot.agents.find((candidate) => candidate.id === item.agentId) : undefined;
          const Icon =
            item.status === 'success'
              ? CheckCircle2
              : item.status === 'error' || item.status === 'warning'
                ? CircleAlert
                : item.status === 'running'
                  ? LoaderCircle
                  : CircleDot;
          const iconColor =
            item.status === 'success'
              ? colors.success
              : item.status === 'error'
                ? colors.error
                : item.status === 'warning'
                  ? colors.warning
                  : item.status === 'running'
                    ? colors.accent
                    : colors.textMuted;
          const consoleOpen = Boolean(item.processId && visibleProcessId === item.processId);
          const visibleInspection = selectedProcessScope === consoleScope && processInspection?.processId === item.processId ? processInspection : null;
          return (
            <View
              key={item.id}
              style={styles.item}
            >
              <View style={styles.markerColumn}>
                <View style={styles.marker}><Icon size={17} color={iconColor} strokeWidth={2} /></View>
                <View style={styles.stem} />
              </View>
              <View style={styles.itemBody}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.time}>{item.createdAt}</Text>
                </View>
                <Text style={styles.itemDetail}>{item.detail}</Text>
                {item.processId ? (
                  <View style={styles.processActions}>
                    {item.status === 'running' ? (
                      <ActionButton
                        label="Stop"
                        icon={CircleStop}
                        danger
                        disabled={!machineOnline}
                        loading={processActivity.pendingControls.includes(key)}
                        onPress={() => item.processId && void controlProcess(machineId, item.processId, 'stop')}
                      />
                    ) : null}
                    {item.status !== 'running' && item.commandReplayable ? (
                      <ActionButton
                        label="Restart"
                        icon={RotateCcw}
                        disabled={!machineOnline}
                        loading={processActivity.pendingControls.includes(key)}
                        onPress={() => item.processId && confirmRestart(machineId, item.processId)}
                      />
                    ) : null}
                    <ActionButton
                      label={consoleOpen ? 'Close console' : 'Console'}
                      icon={Terminal}
                      loading={consoleOpen && loadingProcessId === item.processId}
                      onPress={() => item.processId && toggleProcess(item.processId)}
                    />
                  </View>
                ) : null}
                {controlFeedback[key] ? (
                  <Text style={controlFeedback[key].error ? styles.consoleError : styles.consoleNotice}>
                    {controlFeedback[key].message}
                  </Text>
                ) : null}
                {consoleOpen ? (
                  <View style={styles.console}>
                    <View style={styles.consoleHeader}>
                      <View style={styles.consoleHeaderCopy}>
                        <Eyebrow>Console</Eyebrow>
                        <Text numberOfLines={1} style={styles.consoleTitle}>{item.title}</Text>
                      </View>
                      <Pressable
                        accessibilityLabel="Refresh process console"
                        accessibilityRole="button"
                        disabled={loadingProcessId === item.processId}
                        onPress={() => item.processId && void loadProcess(item.processId)}
                        style={({ pressed }) => [styles.consoleRefresh, pressed && styles.pressed]}
                      >
                        <RefreshCw size={15} color={colors.textMuted} />
                      </Pressable>
                    </View>
                    {processError ? <Text style={styles.consoleError}>{processError}</Text> : null}
                    {inputFeedback[key] ? (
                      <Text style={inputFeedback[key].error ? styles.consoleError : styles.consoleNotice}>{inputFeedback[key].message}</Text>
                    ) : null}
                    {visibleInspection ? (
                      <>
                        <ScrollView
                          horizontal
                          nestedScrollEnabled
                          style={styles.consoleOutputScroll}
                          contentContainerStyle={styles.consoleOutputContent}
                        >
                          <Text selectable style={styles.consoleOutput}>
                            {[
                              visibleInspection.logs.stdout,
                              visibleInspection.logs.stderr
                                ? `\n[stderr]\n${visibleInspection.logs.stderr}`
                                : '',
                            ].join('').trim() || 'No output yet.'}
                          </Text>
                        </ScrollView>
                        {visibleInspection.events.length ? (
                          <View style={styles.eventList}>
                            {visibleInspection.events.slice(-4).map((event) => (
                              <View key={String(event.id)} style={styles.eventRow}>
                                <CircleDot size={11} color={colors.textMuted} />
                                <Text style={styles.eventText}>{event.eventType}</Text>
                                <Text style={styles.eventTime}>
                                  {new Date(event.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                    {item.status === 'running' ? (
                      <View style={styles.stdinRow}>
                        <TextInput
                          accessibilityLabel="Send input to process"
                          value={inputDraft}
                          onChangeText={(value) => processInputDrafts.edit(key, value)}
                          editable={draftsReady}
                          placeholder="Send input"
                          placeholderTextColor={colors.textMuted}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={styles.stdinInput}
                          onSubmitEditing={() => item.processId && void sendProcessInput(item.processId)}
                        />
                        <Pressable
                          accessibilityLabel="Send process input"
                          accessibilityRole="button"
                          disabled={!draftsReady || !machineOnline || !inputDraft || sendingInput}
                          onPress={() => item.processId && void sendProcessInput(item.processId)}
                          style={({ pressed }) => [
                            styles.stdinSend,
                            (!machineOnline || !inputDraft || sendingInput) && styles.runButtonDisabled,
                            pressed && inputDraft && !sendingInput ? styles.pressed : null,
                          ]}
                        >
                          <SendHorizontal size={15} color={colors.onAccent} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {agent ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View ${agent.name}`}
                    onPress={() => setSelectedAgentId(agent.id)}
                    style={({ pressed }) => [styles.agentLine, pressed && styles.pressed]}
                  >
                    <AgentGlyph agent={agent} size={24} />
                    <Text style={styles.agentName}>{agent.name}</Text>
                    <Text numberOfLines={1} style={styles.agentModel}>{agent.model}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1 },
  content: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
  },
  intro: {
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  machineDetails: { flex: 1, minWidth: 200, gap: spacing.xxs },
  machineName: { color: colors.textPrimary, fontSize: typography.base, fontWeight: '700' },
  machineHealth: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  machineStatus: { color: colors.textSecondary, fontSize: typography.xs, flexShrink: 1 },
  introActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginLeft: 'auto' },
  connectionHelp: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
  },
  connectionHelpText: { flex: 1, minWidth: 180, color: colors.textSecondary, fontSize: typography.xs, lineHeight: 18 },
  cleanupResult: {
    marginTop: -spacing.xxs,
    paddingBottom: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.xs,
    textAlign: 'right',
  },
  emptyState: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.huge,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDescription: {
    maxWidth: 300,
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
  launcherNote: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    lineHeight: 18,
  },
  draftWarning: { gap: spacing.xs },
  launcher: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  launcherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.xs,
  },
  launcherTitle: {
    marginTop: 3,
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
  },
  nameInput: {
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    fontSize: typography.sm,
    paddingHorizontal: spacing.sm,
  },
  commandRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  commandInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontFamily: 'monospace',
    paddingHorizontal: spacing.sm,
  },
  runButton: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runButtonDisabled: { opacity: 0.3 },
  timeline: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    paddingVertical: spacing.xs,
  },
  item: {
    minHeight: 94,
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  markerColumn: {
    width: 34,
    alignItems: 'center',
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stem: {
    flex: 1,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginTop: spacing.xxs,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    paddingLeft: spacing.sm,
    paddingBottom: spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'baseline',
  },
  itemTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
  },
  time: {
    color: colors.textMuted,
    fontSize: 10,
  },
  itemDetail: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 18,
  },
  processActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  console: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface1,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  consoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  consoleHeaderCopy: { flex: 1, minWidth: 0 },
  consoleTitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  consoleRefresh: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consoleError: { color: colors.error, fontSize: typography.xs, lineHeight: 16 },
  consoleNotice: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 16 },
  consoleOutputScroll: {
    maxHeight: 220,
    borderRadius: radii.md,
    backgroundColor: colors.surface0,
  },
  consoleOutputContent: { padding: spacing.sm },
  consoleOutput: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  eventList: { gap: 4 },
  eventRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventText: { flex: 1, color: colors.textMuted, fontSize: 10 },
  eventTime: { color: colors.textMuted, fontSize: 9, fontVariant: ['tabular-nums'] },
  stdinRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stdinInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: typography.xs,
    paddingHorizontal: spacing.sm,
  },
  stdinSend: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentLine: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  agentName: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  agentModel: {
    color: colors.textMuted,
    fontSize: 10,
    flexShrink: 1,
  },
  pressed: { opacity: 0.72 },
});
