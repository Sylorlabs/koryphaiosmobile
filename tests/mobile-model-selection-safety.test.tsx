import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_MODEL_VIEW_TEST_CHILD !== '1') {
  test('model picker guards missing chat and stale agent before offering a selection', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_MODEL_VIEW_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Model picker checks failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

  const navigation: string[] = [];
  const selections: { key: string; selection: string }[] = [];
  const inspections: string[] = [];
  let agentId = '';
  const model = {
    id: 'model-alpha', name: 'Model Alpha', selection: 'vendor:model-alpha',
    provider: 'vendor', providerLabel: 'Vendor', contextWindow: 32_000,
    reasoningLevels: [], supportsFastMode: false,
  };
  const snapshot = {
    machine: { id: 'machine-1' }, activeSessionId: '',
    agents: [{ id: 'manager-1', role: 'manager', model: model.id, provider: model.provider }],
    modelCatalog: [model], context: { used: 200, limit: 32_000, cached: 0 },
  };
  const control = {
    pairing: null, snapshot, modelChoices: {},
    setModelChoice: (key: string, patch: { selection?: string }) => {
      selections.push({ key, selection: patch.selection ?? '' });
    },
    inspect: async (name: string) => { inspections.push(name); return { used: 200, contextWindow: 32_000 }; },
  };

  mock.module('react-native', () => ({
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text',
    TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: (styles: unknown) => styles },
  }));
  mock.module('expo-router', () => ({
    useLocalSearchParams: () => ({ agentId }),
    router: { navigate: (path: string) => { navigation.push(path); } },
  }));
  mock.module('lucide-react-native', () => ({
    Check: 'Check', Search: 'Search', Zap: 'Zap', X: 'X',
  }));
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  mock.module('../src/theme/tokens', () => ({
    colors: { textMuted: '#888', textPrimary: '#fff', textSecondary: '#ccc', accent: '#f85' },
    radii: { lg: 12, xl: 16 }, spacing: { xs: 4, sm: 8, md: 16, lg: 20, xl: 24, huge: 36 },
    type: { xs: 12, sm: 14 },
  }));
  mock.module('../src/components/MobileSurface', () => ({
    MobileSurface: ({ children }: { children: React.ReactNode }) => React.createElement('View', null, children),
    MobileContextRing: () => React.createElement('Ring'),
    formatTokens: (value: number) => String(value),
  }));

  const { MobileModelView } = await import('../src/components/MobileModelView');
  let tree: TestRenderer.ReactTestRenderer;
  const textValues = () => tree.root.findAllByType('Text').map((item) => item.children.join(' ')).join(' ');
  const buttons = () => tree.root.findAllByType('Pressable');

  await act(async () => { tree = TestRenderer.create(<MobileModelView />); });
  expect(textValues()).toContain('Choose a chat');
  expect(buttons().some((item) => item.props.accessibilityLabel === 'Select model Model Alpha')).toBe(false);
  await act(async () => { buttons().find((item) => item.props.accessibilityLabel === 'Open chats')?.props.onPress(); });
  expect(navigation).toEqual(['/chats']);
  expect(selections).toHaveLength(0);
  expect(inspections).toHaveLength(0);

  snapshot.activeSessionId = 'chat-1';
  agentId = 'agent-deleted';
  await act(async () => { tree.update(<MobileModelView />); });
  expect(textValues()).toContain('Agent unavailable');
  expect(buttons().some((item) => item.props.accessibilityLabel === 'Select model Model Alpha')).toBe(false);
  await act(async () => { buttons().find((item) => item.props.accessibilityLabel === 'Open agents')?.props.onPress(); });
  expect(navigation).toEqual(['/chats', '/agents']);
  expect(selections).toHaveLength(0);

  agentId = '';
  await act(async () => { tree.update(<MobileModelView />); });
  const select = buttons().find((item) => item.props.accessibilityLabel === 'Select model Model Alpha');
  expect(select).toBeDefined();
  await act(async () => { await select?.props.onPress(); });
  expect(selections).toEqual([{ key: 'chat-1', selection: 'vendor:model-alpha' }]);
  expect(inspections).toEqual(['context.model_preview']);
  await act(async () => { tree.unmount(); });
}
