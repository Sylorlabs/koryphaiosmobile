import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORYPHAIOS_MCP_ARGS_CHILD !== '1') {
  test('MCP control preserves command arguments and rejects invalid input', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_MCP_ARGS_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `MCP arguments failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const commands: { kind: string; payload: Record<string, any> }[] = [];
  let rejectSave = false;
  const featured = [{
    id: 'registry-fixture', name: 'fixture', title: 'Fixture MCP',
    description: 'Fixture', version: '1', websiteUrl: null, repositoryUrl: null,
    transport: 'stdio', command: 'node',
    args: ['--files', '/Users/Test User/Projects with spaces', '', 'server.js'],
    envVars: [], headerVars: [], url: null,
  }];
  mock.module('react-native', () => ({
    Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput',
    Text: 'Text', View: 'View', StyleSheet: { create: (value: unknown) => value },
  }));
  mock.module('expo-linking', () => ({ openURL: async () => {} }));
  mock.module('lucide-react-native', () => Object.fromEntries([
    'CheckCircle2', 'ChevronDown', 'ChevronRight', 'KeyRound', 'Plus',
    'RefreshCw', 'Search', 'Server', 'Trash2', 'X',
  ].map((name) => [name, name])));
  mock.module('../src/theme/tokens', () => ({
    colors: { accent: '#555', textPrimary: '#fff', textSecondary: '#aaa',
      textMuted: '#888', surface1: '#111', surface2: '#222', border: '#333',
      success: '#0c0', error: '#f00' },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, huge: 48 },
    radii: { sm: 6, md: 8, lg: 12, xl: 16 }, type: { base: 16, small: 12 },
  }));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
  }));
  const inspect = async () => ({ servers: [], featured });
  const sendCommand = async (kind: string, payload: Record<string, any>) => {
    commands.push({ kind, payload });
    return { accepted: !rejectSave };
  };
  mock.module('../src/control/ControlProvider', () => ({
    useControl: () => ({ inspect, sendCommand }),
  }));

  const { McpControlView } = await import('../src/components/McpControlView');
  let tree: TestRenderer.ReactTestRenderer;
  const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 2)); };
  const mount = async () => {
    commands.length = 0;
    rejectSave = false;
    await act(async () => { tree = TestRenderer.create(<McpControlView />); await settle(); });
  };
  const unmount = async () => { await act(async () => { tree.unmount(); }); };
  const pressAction = async (label: string) => {
    const button = tree.root.findAllByType('ActionButton' as any).find((item) => item.props.label === label);
    expect(button).toBeDefined();
    await act(async () => { button!.props.onPress(); await settle(); });
  };
  const pressText = async (label: string) => {
    const text = tree.root.findAllByType('Text' as any).find((item) => item.children.includes(label));
    expect(text).toBeDefined();
    let pressable = text!.parent;
    while (pressable && pressable.type !== 'Pressable') pressable = pressable.parent;
    expect(pressable).toBeDefined();
    await act(async () => { pressable!.props.onPress(); await settle(); });
  };
  const input = (placeholder: string) => tree.root.findAllByType('TextInput' as any)
    .find((item) => item.props.placeholder === placeholder)!;
  const enter = async (placeholder: string, value: string) => {
    await act(async () => { input(placeholder).props.onChangeText(value); });
  };
  const openManual = async () => {
    await mount();
    await pressText('Add server');
    await enter('Server name', 'remote-tools');
    await enter('Command', 'node');
  };

  test('common flags containing s and quoted paths reach the desktop intact', async () => {
    await openManual();
    await enter('Arguments', '--files "/Users/Test User/Projects with spaces" --verbose');
    await pressAction('Save');
    expect(commands).toHaveLength(1);
    expect(commands[0].kind).toBe('mcp.save');
    expect(commands[0].payload.input.args).toEqual([
      '--files', '/Users/Test User/Projects with spaces', '--verbose',
    ]);
    await unmount();
  });

  test('registry-provided arguments, including spaces and empty arguments, round-trip', async () => {
    await mount();
    await pressText('Discover');
    await pressText('Fixture MCP');
    expect(input('Arguments').props.value).toBeTruthy();
    await pressAction('Save');
    expect(commands[0].payload.input.args).toEqual(featured[0].args);
    await unmount();
  });

  test('unterminated quoting rejects save with a visible explanation', async () => {
    await openManual();
    await enter('Arguments', '--path "unterminated');
    await pressAction('Save');
    expect(commands).toHaveLength(0);
    const visible = tree.root.findAllByType('Text' as any)
      .flatMap((item) => item.children.filter((value): value is string => typeof value === 'string'))
      .join(' ');
    expect(visible).toContain('quote');
    await unmount();
  });

  test('a host rejection leaves the editor open and explains the failed save', async () => {
    await openManual();
    rejectSave = true;
    await pressAction('Save');
    expect(commands).toHaveLength(1);
    expect(input('Command').props.value).toBe('node');
    const visible = tree.root.findAllByType('Text' as any)
      .flatMap((item) => item.children.filter((value): value is string => typeof value === 'string'))
      .join(' ');
    expect(visible).toMatch(/not accept|reject/i);
    await unmount();
  });
}
