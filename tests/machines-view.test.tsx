import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

// Module mocks must be isolated from the other native-component integration tests.
if (process.env.KORYPHAIOS_MACHINES_TEST_CHILD !== '1') {
  test('machines screen: device safety and network refresh integration', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_MACHINES_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Machines tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const alerts: { title: string; buttons: { text: string; onPress?: () => void }[] }[] = [];
  mock.module('react-native', () => ({
    Alert: { alert: (title: string, _message: string, buttons: any[]) => alerts.push({ title, buttons }) },
    Appearance: { getColorScheme: () => 'dark' },
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: (styles: unknown) => styles },
  }));
  mock.module('expo-router', () => ({
    router: { push: () => {}, replace: () => {}, setParams: () => {} },
    useLocalSearchParams: () => ({}),
  }));
  mock.module('lucide-react-native', () => Object.fromEntries([
    'Check', 'ChevronDown', 'ChevronRight', 'Link2', 'Monitor', 'RefreshCw', 'Smartphone', 'Unplug', 'X',
  ].map((name) => [name, `Icon${name}`])));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
    StatusDot: 'StatusDot',
  }));
  mock.module('../src/components/LinkedDesktopPanel', () => ({ LinkedDesktopPanel: () => null }));

  let network: any = { connected: true, local: { name: 'Desk One' }, peers: [], requests: [] };
  let inspectOverride: (() => Promise<any>) | null = null;
  let applyRenameOnHost = false;
  let failStopInvite = false;
  let pendingAction: { promise: Promise<any>; resolve: (value: any) => void } | null = null;
  let unlinkCalls = 0;
  let disconnectCalls = 0;
  let refreshCalls = 0;
  const commands: string[] = [];
  const commandPayloads: { name: string; payload?: Record<string, unknown> }[] = [];
  let rejectedCommand = '';
  let control: any;
  const newControl = () => ({
    snapshot: { machine: { id: 'machine-1', name: 'Desk One', status: 'online', platform: 'macOS' } },
    pairing: { baseUrl: 'http://desk-one.test:3001', machineId: 'machine-1', machineName: 'Desk One' },
    live: { connection: 'connected' },
    loading: false, error: null,
    pair: async () => {},
    disconnect: async () => { disconnectCalls++; },
    refresh: async () => { refreshCalls++; },
    refreshing: false,
    inspect: async () => inspectOverride ? inspectOverride() : network,
    sendCommand: async (name: string, payload?: Record<string, unknown>) => {
      commands.push(name);
      commandPayloads.push({ name, payload });
      if (name === rejectedCommand) return { accepted: false };
      if (name === 'device.stop_invite' && failStopInvite) throw new Error('Host did not confirm cancellation');
      if (name === 'device.unlink') unlinkCalls++;
      if (name === 'device.rename' && applyRenameOnHost) {
        network = { ...network, local: { ...network.local, name: payload?.name } };
      }
      if (name === 'device.rename' && pendingAction) return pendingAction.promise;
      if (name === 'device.invite' && pendingAction) return pendingAction.promise;
      if (name === 'device.invite') {
        return { accepted: true, data: { code: '12345678901234567890', expiresAt: Date.now() + 60_000 } };
      }
      return { accepted: true };
    },
  });
  control = newControl();
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));

  const { MachinesView } = await import('../src/components/MachinesView');
  let tree: TestRenderer.ReactTestRenderer;
  const findAction = (label: string) => tree.root.findAllByType('ActionButton' as any)
    .find((node) => node.props.label === label);
  const findPressable = (label: string) => tree.root.findAllByType('Pressable' as any)
    .find((node) => node.props.accessibilityLabel === label);
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const waitLoad = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 6)); await flush(); }); };
  const tap = async (label: string) => {
    const target = findAction(label) ?? findPressable(label);
    expect(target).toBeDefined();
    await act(async () => { target!.props.onPress(); await flush(); });
  };
  const mount = async () => {
    alerts.length = 0;
    rejectedCommand = '';
    inspectOverride = null;
    applyRenameOnHost = false;
    network = { connected: true, local: { name: 'Desk One' }, peers: [], requests: [] };
    control = newControl();
    await act(async () => { tree = TestRenderer.create(<MachinesView />); });
    await tap('Open device network');
    await waitLoad();
  };
  const unmount = async () => { await act(async () => { tree.unmount(); }); };

  test('Machines explains when desktop REST responds but live commands cannot connect', async () => {
    await mount();
    control.live = { connection: 'error' };
    await act(async () => { tree.update(<MachinesView />); });
    const labels = tree.root.findAllByType('Text' as any).flatMap((node) => node.children.filter((value): value is string => typeof value === 'string'));
    expect(labels.join(' ')).toContain('Desktop online · live connection lost');
    expect(tree.root.findAllByType('StatusDot' as any).some((node) => node.props.status === 'offline')).toBe(true);
    await unmount();
  });

  test('editing the desktop name survives a network refresh and saves only on acknowledgement', async () => {
    await mount();
    const input = tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name');
    expect(input?.props.value).toBe('Desk One');
    await act(async () => { input!.props.onChangeText('Desk Rename'); });
    network = { ...network, local: { name: 'Different value from poll' } };
    await tap('Create pairing code');
    expect(tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name')?.props.value).toBe('Desk Rename');
    await tap('Save');
    expect(commands.at(-1)).toBe('device.rename');
    await unmount();
  });

  test('a rejected invite cancellation keeps the active code visible', async () => {
    await mount();
    await tap('Create pairing code');
    expect(findAction('Cancel code')).toBeDefined();
    failStopInvite = true;
    await tap('Cancel code');
    expect(findAction('Cancel code')).toBeDefined();
    failStopInvite = false;
    await tap('Cancel code');
    expect(findAction('Create pairing code')).toBeDefined();
    await unmount();
  });

  test('disconnect and peer unlink wait for explicit user confirmation', async () => {
    await mount();
    await tap('Disconnect');
    expect(disconnectCalls).toBe(0);
    expect(alerts.at(-1)?.title).toContain('Desk One');
    alerts.at(-1)?.buttons[0].onPress?.();
    expect(disconnectCalls).toBe(0);
    await tap('Disconnect');
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    expect(disconnectCalls).toBe(1);
    network = { ...network, peers: [{
      id: 'peer-2', name: 'Second Desktop', os: 'macOS', kind: 'desktop',
      online: true, agentRouting: false, allowAgents: false,
    }] };
    await tap('Create pairing code');
    await tap('Unlink Second Desktop');
    expect(unlinkCalls).toBe(0);
    await act(async () => { alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    expect(unlinkCalls).toBe(1);
    await unmount();
  });

  test('peer permission switches have 44-point targets and identify the specific desktop', async () => {
    await mount();
    network = { ...network, peers: [{
      id: 'peer-2', name: 'Second Desktop', os: 'macOS', kind: 'desktop',
      online: true, agentRouting: false, allowAgents: true,
    }] };
    await tap('Create pairing code');
    const grant = findPressable('Let host agents use Second Desktop');
    const accept = findPressable('Accept agents from Second Desktop');
    expect(grant?.props.accessibilityRole).toBe('switch');
    expect(grant?.props.accessibilityState).toEqual({ checked: false, disabled: false });
    expect(accept?.props.accessibilityState).toEqual({ checked: true, disabled: false });
    const styles = grant!.props.style({ pressed: false });
    expect(styles[0].width).toBeGreaterThanOrEqual(44);
    expect(styles[0].height).toBeGreaterThanOrEqual(44);
    await tap('Let host agents use Second Desktop');
    expect(commandPayloads.at(-1)).toEqual({
      name: 'device.grants', payload: { deviceId: 'peer-2', allowAgents: true, agentRouting: true },
    });
    await unmount();
  });

  test('a rejected device action never reports success or discards the rename draft', async () => {
    await mount();
    rejectedCommand = 'device.rename';
    const input = tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name');
    await act(async () => { input!.props.onChangeText('Unsaved name'); });
    await tap('Save');
    expect(commands.at(-1)).toBe('device.rename');
    const rendered = tree.root.findAllByType('Text' as any)
      .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string')).join(' ');
    expect(rendered).toContain('The desktop did not confirm this device action');
    expect(tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name')?.props.value).toBe('Unsaved name');
    expect(network.local?.name).toBe('Desk One');
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();
    const afterRefresh = tree.root.findAllByType('Text' as any)
      .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string')).join(' ');
    expect(afterRefresh).toContain('The desktop did not confirm this device action');
    rejectedCommand = '';
    await tap('Create pairing code');
    const afterNewAction = tree.root.findAllByType('Text' as any)
      .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string')).join(' ');
    expect(afterNewAction).not.toContain('The desktop did not confirm this device action');
    await unmount();
  });

  test('an old background inspection cannot overwrite newer post-action device state', async () => {
    await mount();
    const oldNetwork = { ...network, local: { name: 'Desk One' } };
    let finishOldInspection!: (value: any) => void;
    const delayed = new Promise<any>((resolve) => { finishOldInspection = resolve; });
    let readCount = 0;
    inspectOverride = () => ++readCount === 1 ? delayed : Promise.resolve(network);
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();

    network = { ...network, local: { name: 'Renamed on desktop' } };
    await tap('Create pairing code');
    const input = () => tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name')?.props.value;
    expect(input()).toBe('Renamed on desktop');

    finishOldInspection(oldNetwork);
    await act(async () => { await flush(); });
    expect(input()).toBe('Renamed on desktop');
    await unmount();
  });

  test('accepted action with failed device inspection remains explicitly unverified', async () => {
    await mount();
    inspectOverride = async () => { throw new Error('Device inspection unavailable'); };
    await tap('Create pairing code');
    expect(findAction('Cancel code')).toBeDefined();
    const rendered = () => tree.root.findAllByType('Text' as any)
      .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string')).join(' ');
    expect(rendered()).toContain('accepted');
    expect(rendered()).toContain('could not verify');
    expect(rendered()).toContain('Device inspection unavailable');
    await unmount();
  });

  test('accepted rename retains a draft until the desktop reports that exact name', async () => {
    await mount();
    const input = () => tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name');
    await act(async () => { input()!.props.onChangeText('New name'); });
    await tap('Save');
    const rendered = () => tree.root.findAllByType('Text' as any)
      .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string')).join(' ');
    expect(rendered()).toContain('accepted');
    expect(rendered()).toContain('could not verify');
    expect(input()?.props.value).toBe('New name');
    network = { ...network, local: { name: 'Old desktop poll' } };
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();
    expect(input()?.props.value).toBe('New name');
    await unmount();
  });

  test('verified rename clears the pending draft and adopts later desktop changes', async () => {
    await mount();
    applyRenameOnHost = true;
    const input = () => tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name');
    await act(async () => { input()!.props.onChangeText('Confirmed name'); });
    await tap('Save');
    expect(input()?.props.value).toBe('Confirmed name');
    network = { ...network, local: { name: 'Renamed again on host' } };
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();
    expect(input()?.props.value).toBe('Renamed again on host');
    await unmount();
  });

  test('a later authoritative read resolves an accepted but initially unverified rename', async () => {
    await mount();
    const input = () => tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name');
    const text = () => tree.root.findAllByType('Text' as any)
      .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string')).join(' ');
    await act(async () => { input()!.props.onChangeText('Eventually confirmed'); });
    await tap('Save');
    expect(text()).toContain('could not verify');
    network = { ...network, local: { name: 'Eventually confirmed' } };
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();
    expect(text()).not.toContain('could not verify');
    network = { ...network, local: { name: 'Host changed it again' } };
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();
    expect(input()?.props.value).toBe('Host changed it again');
    await unmount();
  });

  test('late rename verification does not clear a newer unsaved draft', async () => {
    await mount();
    const input = () => tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name');
    await act(async () => { input()!.props.onChangeText('Original request'); });
    await tap('Save');
    await act(async () => { input()!.props.onChangeText('Newer unsaved draft'); });
    network = { ...network, local: { name: 'Original request' } };
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();
    expect(input()?.props.value).toBe('Newer unsaved draft');
    network = { ...network, local: { name: 'An external change' } };
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();
    expect(input()?.props.value).toBe('Newer unsaved draft');
    await unmount();
  });

  test('a successful delayed rename acknowledgement preserves a newer local name edit', async () => {
    await mount();
    const input = () => tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop name');
    await act(async () => { input()!.props.onChangeText('Sent rename'); });
    let resolveRename!: (value: any) => void;
    pendingAction = {
      promise: new Promise((resolve) => { resolveRename = resolve; }),
      resolve: (value) => resolveRename(value),
    };
    await tap('Save');
    expect(commands.at(-1)).toBe('device.rename');

    // A queued text-change event can arrive after submission and before the host reply.
    await act(async () => { input()!.props.onChangeText('Newer unsaved name'); });
    network = { ...network, local: { name: 'Sent rename' } };
    await act(async () => { pendingAction!.resolve({ accepted: true }); await flush(); });

    expect(input()?.props.value).toBe('Newer unsaved name');
    network = { ...network, local: { name: 'External desktop edit' } };
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();
    expect(input()?.props.value).toBe('Newer unsaved name');
    await unmount();
    pendingAction = null;
  });

  test('an acknowledged permission change waits for the desktop to show actual grant values', async () => {
    await mount();
    network = { ...network, peers: [{
      id: 'peer-2', name: 'Second Desktop', os: 'macOS', kind: 'desktop',
      online: true, agentRouting: false, allowAgents: false,
    }] };
    await tap('Create pairing code');
    const text = () => tree.root.findAllByType('Text' as any)
      .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string')).join(' ');
    await tap('Let host agents use Second Desktop');
    expect(text()).toContain('could not verify');
    expect(findPressable('Let host agents use Second Desktop')?.props.accessibilityState.checked).toBe(false);
    const sent = commands.filter((name) => name === 'device.grants').length;
    network = { ...network, peers: [{ ...network.peers[0], agentRouting: true }] };
    await tap('Close device network');
    await tap('Open device network');
    await waitLoad();
    expect(text()).not.toContain('could not verify');
    expect(findPressable('Let host agents use Second Desktop')?.props.accessibilityState.checked).toBe(true);
    expect(commands.filter((name) => name === 'device.grants')).toHaveLength(sent);
    await unmount();
  });

  test('offline paired machines offer a direct retry without removing the saved pairing', async () => {
    await mount();
    control = { ...control, snapshot: {
      ...control.snapshot,
      machine: { ...control.snapshot.machine, status: 'offline' },
    } };
    await act(async () => { tree.update(<MachinesView />); });
    expect(findAction('Retry connection')).toBeDefined();
    const previousDisconnects = disconnectCalls;
    await tap('Retry connection');
    expect(refreshCalls).toBeGreaterThan(0);
    expect(disconnectCalls).toBe(previousDisconnects);
    await unmount();
  });

  test('a late command from the former host cannot create a pairing code on the next host', async () => {
    await mount();
    let resolve!: (value: any) => void;
    pendingAction = { promise: new Promise((next) => { resolve = next; }), resolve: (value) => resolve(value) };
    await tap('Create pairing code');
    control = { ...control,
      pairing: { baseUrl: 'http://desk-two.test:3001', machineId: 'machine-2', machineName: 'Desk Two' },
      snapshot: { machine: { id: 'machine-2', name: 'Desk Two', status: 'online', platform: 'macOS' } },
    };
    network = { connected: true, local: { name: 'Desk Two' }, peers: [], requests: [] };
    await act(async () => { tree.update(<MachinesView />); await flush(); });
    pendingAction.resolve({ accepted: true, data: { code: 'old-host-code', expiresAt: Date.now() + 60_000 } });
    await act(async () => { await flush(); });
    expect(findAction('Cancel code')).toBeUndefined();
    await unmount();
    pendingAction = null;
  });

  test('manual pairing validates an address locally and clears stale feedback as it is corrected', async () => {
    const attempts: string[] = [];
    control = {
      ...newControl(),
      pairing: null,
      snapshot: { machine: { id: 'unpaired', status: 'offline', name: '' } },
      error: 'Could not reach the previously entered desktop',
      pair: async (address: string) => { attempts.push(address); throw new Error('Host unreachable'); },
    };
    await act(async () => { tree = TestRenderer.create(<MachinesView />); });
    const labels = () => tree.root.findAllByType('Text' as any)
      .flatMap((node) => node.children.filter((child): child is string => typeof child === 'string')).join(' ');
    const input = () => tree.root.findAllByType('TextInput' as any)
      .find((node) => node.props.accessibilityLabel === 'Desktop address');

    expect(labels()).toContain('LAN or Tailscale');
    expect(labels()).not.toContain('previously entered desktop');
    await tap('Pair device');
    expect(labels()).toContain('Enter the Koryphaios desktop address');
    await act(async () => { input()!.props.onChangeText('https://desktop.local:3001/api'); });
    expect(labels()).not.toContain('Enter the Koryphaios desktop address');
    await tap('Pair device');
    expect(labels()).toContain('no path or credentials');
    expect(attempts).toEqual([]);
    await act(async () => { input()!.props.onChangeText('desktop.local:3001'); });
    expect(labels()).not.toContain('no path or credentials');
    await tap('Pair device');
    expect(attempts).toEqual(['desktop.local:3001']);
    await act(async () => { input()!.props.onChangeText('desktop-2.local:3001'); });
    expect(labels()).not.toContain('previously entered desktop');
    await unmount();
  });
}
