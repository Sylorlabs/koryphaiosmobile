import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

// Native screen mocks must not leak into the other render tests.
if (process.env.KORYPHAIOS_ACTIVITY_TEST_CHILD !== '1') {
  test('Activity screen: empty state and process-control integrity', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_ACTIVITY_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Activity tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 30_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const alerts: { title: string; message: string; buttons: { text: string; onPress?: () => void }[] }[] = [];
  const routeVisits: string[] = [];
  mock.module('expo-router', () => ({ router: { push: (path: string) => routeVisits.push(path) } }));
  mock.module('react-native', () => ({
    Alert: { alert: (title: string, message: string, buttons: any[]) => alerts.push({ title, message, buttons }) },
    Appearance: { getColorScheme: () => 'dark' },
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  }));
  mock.module('lucide-react-native', () => Object.fromEntries([
    'CheckCircle2', 'CircleAlert', 'CircleDot', 'CircleStop', 'LoaderCircle', 'Play',
    'RefreshCw', 'RotateCcw', 'SendHorizontal', 'Terminal', 'Trash2', 'X',
  ].map((name) => [name, `Icon${name}`])));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
    AgentGlyph: 'AgentGlyph', Eyebrow: 'Eyebrow', StatusDot: 'StatusDot',
  }));
  const { ProcessInputDraftStore } = await import('../src/control/processInputDrafts');

  test('legacy hot-reload activity state restores drafts and flags unfinished commands', () => {
    const oldState = {
      generation: 2,
      drafts: { '["desk","proc"]': { text: 'important unsent input', revision: 3 } },
      pendingInputs: ['["desk","proc"]'],
      pendingControls: ['["desk","proc"]'],
      pendingStarts: ['desk'],
      pendingCleanups: ['desk'],
    };
    const legacyStore = new ProcessInputDraftStore();
    // Reproduce the shape held by a provider created before launcher support.
    const staleStore = Object.create(legacyStore) as InstanceType<typeof ProcessInputDraftStore>;
    staleStore.snapshot = () => oldState as ReturnType<typeof legacyStore.snapshot>;
    expect(ProcessInputDraftStore.hasCurrentActivityShape(staleStore)).toBe(false);
    const restored = ProcessInputDraftStore.recoverLegacySnapshot(oldState);
    expect(ProcessInputDraftStore.hasCurrentActivityShape(restored)).toBe(true);
    expect(restored.snapshot().drafts['["desk","proc"]'].text).toBe('important unsent input');
    expect(restored.snapshot().launcher.command).toBe('');
    expect(restored.snapshot().generation).toBe(3);
    expect(restored.snapshot().pendingInputs).toHaveLength(0);
    expect(restored.snapshot().pendingControls).toHaveLength(0);
    expect(restored.snapshot().inputFeedback['["desk","proc"]'].message).toContain('Check the host');
    expect(restored.snapshot().controlFeedback['["desk","proc"]'].message).toContain('Check the host');
    expect(restored.snapshot().pendingStarts).toHaveLength(0);
    expect(restored.snapshot().startFeedback.desk.message).toContain('Check the host');
    expect(restored.snapshot().cleanupFeedback.desk.message).toContain('Check the host');
  });

  type PendingCommand = {
    name: string;
    payload: Record<string, unknown>;
    resolve: (value: { accepted: boolean; data?: unknown }) => void;
    reject: (reason: Error) => void;
  };
  type PendingInspect = {
    processId: string;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  };
  const pendingCommands: PendingCommand[] = [];
  const pendingInspections: PendingInspect[] = [];
  const activityItem = (id: string, status: string = 'running') => ({
    id, processId: id, title: `Process ${id}`, detail: 'Running', createdAt: 'now',
    status, commandReplayable: true,
  });
  const buildSnapshot = (host = 'host-a', activity: any[] = [], activeSessionId = 'chat-a') => ({
    machine: { id: host, name: host === 'host-a' ? 'Desk A' : 'Desk B', status: 'online' },
    activeSessionId, agents: [], activity,
  });

  let control: any;
  let tree: TestRenderer.ReactTestRenderer | null = null;
  let refreshCalls = 0;
  const makeControl = (snapshot: any) => ({
    snapshot,
    live: { connection: 'connected' },
    refreshing: false,
    refresh: async () => { refreshCalls += 1; },
    processInputDrafts: new ProcessInputDraftStore(),
    setSelectedAgentId: () => {},
    sendCommand: (name: string, payload: Record<string, unknown>) =>
      new Promise<{ accepted: boolean; data?: unknown }>((resolve, reject) => {
        pendingCommands.push({ name, payload, resolve, reject });
      }),
    inspect: (_name: string, payload: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        pendingInspections.push({ processId: String(payload.processId), resolve, reject });
      }),
  });
  control = makeControl(buildSnapshot());
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  const { ActivityView } = await import('../src/components/ActivityView');

  const flush = async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); };
  const mount = async (snapshot: any = buildSnapshot()) => {
    pendingCommands.length = 0;
    pendingInspections.length = 0;
    alerts.length = 0;
    refreshCalls = 0;
    routeVisits.length = 0;
    control = makeControl(snapshot);
    await act(async () => { tree = TestRenderer.create(<ActivityView />); await flush(); });
  };
  const unmount = async () => { await act(async () => { tree?.unmount(); }); tree = null; };
  const remount = async () => {
    await unmount();
    await act(async () => { tree = TestRenderer.create(<ActivityView />); await flush(); });
  };
  const updateSnapshot = async (snapshot: any) => {
    control = { ...control, snapshot };
    await act(async () => { tree!.update(<ActivityView />); await flush(); });
  };
  const updateControl = async (patch: Record<string, unknown>) => {
    control = { ...control, ...patch };
    await act(async () => { tree!.update(<ActivityView />); await flush(); });
  };
  const pressable = (label: string) => tree!.root.findAllByType('Pressable' as any)
    .find((node) => node.props.accessibilityLabel === label);
  const action = (label: string) => tree!.root.findAllByType('ActionButton' as any)
    .find((node) => node.props.label === label);
  const tap = async (label: string) => {
    const target = action(label) ?? pressable(label);
    expect(target).toBeDefined();
    await act(async () => { target!.props.onPress(); await flush(); });
  };
  const input = (placeholder: string) => tree!.root.findAllByType('TextInput' as any)
    .find((node) => node.props.placeholder === placeholder);
  const setInput = async (placeholder: string, value: string) => {
    expect(input(placeholder)).toBeDefined();
    await act(async () => { input(placeholder)!.props.onChangeText(value); });
  };
  const textOnScreen = () => tree!.root.findAllByType('Text' as any)
    .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string'))
    .join(' ');
  const inspection = (id: string, stdout: string) => ({
    processId: id, logs: { stdout, stderr: '' }, events: [],
  });

  test('empty and disconnected activity have actionable explanation', async () => {
    await mount();
    expect(textOnScreen()).toContain('No process activity yet');
    expect(textOnScreen()).toContain('Use Run command');
    expect(tree!.root.findAllByType('Eyebrow' as any).some((node) => node.props.children === 'Selected machine')).toBe(true);
    expect(textOnScreen()).toContain('Desk A');
    expect(textOnScreen()).toContain('Host online · live connected');
    await updateSnapshot({ ...buildSnapshot(), machine: { id: 'host-a', name: 'Desk A', status: 'offline' } });
    expect(textOnScreen()).toContain('Connect to your desktop');
    expect(textOnScreen()).toContain('Host offline');
    expect(textOnScreen()).toContain('Reconnect to this machine');
    expect(action('Clean up')?.props.disabled).toBe(true);
    await tap('Check host');
    expect(refreshCalls).toBe(1);
    await unmount();
  });

  test('online Activity without a selected chat explains the command prerequisite and opens Chats', async () => {
    await mount(buildSnapshot('host-a', [], ''));
    expect(textOnScreen()).toContain('Choose a chat before running a command');
    expect(action('Open chats')).toBeDefined();
    await tap('Run command');
    await setInput('Command', 'echo should-not-run');
    expect(pressable('Run command')?.props.disabled).toBe(true);
    await tap('Choose chat');
    expect(routeVisits).toEqual(['/chats']);
    expect(input('Command')?.props.value).toBe('echo should-not-run');
    expect(pendingCommands).toHaveLength(0);
    await unmount();
  });

  test('offline host disables process mutations even through stale submit handlers', async () => {
    await mount({ ...buildSnapshot('host-a', [activityItem('one')]), machine: { ...buildSnapshot().machine, status: 'offline' } });
    expect(action('Stop')?.props.disabled).toBe(true);
    await tap('Run command');
    await setInput('Command', 'echo pending');
    expect(pressable('Run command')?.props.disabled).toBe(true);
    await act(async () => {
      input('Command')?.props.onSubmitEditing();
      action('Stop')?.props.onPress();
      await flush();
    });
    expect(pendingCommands).toHaveLength(0);
    expect(textOnScreen()).toContain('Your draft will stay here');
    await unmount();
  });

  test('reports live-channel interruption without disabling reachable host commands', async () => {
    await mount();
    await updateControl({ live: { connection: 'error' } });
    expect(textOnScreen()).toContain('Host online · live updates unavailable');
    expect(textOnScreen()).toContain('Check the host before repeating any command');
    await tap('Run command');
    await setInput('Command', 'echo check');
    expect(pressable('Run command')?.props.disabled).toBe(false);
    await tap('Run command');
    expect(pendingCommands).toHaveLength(1);
    await act(async () => { pendingCommands[0].resolve({ accepted: true }); await flush(); });
    await unmount();
  });

  test('cleanup needs confirmation, handles refusal, and cannot target a switched host', async () => {
    await mount();
    await tap('Clean up');
    expect(alerts.at(-1)?.message).toContain('older than 7 days on Desk A');
    expect(pendingCommands).toHaveLength(0);
    alerts.at(-1)?.buttons[0].onPress?.();
    expect(pendingCommands).toHaveLength(0);
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    expect(pendingCommands).toHaveLength(1);
    expect(pendingCommands[0].name).toBe('process.cleanup');
    await act(async () => { pendingCommands[0].reject(new Error('Network failed')); await flush(); });
    expect(textOnScreen()).toContain('Check the host before retrying');
    await tap('Clean up');
    await updateSnapshot(buildSnapshot('host-b'));
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    expect(pendingCommands).toHaveLength(1);
    await unmount();
  });

  test('a command waits for host acknowledgment, resists double submit and keeps rejected draft', async () => {
    await mount();
    await tap('Run command');
    await setInput('Command', 'echo sample');
    await tap('Run command');
    await tap('Run command');
    expect(pendingCommands).toHaveLength(1);
    expect(input('Command')?.props.value).toBe('echo sample');
    await act(async () => { pendingCommands[0].reject(new Error('Timeout')); await flush(); });
    expect(input('Command')?.props.value).toBe('echo sample');
    expect(textOnScreen()).toContain('Check the host before running it again');
    await tap('Run command');
    expect(pendingCommands).toHaveLength(2);
    await act(async () => { pendingCommands[1].resolve({ accepted: true }); await flush(); });
    expect(input('Command')).toBeUndefined();
    await unmount();
  });

  test('durable save failure blocks remote execution and retains a recovery action', async () => {
    await mount();
    let shouldFail = true;
    const storage = {
      durable: true,
      load: async () => null,
      save: async () => { if (shouldFail) throw new Error('device storage full'); },
    };
    const drafts = new ProcessInputDraftStore(storage);
    await drafts.whenReady();
    await updateControl({ processInputDrafts: drafts });
    await tap('Run command');
    await setInput('Command', 'echo must-not-run-without-save');
    await tap('Run command');
    expect(pendingCommands).toHaveLength(0);
    expect(input('Command')?.props.value).toBe('echo must-not-run-without-save');
    expect(textOnScreen()).toContain('device storage full');
    expect(textOnScreen()).toContain('Command was not sent');
    expect(action('Retry save')).toBeDefined();
    shouldFail = false;
    await tap('Retry save');
    await tap('Run command');
    expect(pendingCommands).toHaveLength(1);
    await act(async () => { pendingCommands[0].resolve({ accepted: true }); await flush(); });
    await unmount();
  });

  test('damaged stored drafts keep process controls locked and offer retry recovery', async () => {
    await mount();
    let stored: string | null = '{"version":999}';
    const storage = { durable: true, load: async () => stored, save: async (value: string) => { stored = value; } };
    const drafts = new ProcessInputDraftStore(storage);
    await drafts.whenReady();
    await updateControl({ processInputDrafts: drafts });
    expect(textOnScreen()).toContain('Saved Activity drafts could not be restored');
    expect(action('Clean up')?.props.disabled).toBe(true);
    await tap('Run command');
    expect(input('Command')?.props.editable).toBe(false);
    expect(action('Retry recovery')).toBeDefined();
    stored = null;
    await tap('Retry recovery');
    await act(async () => { await drafts.whenReady(); await flush(); });
    expect(action('Clean up')?.props.disabled).toBe(false);
    await unmount();
  });

  test('a drafted command cannot silently run on a different desktop', async () => {
    await mount();
    await tap('Run command');
    await setInput('Command', 'private-on-desk-a');
    await updateSnapshot(buildSnapshot('host-b'));
    expect(pressable('Run command')?.props.disabled).toBe(true);
    expect(textOnScreen()).toContain('drafted on another machine');
    await tap('Use on this machine');
    expect(pressable('Run command')?.props.disabled).toBe(false);
    await unmount();
  });

  test('late console responses cannot override a newer process, closed console or new host', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one'), activityItem('two')]));
    const consoles = () => tree!.root.findAllByType('ActionButton' as any)
      .filter((node) => node.props.label === 'Console' || node.props.label === 'Close console');
    await act(async () => { consoles()[0].props.onPress(); await flush(); });
    expect(pendingInspections[0].processId).toBe('one');
    await act(async () => { consoles()[1].props.onPress(); await flush(); });
    expect(pendingInspections[1].processId).toBe('two');
    await act(async () => { pendingInspections[1].resolve(inspection('two', 'new output')); await flush(); });
    await act(async () => { pendingInspections[0].resolve(inspection('one', 'stale output')); await flush(); });
    expect(textOnScreen()).toContain('new output');
    expect(textOnScreen()).not.toContain('stale output');
    await tap('Close console');
    await act(async () => { consoles()[0].props.onPress(); await flush(); });
    await tap('Close console');
    await act(async () => { pendingInspections[2].resolve(inspection('one', 'late data')); await flush(); });
    expect(textOnScreen()).not.toContain('late data');
    await act(async () => { consoles()[0].props.onPress(); await flush(); });
    await updateSnapshot(buildSnapshot('host-b', [activityItem('one'), activityItem('two')]));
    await act(async () => { pendingInspections.at(-1)?.resolve(inspection('one', 'old host logs')); await flush(); });
    expect(textOnScreen()).not.toContain('old host logs');
    await unmount();
  });

  test('switching A to B to A never reopens a console from an earlier visit', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one')]));
    await tap('Console');
    await act(async () => { pendingInspections[0].resolve(inspection('one', 'A only old console')); await flush(); });
    expect(textOnScreen()).toContain('A only old console');

    await updateSnapshot(buildSnapshot('host-b', [activityItem('one')]));
    expect(action('Console')).toBeDefined();
    expect(textOnScreen()).not.toContain('A only old console');
    await updateSnapshot(buildSnapshot('host-a', [activityItem('one')]));
    expect(action('Console')).toBeDefined();
    expect(action('Close console')).toBeUndefined();
    expect(textOnScreen()).not.toContain('A only old console');

    await tap('Console');
    expect(pendingInspections).toHaveLength(2);
    await act(async () => { pendingInspections[1].resolve(inspection('one', 'fresh A inspection')); await flush(); });
    expect(textOnScreen()).toContain('fresh A inspection');
    expect(textOnScreen()).not.toContain('A only old console');
    await unmount();
  });

  test('stdin remains on failure and clears only after the host accepted it', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one')]));
    await tap('Console');
    await act(async () => { pendingInspections[0].resolve(inspection('one', 'prompt>')); await flush(); });
    await setInput('Send input', 'answer');
    await tap('Send process input');
    await tap('Send process input');
    expect(pendingCommands).toHaveLength(1);
    expect(input('Send input')?.props.value).toBe('answer');
    expect(pendingCommands[0].payload.input).toBe('answer\n');
    await act(async () => { pendingCommands[0].reject(new Error('Lost network')); await flush(); });
    expect(input('Send input')?.props.value).toBe('answer');
    expect(textOnScreen()).toContain('Check the host before sending again');
    await remount();
    await tap('Console');
    expect(textOnScreen()).toContain('Lost network');
    await tap('Send process input');
    await act(async () => { pendingCommands[1].resolve({ accepted: true }); await flush(); });
    expect(input('Send input')?.props.value).toBe('');
    expect(pendingInspections).toHaveLength(3);
    await act(async () => { pendingInspections[2].resolve(inspection('one', 'answered')); await flush(); });
    await unmount();
  });

  test('stdin drafts stay with their host and process through console changes', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one'), activityItem('two')]));
    await tap('Console');
    await setInput('Send input', 'draft for A/one');
    await tap('Console');
    await setInput('Send input', 'draft for A/two');
    await tap('Console');
    expect(input('Send input')?.props.value).toBe('draft for A/one');
    await tap('Close console');
    await tap('Console');
    expect(input('Send input')?.props.value).toBe('draft for A/one');
    await updateSnapshot(buildSnapshot('host-b', [activityItem('one')]));
    await tap('Console');
    expect(input('Send input')?.props.value).toBe('');
    await setInput('Send input', 'draft for B/one');
    await updateSnapshot(buildSnapshot('host-a', [activityItem('one'), activityItem('two')]));
    await tap('Console');
    expect(input('Send input')?.props.value).toBe('draft for A/one');
    await tap('Console');
    expect(input('Send input')?.props.value).toBe('draft for A/two');
    await updateSnapshot(buildSnapshot('host-b', [activityItem('one')]));
    await tap('Console');
    expect(input('Send input')?.props.value).toBe('draft for B/one');
    await unmount();
  });

  test('stdin drafts survive navigating away from Activity and returning', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one')]));
    await tap('Console');
    await setInput('Send input', 'draft before navigation');
    await remount();
    await tap('Console');
    expect(input('Send input')?.props.value).toBe('draft before navigation');
    await unmount();
  });

  test('an input acknowledgement after Activity remount updates the visible original draft', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one')]));
    await tap('Console');
    await setInput('Send input', 'submitted before navigation');
    await tap('Send process input');
    await remount();
    await tap('Console');
    expect(input('Send input')?.props.value).toBe('submitted before navigation');
    expect(pressable('Send process input')?.props.disabled).toBe(true);
    await tap('Send process input');
    expect(pendingCommands).toHaveLength(1);
    await act(async () => { pendingCommands[0].resolve({ accepted: true }); await flush(); });
    expect(input('Send input')?.props.value).toBe('');
    expect(textOnScreen()).toContain('Input accepted by the host');
    await remount();
    await tap('Console');
    expect(textOnScreen()).toContain('Input accepted by the host');
    await unmount();
  });

  test('late stdin results preserve an edited draft and cannot touch another host', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one')]));
    await tap('Console');
    await setInput('Send input', 'old answer');
    await tap('Send process input');
    await setInput('Send input', 'new answer while awaiting');
    await act(async () => { pendingCommands[0].resolve({ accepted: true }); await flush(); });
    expect(input('Send input')?.props.value).toBe('new answer while awaiting');
    await act(async () => { pendingInspections.at(-1)?.resolve(inspection('one', 'acknowledged')); await flush(); });

    await tap('Send process input');
    await updateSnapshot(buildSnapshot('host-b', [activityItem('one')]));
    await tap('Console');
    await setInput('Send input', 'B pending text');
    await act(async () => { pendingCommands[1].reject(new Error('Uncertain input')); await flush(); });
    expect(input('Send input')?.props.value).toBe('B pending text');
    expect(textOnScreen()).not.toContain('Uncertain input');
    await updateSnapshot(buildSnapshot('host-a', [activityItem('one')]));
    await tap('Console');
    expect(input('Send input')?.props.value).toBe('new answer while awaiting');
    expect(textOnScreen()).toContain('Check the host before sending again');
    await unmount();
  });

  test('stop and restart are host-scoped, acknowledge failures, and block duplicate actions', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one'), activityItem('two', 'success')]));
    await tap('Stop');
    await tap('Stop');
    expect(pendingCommands).toHaveLength(1);
    expect(pendingCommands[0].payload).toEqual({ processId: 'one', action: 'stop' });
    await act(async () => { pendingCommands[0].reject(new Error('No reply')); await flush(); });
    expect(textOnScreen()).toContain('Check the host before retrying');

    await tap('Restart');
    expect(alerts.at(-1)?.message).toContain('repeat actions');
    expect(pendingCommands).toHaveLength(1);
    await updateSnapshot(buildSnapshot('host-b', [activityItem('one'), activityItem('two', 'success')]));
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    expect(pendingCommands).toHaveLength(1);

    await updateSnapshot(buildSnapshot('host-a', [activityItem('one'), activityItem('two', 'success')]));
    await tap('Restart');
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    expect(pendingCommands).toHaveLength(2);
    expect(pendingCommands[1].payload).toEqual({ processId: 'two', action: 'restart' });
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    expect(pendingCommands).toHaveLength(2);
    await act(async () => { pendingCommands[1].resolve({ accepted: true }); await flush(); });
    expect(textOnScreen()).toContain('Restart request accepted by the host');
    expect(textOnScreen()).toContain('Check process status before repeating it');
    await unmount();
  });

  test('pending Stop stays locked after leaving and reopening Activity', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one')]));
    await tap('Stop');
    await remount();
    expect(action('Stop')?.props.loading).toBe(true);
    await tap('Stop');
    expect(pendingCommands).toHaveLength(1);
    await act(async () => { pendingCommands[0].resolve({ accepted: true }); await flush(); });
    expect(action('Stop')?.props.loading).toBe(false);
    expect(textOnScreen()).toContain('Stop request accepted by the host');
    await remount();
    expect(textOnScreen()).toContain('Stop request accepted by the host');
    await unmount();
  });

  test('previous pairing input acknowledgment cannot clear the next pairing draft or lock', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one')]));
    await tap('Console');
    await setInput('Send input', 'same input');
    await tap('Send process input');
    expect(pendingCommands).toHaveLength(1);

    // A reconnect to the very same host and process can create an identical
    // draft revision; its lifecycle must still be independent.
    await act(async () => { control.processInputDrafts.clear(); await flush(); });
    expect(input('Send input')).toBeUndefined();
    await tap('Console');
    await setInput('Send input', 'same input');
    await tap('Send process input');
    expect(pendingCommands).toHaveLength(2);
    await act(async () => { pendingCommands[0].resolve({ accepted: true }); await flush(); });
    expect(input('Send input')?.props.value).toBe('same input');
    expect(pressable('Send process input')?.props.disabled).toBe(true);
    expect(textOnScreen()).not.toContain('Input accepted by the host');

    await act(async () => { pendingCommands[1].reject(new Error('New pairing failed')); await flush(); });
    expect(input('Send input')?.props.value).toBe('same input');
    expect(pressable('Send process input')?.props.disabled).toBe(false);
    expect(textOnScreen()).toContain('New pairing failed');
    await unmount();
  });

  test('previous pairing Stop result and Restart confirmation cannot affect a new pairing', async () => {
    await mount(buildSnapshot('host-a', [activityItem('one'), activityItem('two', 'success')]));
    await tap('Stop');
    await tap('Restart');
    expect(alerts.at(-1)?.message).toContain('Restart on Desk A');
    const oldRestartConfirm = alerts.at(-1)?.buttons[1].onPress;

    await act(async () => { control.processInputDrafts.clear(); await flush(); });
    await act(async () => { oldRestartConfirm?.(); await flush(); });
    expect(pendingCommands).toHaveLength(1);
    await tap('Stop');
    expect(pendingCommands).toHaveLength(2);
    await act(async () => { pendingCommands[0].reject(new Error('Old pairing failed')); await flush(); });
    expect(action('Stop')?.props.loading).toBe(true);
    expect(textOnScreen()).not.toContain('Old pairing failed');
    await act(async () => { pendingCommands[1].resolve({ accepted: true }); await flush(); });
    expect(action('Stop')?.props.loading).toBe(false);
    expect(textOnScreen()).toContain('Stop request accepted by the host');
    await unmount();
  });

  test('start requires host acceptance and old pairing acknowledgment cannot clear a new draft', async () => {
    await mount();
    await tap('Run command');
    await setInput('Command', 'echo important');
    await tap('Run command');
    await act(async () => { pendingCommands[0].resolve({ accepted: false }); await flush(); });
    expect(input('Command')?.props.value).toBe('echo important');
    expect(textOnScreen()).toContain('Host did not accept this command');

    await tap('Run command');
    await act(async () => { control.processInputDrafts.clear(); await flush(); });
    // A fresh pairing resets locally expanded panels and stale console state.
    // The new command must be explicitly opened on this pairing.
    expect(input('Command')).toBeUndefined();
    await tap('Run command');
    await setInput('Command', 'echo important');
    await tap('Run command');
    expect(pendingCommands).toHaveLength(3);
    await act(async () => { pendingCommands[1].resolve({ accepted: true }); await flush(); });
    expect(input('Command')?.props.value).toBe('echo important');
    expect(pressable('Run command')?.props.disabled).toBe(true);
    await act(async () => { pendingCommands[2].reject(new Error('New pairing failed')); await flush(); });
    expect(input('Command')?.props.value).toBe('echo important');
    expect(textOnScreen()).toContain('New pairing failed');
    await unmount();
  });

  test('cleanup needs acceptance and a stale confirmation cannot target a re-paired host', async () => {
    await mount();
    await tap('Clean up');
    const oldConfirm = alerts.at(-1)?.buttons[1].onPress;
    await act(async () => { control.processInputDrafts.clear(); await flush(); });
    await act(async () => { oldConfirm?.(); await flush(); });
    expect(pendingCommands).toHaveLength(0);

    await tap('Clean up');
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    await act(async () => { pendingCommands[0].resolve({ accepted: false }); await flush(); });
    expect(textOnScreen()).toContain('Host did not accept cleanup');
    expect(textOnScreen()).not.toContain('No old process records to remove');

    await tap('Clean up');
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    await act(async () => { control.processInputDrafts.clear(); await flush(); });
    await act(async () => { pendingCommands[1].resolve({ accepted: true, data: { deleted: 3 } }); await flush(); });
    expect(textOnScreen()).not.toContain('Removed 3 old process records');
    await unmount();
  });

  test('run command draft and pending operation survive Activity remount without a duplicate launch', async () => {
    await mount();
    await tap('Run command');
    await setInput('Process name (optional)', 'Important task');
    await setInput('Command', 'echo important');
    await tap('Run command');
    await remount();
    await tap('Run command');
    expect(input('Command')?.props.value).toBe('echo important');
    expect(input('Process name (optional)')?.props.value).toBe('Important task');
    expect(pressable('Run command')?.props.disabled).toBe(true);
    await tap('Run command');
    expect(pendingCommands).toHaveLength(1);
    await act(async () => { pendingCommands[0].reject(new Error('No host response')); await flush(); });
    expect(input('Command')?.props.value).toBe('echo important');
    expect(textOnScreen()).toContain('Check the host before running it again');
    await unmount();
  });

  test('cleanup remains locked and reports the result after Activity remount', async () => {
    await mount();
    await tap('Clean up');
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    await remount();
    expect(action('Clean up')?.props.loading).toBe(true);
    await tap('Clean up');
    expect(pendingCommands).toHaveLength(1);
    await act(async () => { pendingCommands[0].resolve({ accepted: true, data: { deleted: 2 } }); await flush(); });
    expect(action('Clean up')?.props.loading).toBe(false);
    expect(textOnScreen()).toContain('Removed 2 old process records');
    await unmount();
  });

  test('successful command acknowledgment after remount clears submitted draft and shows acceptance', async () => {
    await mount();
    await tap('Run command');
    await setInput('Command', 'echo only once');
    await tap('Run command');
    await remount();
    await tap('Run command');
    expect(input('Command')?.props.value).toBe('echo only once');
    await act(async () => { pendingCommands[0].resolve({ accepted: true }); await flush(); });
    expect(input('Command')?.props.value).toBe('');
    expect(textOnScreen()).toContain('Command accepted by the host');
    expect(pendingCommands).toHaveLength(1);
    await unmount();
  });
}
