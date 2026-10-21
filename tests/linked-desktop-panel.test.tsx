import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

// Keep native component mocks isolated from the other screen suites.
if (process.env.KORYPHAIOS_LINKED_PANEL_TEST_CHILD !== '1') {
  test('linked desktop list: distinct actions and unlink confirmation', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_LINKED_PANEL_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Linked desktop tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const alerts: { title: string; buttons: { text: string; onPress?: () => void }[] }[] = [];
  const selected: string[] = [];
  const unlinked: string[] = [];
  const navigation: string[] = [];
  const links = [
    { relayUrl: 'https://relay.example.test', peer: { id: 'desk-one', name: 'Desk One', os: 'macOS', online: true } },
    { relayUrl: 'https://relay.example.test', peer: { id: 'desk-two', name: 'Desk Two', os: 'macOS', online: false } },
  ];
  let selectHost = async (hostId: string) => { selected.push(hostId); };
  let unlink = async (hostId: string) => { unlinked.push(hostId); };

  mock.module('react-native', () => ({
    Alert: { alert: (title: string, _message: string, buttons: any[]) => alerts.push({ title, buttons }) },
    Appearance: { getColorScheme: () => 'dark' },
    Pressable: 'Pressable', StyleSheet: { create: (styles: unknown) => styles }, Text: 'Text', View: 'View',
  }));
  mock.module('expo-router', () => ({ router: { replace: (path: string) => navigation.push(path) } }));
  mock.module('lucide-react-native', () => ({ Monitor: 'Monitor', Unplug: 'Unplug' }));
  mock.module('../src/control/LinkedDeviceProvider', () => ({ useLinkedDevices: () => ({
    links, activeHostId: 'desk-one', ready: true,
    selectHost: (hostId: string) => selectHost(hostId), unlink: (hostId: string) => unlink(hostId),
  }) }));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
    StatusDot: 'StatusDot',
  }));

  const { LinkedDesktopPanel } = await import('../src/components/LinkedDesktopPanel');
  let tree: TestRenderer.ReactTestRenderer;
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const findOpen = (name: string) => tree.root.findAllByType('Pressable' as any)
    .find((node) => node.props.accessibilityLabel?.startsWith(`Open ${name},`));
  const findUnlink = (name: string) => tree.root.findAllByType('ActionButton' as any)
    .find((node) => node.props.accessibilityLabel === `Unlink ${name}`);
  const mount = async () => {
    alerts.length = 0; selected.length = 0; unlinked.length = 0; navigation.length = 0;
    selectHost = async (hostId: string) => { selected.push(hostId); };
    unlink = async (hostId: string) => { unlinked.push(hostId); };
    await act(async () => { tree = TestRenderer.create(<LinkedDesktopPanel />); });
  };
  const unmount = async () => { await act(async () => { tree.unmount(); }); };

  test('Unlink is a separate accessible target and asks before changing the link', async () => {
    await mount();
    const row = findOpen('Desk One');
    expect(row).toBeDefined();
    expect(row!.props.accessibilityState.selected).toBe(true);
    expect(row!.findAllByType('ActionButton' as any)).toHaveLength(0);
    const remove = findUnlink('Desk One');
    expect(remove).toBeDefined();
    expect(remove!.parent?.parent?.type).toBe('View');
    await act(async () => { remove!.props.onPress(); });
    expect(alerts.at(-1)?.title).toBe('Unlink Desk One?');
    expect(unlinked).toEqual([]);
    expect(selected).toEqual([]);
    expect(navigation).toEqual([]);
    await act(async () => { alerts.at(-1)?.buttons[0].onPress?.(); });
    expect(unlinked).toEqual([]);
    await act(async () => { remove!.props.onPress(); alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    expect(unlinked).toEqual(['desk-one']);
    expect(selected).toEqual([]);
    expect(navigation).toEqual([]);
    await unmount();
  });

  test('opening a desktop navigates once even with two immediate presses', async () => {
    await mount();
    let finish!: () => void;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    selectHost = async (hostId: string) => { selected.push(hostId); await held; };
    const open = findOpen('Desk Two');
    expect(open).toBeDefined();
    expect(open!.props.accessibilityState.selected).toBe(false);
    await act(async () => { open!.props.onPress(); open!.props.onPress(); await flush(); });
    expect(selected).toEqual(['desk-two']);
    expect(navigation).toEqual([]);
    await act(async () => { finish(); await flush(); });
    expect(navigation).toEqual(['/workspace']);
    expect(unlinked).toEqual([]);
    await unmount();
  });

  test('unlink failure remains visible without switching desktops', async () => {
    await mount();
    unlink = async (hostId: string) => { unlinked.push(hostId); throw new Error('Could not save removal'); };
    await act(async () => { findUnlink('Desk Two')!.props.onPress(); alerts.at(-1)?.buttons[1].onPress?.(); await flush(); });
    const alert = tree.root.findAllByType('Text' as any)
      .find((node) => node.props.accessibilityRole === 'alert');
    expect(alert?.children).toContain('Could not save removal');
    expect(unlinked).toEqual(['desk-two']);
    expect(selected).toEqual([]);
    expect(navigation).toEqual([]);
    await unmount();
  });
}
