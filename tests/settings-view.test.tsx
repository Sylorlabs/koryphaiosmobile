import { beforeEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

// Keep React Native mocks isolated from the other screen suites.
if (process.env.KORYPHAIOS_SETTINGS_TEST_CHILD !== '1') {
  test('Settings controls: host isolation, confirmations and safe writes', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_SETTINGS_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Settings tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const alerts: { title: string; message: string; buttons: { text: string; onPress?: () => void }[] }[] = [];
  type Command = {
    name: string;
    payload: Record<string, unknown>;
    resolve: (result: { accepted: boolean }) => void;
    reject: (reason: Error) => void;
  };
  const commands: Command[] = [];
  let refreshCount = 0;
  const savedActionReviews = new Map<string, { label: string }>();
  let storageReadFails = false;
  let storageSaveFails = false;
  let storageClearFails = false;
  let holdStorageSave: Promise<void> | null = null;
  // Keep action locks scoped to one test's simulated desktop identity.
  let testDesktopGeneration = 0;
  beforeEach(() => { testDesktopGeneration += 1; });
  const screen = { width: 390, height: 844, fontScale: 1 };

  mock.module('react-native', () => ({
    Alert: { alert: (title: string, message: string, buttons: any[]) => alerts.push({ title, message, buttons }) },
    Appearance: { getColorScheme: () => 'dark' },
    Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView',
    Text: 'Text', TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
    useWindowDimensions: () => screen,
  }));
  mock.module('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
  mock.module('expo-router', () => ({ router: { push: () => {} } }));
  mock.module('lucide-react-native', () => Object.fromEntries([
    'Archive', 'Bot', 'Boxes', 'ChevronDown', 'ChevronRight', 'CircleDollarSign',
    'FileText', 'FlaskConical', 'House', 'Image', 'Keyboard', 'KeyRound', 'MemoryStick',
    'Mic2', 'MonitorSmartphone', 'Palette', 'PlugZap', 'Search', 'Settings2', 'Users', 'Video',
  ].map((name) => [name, `Icon${name}`])));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
  }));
  mock.module('../src/components/ProviderSettingsView', () => ({ ProviderSettingsView: () => null }));
  mock.module('../src/components/MachinesView', () => ({ MachinesView: () => null }));
  mock.module('../src/components/VoicePreviewControl', () => ({ VoicePreviewControl: () => null }));
  mock.module('../src/components/AgentControlViews', () => ({ SkillsControlView: () => null }));
  mock.module('../src/control/settingActionReviewStorage', () => ({
    settingActionReviewStorage: {
      load: async (key: string) => {
        if (storageReadFails) throw new Error('Keychain unavailable');
        return savedActionReviews.get(key) ?? null;
      },
      save: async (key: string, value: { label: string }) => {
        if (storageSaveFails) throw new Error('Keychain write failed');
        if (holdStorageSave) await holdStorageSave;
        savedActionReviews.set(key, value);
      },
      clear: async (key: string) => {
        if (storageClearFails) throw new Error('Keychain delete failed');
        savedActionReviews.delete(key);
      },
    },
  }));

  type Field = {
    id: string; sectionId: string; label: string; kind: string; value: unknown;
    description?: string; options?: string[]; actions?: { id: string; label: string; tone: string }[];
  };
  const section = { id: 'agent', label: 'Agent', description: 'Agent behavior' };
  const settings = (host: string, fields: Field[]) => ({
    pairing: { baseUrl: `http://${host}-${testDesktopGeneration}.test`, machineId: host, machineName: `Desktop ${host}` },
    snapshot: { settingsSections: [section], settings: fields },
    refresh: async () => { refreshCount += 1; },
    sendCommand: (name: string, payload: Record<string, unknown>) =>
      new Promise<{ accepted: boolean }>((resolve, reject) => commands.push({ name, payload, resolve, reject })),
  });
  let control: any = settings('a', []);
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));

  const { SettingsSectionView, SettingsView } = await import('../src/components/SettingsView');
  let tree: TestRenderer.ReactTestRenderer;
  const findAction = (label: string) => tree.root.findAllByType('ActionButton' as any)
    .find((node) => node.props.label === label);
  const findPressable = (label: string) => tree.root.findAllByType('Pressable' as any)
    .find((node) => node.props.accessibilityLabel === label);
  const findInput = (label: string) => tree.root.findAllByType('TextInput' as any)
    .find((node) => node.props.accessibilityLabel === label);
  const finish = async (accepted: boolean) => {
    await act(async () => { commands.at(-1)!.resolve({ accepted }); await Promise.resolve(); });
  };
  const mount = async (fields: Field[], host = 'a') => {
    alerts.length = 0;
    commands.length = 0;
    refreshCount = 0;
    storageReadFails = false;
    storageSaveFails = false;
    storageClearFails = false;
    holdStorageSave = null;
    Object.assign(screen, { width: 390, height: 844, fontScale: 1 });
    control = settings(host, fields);
    await act(async () => { tree = TestRenderer.create(<SettingsSectionView sectionId="agent" />); });
  };
  const unmount = async () => { await act(async () => tree.unmount()); };

  test('short controls share a phone row without sacrificing targets; long labels and large text stack', async () => {
    const fields: Field[] = [
      { id: 'agent.enabled', sectionId: 'agent', label: 'Enable agents', kind: 'toggle', value: true },
      { id: 'agent.mode', sectionId: 'agent', label: 'Mode', kind: 'select', value: 'fast', options: ['fast', 'deep'] },
      { id: 'agent.long', sectionId: 'agent', label: 'Enable agents when in background', kind: 'toggle', value: false },
      { id: 'agent.described', sectionId: 'agent', label: 'Reasoning', description: 'Applies to new chats',
        kind: 'select', value: 'fast', options: ['fast', 'deep'] },
    ];
    await mount(fields);
    const rowFor = (label: string) => {
      const labelText = tree.root.findAllByType('Text' as any)
        .find((node) => node.children.join('') === label)!;
      return labelText.parent!.parent!;
    };
    const hasStyle = (label: string, property: string, value: unknown) =>
      (rowFor(label).props.style as Record<string, unknown>[]).some((style) => style?.[property] === value);

    expect(hasStyle('Enable agents', 'minHeight', 58)).toBe(true);
    expect(hasStyle('Mode', 'minHeight', 58)).toBe(true);
    expect(hasStyle('Enable agents when in background', 'flexDirection', 'column')).toBe(true);
    expect(hasStyle('Reasoning', 'flexDirection', 'column')).toBe(true);
    const switchStyle = findPressable('Enable agents')!.props.style({ pressed: false });
    expect(switchStyle.some((style: any) => style?.minHeight >= 44 && style?.minWidth >= 44)).toBe(true);

    screen.fontScale = 1.5;
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    expect(hasStyle('Enable agents', 'flexDirection', 'column')).toBe(true);
    expect(hasStyle('Mode', 'flexDirection', 'column')).toBe(true);
    screen.fontScale = 1;
    screen.width = 320;
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    expect(hasStyle('Enable agents', 'flexDirection', 'column')).toBe(true);
    await unmount();
  });

  test('standalone wide Settings sections use the header title once, while split view keeps its heading', async () => {
    await mount([{ id: 'agent.mode', sectionId: 'agent', label: 'Mode', kind: 'select', value: 'fast' }]);
    screen.width = 820;
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    const headingCount = () => tree.root.findAllByType('Text' as any)
      .filter((node) => node.children.join('') === 'Agent').length;
    expect(headingCount()).toBe(1);
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" inRoute />); });
    expect(headingCount()).toBe(0);
    expect(tree.root.findAllByType('Text' as any).some((node) => node.children.join('') === 'Agent behavior')).toBe(true);
    await unmount();
  });

  test('successful transport acknowledgement never claims a desktop action completed', async () => {
    await mount([{ id: 'agent.reset', sectionId: 'agent', label: 'Reset agent behavior', kind: 'action', value: 'Reset' }]);
    await act(async () => {
      findAction('Reset')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
    });
    await finish(true);
    expect(commands).toHaveLength(1);
    const copy = tree.root.findAllByType('Text' as any).flatMap((node) => node.children).join(' ');
    expect(copy).toContain('Desktop accepted Reset');
    expect(copy).toContain('confirm the result');
    expect(copy).not.toContain('Reset completed');
    await unmount();
  });

  test('reset and delete require a desktop-specific confirmation and reject repeat presses while pending', async () => {
    await mount([
      { id: 'agent.reset', sectionId: 'agent', label: 'Reset agent behavior', kind: 'action', value: 'Reset' },
      { id: 'archived.title.chat-1', sectionId: 'agent', label: 'Archived chat', kind: 'text', value: 'Archived chat',
        actions: [{ id: 'delete', label: 'Delete', tone: 'danger' }] },
    ]);
    await act(async () => { findAction('Reset')!.props.onPress(); });
    expect(alerts.at(-1)?.title).toContain('Reset agent behavior');
    expect(alerts.at(-1)?.message).toContain('Desktop a');
    expect(commands).toHaveLength(0);
    await act(async () => { alerts.at(-1)!.buttons[0].onPress?.(); });
    expect(commands).toHaveLength(0);

    await act(async () => {
      findAction('Reset')!.props.onPress();
      const confirm = alerts.at(-1)!.buttons[1].onPress!;
      confirm();
      confirm();
    });
    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('setting.action');
    expect(commands[0].payload.settingId).toBe('agent.reset');
    expect(findAction('Reset')?.props.disabled).toBe(true);
    await finish(true);
    await act(async () => { findAction('Delete')!.props.onPress(); });
    expect(commands).toHaveLength(1);
    expect(alerts.at(-1)?.title).toContain('Delete Archived chat');
    await unmount();
  });

  test('switching desktops with equal values cannot carry the other desktop’s unsaved draft', async () => {
    const field = { id: 'agent.label', sectionId: 'agent', label: 'Agent label', kind: 'text', value: 'Shared' };
    await mount([field]);
    await act(async () => { findInput('Agent label')!.props.onChangeText('Draft from desktop a'); });
    expect(findInput('Agent label')?.props.value).toBe('Draft from desktop a');
    control = settings('b', [field]);
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    expect(findInput('Agent label')?.props.value).toBe('Shared');
    expect(findAction('Save')?.props.disabled).toBe(true);
    expect(commands).toHaveLength(0);
    await unmount();
  });

  test('unconfirmed structured edits keep their text and expose an error without retry', async () => {
    await mount([{ id: 'agent.managerNotes', sectionId: 'agent', label: 'Manager notes', kind: 'json', value: '{"a":1}' }]);
    await act(async () => { findPressable('Edit Manager notes')!.props.onPress(); });
    await act(async () => { findInput('Manager notes')!.props.onChangeText('{"a":2}'); });
    await act(async () => { findPressable('Save Manager notes')!.props.onPress(); });
    expect(commands).toHaveLength(1);
    expect(commands[0].payload.value).toEqual({ a: 2 });
    await act(async () => { commands[0].reject(new Error('Desktop result is uncertain')); await Promise.resolve(); });
    expect(findInput('Manager notes')?.props.value).toBe('{"a":2}');
    expect(tree.root.findAllByType('Modal' as any).some((node) => node.props.visible)).toBe(true);
    const labels = tree.root.findAllByType('Text' as any).flatMap((node) => node.children);
    expect(labels.join(' ')).toContain('Desktop result is uncertain');
    expect(commands).toHaveLength(1);
    await unmount();
  });

  test('number fields reject blank-to-zero updates and Settings navigation has accessible labels', async () => {
    await mount([{ id: 'agent.maxWorkers', sectionId: 'agent', label: 'Max workers', kind: 'number', value: 3 }]);
    await act(async () => { findInput('Max workers')!.props.onChangeText('   '); });
    expect(findAction('Save')?.props.disabled).toBe(true);
    await unmount();

    control = settings('a', [{ id: 'agent.enabled', sectionId: 'agent', label: 'Enable agents', kind: 'toggle', value: true }]);
    await act(async () => { tree = TestRenderer.create(<SettingsSectionView sectionId="agent" />); });
    expect(findPressable('Enable agents')?.props.accessibilityRole).toBe('switch');
    await unmount();
    await act(async () => { tree = TestRenderer.create(<SettingsView />); });
    expect(findInput('Search settings')).toBeDefined();
    expect(findPressable('Agent')?.props.accessibilityRole).toBe('button');
    await unmount();
  });

  test('remote refresh preserves an unsaved text draft and requires explicit overwrite', async () => {
    const field = { id: 'agent.label', sectionId: 'agent', label: 'Agent label', kind: 'text', value: 'Original' };
    await mount([field]);
    await act(async () => { findInput('Agent label')!.props.onChangeText('Local edit'); });

    control.snapshot.settings = [{ ...field, value: 'Updated on desktop' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    expect(findInput('Agent label')?.props.value).toBe('Local edit');
    expect(findAction('Save')?.props.disabled).toBe(true);
    expect(findAction('Overwrite desktop')).toBeDefined();
    expect(commands).toHaveLength(0);

    await act(async () => { findAction('Overwrite desktop')!.props.onPress(); });
    expect(alerts.at(-1)?.title).toContain('Overwrite Agent label');
    // A second remote edit while the confirmation is open invalidates it.
    control.snapshot.settings = [{ ...field, value: 'Desktop changed again' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    await act(async () => { alerts.at(-1)!.buttons[1].onPress?.(); });
    expect(commands).toHaveLength(0);
    expect(findInput('Agent label')?.props.value).toBe('Local edit');

    await act(async () => {
      findAction('Overwrite desktop')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
      alerts.at(-1)!.buttons[1].onPress?.();
    });
    expect(commands).toHaveLength(1);
    expect(commands[0].payload).toMatchObject({ settingId: 'agent.label', value: 'Local edit' });
    await finish(true);
    // After host snapshot catches up, the editor returns to a clean state.
    control.snapshot.settings = [{ ...field, value: 'Local edit' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    expect(findInput('Agent label')?.props.value).toBe('Local edit');
    expect(findAction('Save')?.props.disabled).toBe(true);
    expect(findAction('Overwrite desktop')).toBeUndefined();
    await unmount();
  });

  test('pristine values track remote changes, while structured drafts keep validation on a conflict', async () => {
    const field = { id: 'agent.policy', sectionId: 'agent', label: 'Agent policy', kind: 'json', value: '{"a":1}' };
    await mount([field]);
    control.snapshot.settings = [{ ...field, value: '{"a":2}' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    await act(async () => { findPressable('Edit Agent policy')!.props.onPress(); });
    expect(findInput('Agent policy')?.props.value).toBe('{"a":2}');

    await act(async () => { findInput('Agent policy')!.props.onChangeText('{invalid'); });
    control.snapshot.settings = [{ ...field, value: '{"a":3}' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    expect(findInput('Agent policy')?.props.value).toBe('{invalid');
    expect(findPressable('Save Agent policy')?.props.disabled).toBe(true);

    await act(async () => {
      findAction('Overwrite desktop')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
    });
    expect(commands).toHaveLength(0);
    expect(findInput('Agent policy')?.props.value).toBe('{invalid');
    expect(tree.root.findAllByType('Text' as any).flatMap((node) => node.children).join(' ')).toContain('JSON');

    await act(async () => { findInput('Agent policy')!.props.onChangeText('{"a":4}'); });
    await act(async () => {
      findAction('Overwrite desktop')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
    });
    expect(commands).toHaveLength(1);
    expect(commands[0].payload.value).toEqual({ a: 4 });
    await act(async () => { commands[0].reject(new Error('Unconfirmed host write')); await Promise.resolve(); });
    expect(findInput('Agent policy')?.props.value).toBe('{"a":4}');
    expect(tree.root.findAllByType('Modal' as any).some((node) => node.props.visible)).toBe(true);
    await unmount();
  });

  test('accepted but unreconciled text write retains draft and blocks automatic duplicate sends', async () => {
    const field = { id: 'agent.label', sectionId: 'agent', label: 'Agent label', kind: 'text', value: 'Original' };
    await mount([field]);
    await act(async () => { findInput('Agent label')!.props.onChangeText('New label'); });
    await act(async () => { findAction('Save')!.props.onPress(); });
    const staleSave = findAction('Save')!.props.onPress;
    expect(commands).toHaveLength(1);
    await finish(true);
    expect(findInput('Agent label')?.props.value).toBe('New label');
    expect(findInput('Agent label')?.props.editable).toBe(false);
    expect(findAction('Save')?.props.disabled).toBe(true);
    await act(async () => { staleSave(); findAction('Refresh desktop value')!.props.onPress(); });
    expect(refreshCount).toBe(1);
    expect(commands).toHaveLength(1);

    control.snapshot.settings = [{ ...field, value: 'New label' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); await Promise.resolve(); });
    expect(findAction('Review uncertain change')).toBeUndefined();
    expect(findInput('Agent label')?.props.editable).toBe(true);
    expect(findAction('Save')?.props.disabled).toBe(true);
    await unmount();
  });

  test('unknown text result preserves draft and requires explicit review before another write', async () => {
    await mount([{ id: 'agent.label', sectionId: 'agent', label: 'Agent label', kind: 'text', value: 'Old' }]);
    await act(async () => { findInput('Agent label')!.props.onChangeText('Edited'); });
    await act(async () => { findAction('Save')!.props.onPress(); });
    await act(async () => { commands[0].reject(new Error('Network vanished')); await Promise.resolve(); });
    expect(findAction('Save')?.props.disabled).toBe(true);
    expect(findAction('Review uncertain change')).toBeDefined();
    await act(async () => { findAction('Review uncertain change')!.props.onPress(); });
    expect(alerts.at(-1)?.message).toContain('already have been applied');
    await act(async () => { alerts.at(-1)!.buttons[1].onPress?.(); });
    expect(findInput('Agent label')?.props.editable).toBe(true);
    expect(findAction('Save')?.props.disabled).toBe(false);
    expect(commands).toHaveLength(1);
    await unmount();
  });

  test('JSON normalization and list trimming reconcile accepted writes without an extra mutation', async () => {
    for (const field of [
      { id: 'agent.policy', sectionId: 'agent', label: 'Policy', kind: 'json', value: '{"a":1,"b":2}' },
      { id: 'agent.allowed', sectionId: 'agent', label: 'Allowed', kind: 'list', value: 'x' },
    ]) {
      await mount([field]);
      await act(async () => { findPressable(`Edit ${field.label}`)!.props.onPress(); });
      const text = field.kind === 'json' ? '{"b":3, "a":1}' : ' x  \n\n y ';
      await act(async () => { findInput(field.label)!.props.onChangeText(text); });
      await act(async () => { findPressable(`Save ${field.label}`)!.props.onPress(); });
      await finish(true);
      expect(findAction('Review uncertain change')).toBeDefined();
      control.snapshot.settings = [{ ...field, value: field.kind === 'json' ? '{\n  "a": 1,\n  "b": 3\n}' : 'x\ny' }];
      await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); await Promise.resolve(); });
      expect(findAction('Review uncertain change')).toBeUndefined();
      await act(async () => { findPressable(`Edit ${field.label}`)!.props.onPress(); });
      expect(findInput(field.label)!.props.value).toBe(control.snapshot.settings[0].value);
      expect(commands).toHaveLength(1);
      await unmount();
    }
  });

  test('toggle and select wait for desktop state rather than repeating uncertain updates', async () => {
    const toggle = { id: 'agent.enabled', sectionId: 'agent', label: 'Enabled', kind: 'toggle', value: false };
    await mount([toggle]);
    await act(async () => { findPressable('Enabled')!.props.onPress(); });
    expect(commands).toHaveLength(1);
    await finish(true);
    expect(findPressable('Enabled')?.props.disabled).toBe(true);
    await act(async () => { findPressable('Enabled')!.props.onPress(); });
    expect(commands).toHaveLength(1);
    control.snapshot.settings = [{ ...toggle, value: true }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); await Promise.resolve(); });
    expect(findPressable('Enabled')?.props.disabled).toBe(false);
    await unmount();

    const select = { id: 'agent.mode', sectionId: 'agent', label: 'Mode', kind: 'select', value: 'fast', options: ['fast', 'deep'] };
    await mount([select]);
    await act(async () => { findPressable('Mode: fast')!.props.onPress(); });
    await act(async () => { findPressable('Mode: deep')!.props.onPress(); });
    expect(commands).toHaveLength(1);
    await finish(true);
    expect(findPressable('Mode: fast')?.props.disabled).toBe(true);
    control.snapshot.settings = [{ ...select, value: 'deep' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); await Promise.resolve(); });
    expect(findAction('Review uncertain change')).toBeUndefined();
    expect(findPressable('Mode: deep')?.props.disabled).toBe(false);
    await unmount();
  });

  test('A→B→A desktop changes invalidate both overwrite and destructive confirmation', async () => {
    const field = { id: 'agent.label', sectionId: 'agent', label: 'Agent label', kind: 'text', value: 'A' };
    await mount([field]);
    await act(async () => { findInput('Agent label')!.props.onChangeText('Mine'); });
    control.snapshot.settings = [{ ...field, value: 'B' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    await act(async () => { findAction('Overwrite desktop')!.props.onPress(); });
    const confirm = alerts.at(-1)!.buttons[1].onPress!;
    control.snapshot.settings = [{ ...field, value: 'C' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    control.snapshot.settings = [{ ...field, value: 'B' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    await act(async () => { confirm(); });
    expect(commands).toHaveLength(0);
    await unmount();

    const action = { id: 'agent.reset', sectionId: 'agent', label: 'Reset agent', kind: 'action', value: 'Reset' };
    await mount([action]);
    await act(async () => { findAction('Reset')!.props.onPress(); });
    const dangerous = alerts.at(-1)!.buttons[1].onPress!;
    control.snapshot.settings = [{ ...action, value: 'Pending' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    control.snapshot.settings = [action];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    await act(async () => { dangerous(); });
    expect(commands).toHaveLength(0);
    await unmount();
  });

  test('a different desktop result preserves the unsaved local draft and offers conflict resolution', async () => {
    const field = { id: 'agent.label', sectionId: 'agent', label: 'Agent label', kind: 'text', value: 'Old' };
    await mount([field]);
    await act(async () => { findInput('Agent label')!.props.onChangeText('Local change'); });
    await act(async () => { findAction('Save')!.props.onPress(); });
    await finish(true);
    control.snapshot.settings = [{ ...field, value: 'Other desktop change' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); await Promise.resolve(); });
    expect(findInput('Agent label')?.props.value).toBe('Local change');
    expect(findAction('Review uncertain change')).toBeUndefined();
    expect(findAction('Overwrite desktop')).toBeDefined();
    expect(findAction('Save')?.props.disabled).toBe(true);
    expect(commands).toHaveLength(1);
    await unmount();
  });

  test('an old confirmation cannot save a draft changed and restored while its dialog was open', async () => {
    const field = { id: 'agent.label', sectionId: 'agent', label: 'Agent label', kind: 'text', value: 'Old' };
    await mount([field]);
    await act(async () => { findInput('Agent label')!.props.onChangeText('Mine'); });
    control.snapshot.settings = [{ ...field, value: 'Desktop' }];
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    await act(async () => { findAction('Overwrite desktop')!.props.onPress(); });
    const stale = alerts.at(-1)!.buttons[1].onPress!;
    await act(async () => {
      findInput('Agent label')!.props.onChangeText('Other draft');
      findInput('Agent label')!.props.onChangeText('Mine');
      stale();
    });
    expect(commands).toHaveLength(0);
    await unmount();
  });

  test('slow response from an old machine cannot change settings on the new machine', async () => {
    const field = { id: 'agent.label', sectionId: 'agent', label: 'Agent label', kind: 'text', value: 'Shared' };
    await mount([field]);
    await act(async () => { findInput('Agent label')!.props.onChangeText('Change on A'); });
    await act(async () => { findAction('Save')!.props.onPress(); });
    control = settings('b', [field]);
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    await act(async () => { commands[0].resolve({ accepted: true }); await Promise.resolve(); });
    expect(findInput('Agent label')!.props.value).toBe('Shared');
    expect(findAction('Review uncertain change')).toBeUndefined();
    expect(findAction('Save')!.props.disabled).toBe(true);
    expect(commands).toHaveLength(1);
    await unmount();
  });

  test('uncertain reset remains locked after refresh until explicitly reviewed', async () => {
    await mount([{ id: 'agent.reset', sectionId: 'agent', label: 'Reset agent behavior', kind: 'action', value: 'Reset' }]);
    await act(async () => {
      findAction('Reset')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
    });
    const oldPress = findAction('Reset')!.props.onPress;
    expect(commands).toHaveLength(1);
    await act(async () => { commands[0].reject(new Error('Host timed out')); await Promise.resolve(); });
    expect(findAction('Reset')?.props.disabled).toBe(true);
    expect(findAction('Review action result')).toBeDefined();
    await act(async () => {
      oldPress();
      findAction('Refresh desktop value')!.props.onPress();
      await Promise.resolve();
    });
    expect(refreshCount).toBe(1);
    expect(commands).toHaveLength(1);
    expect(findAction('Reset')?.props.disabled).toBe(true);
    await act(async () => { findAction('Review action result')!.props.onPress(); });
    expect(alerts.at(-1)?.message).toContain('Repeating this action');
    await act(async () => { alerts.at(-1)!.buttons[0].onPress?.(); });
    expect(findAction('Reset')?.props.disabled).toBe(true);
    await act(async () => {
      findAction('Review action result')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
    });
    expect(findAction('Reset')?.props.disabled).toBe(false);
    expect(commands).toHaveLength(1);
    await unmount();
  });

  test('unverified reset remains locked after leaving and reopening Settings, including A to B to A', async () => {
    const field = { id: 'agent.reset', sectionId: 'agent', label: 'Reset agent behavior', kind: 'action', value: 'Reset' };
    await mount([field]);
    await act(async () => {
      findAction('Reset')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
    });
    expect(commands).toHaveLength(1);
    await unmount();

    await act(async () => { tree = TestRenderer.create(<SettingsSectionView sectionId="agent" />); });
    expect(findAction('Reset')?.props.disabled).toBe(true);
    expect(findAction('Review action result')).toBeDefined();
    await act(async () => { commands[0].resolve({ accepted: true }); await Promise.resolve(); });
    expect(findAction('Reset')?.props.disabled).toBe(true);

    control = settings('b', [field]);
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    expect(findAction('Reset')?.props.disabled).toBe(false);
    control = settings('a', [field]);
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    expect(findAction('Reset')?.props.disabled).toBe(true);
    expect(findAction('Review action result')).toBeDefined();

    await act(async () => { findAction('Review action result')!.props.onPress(); });
    await act(async () => { alerts.at(-1)!.buttons[1].onPress?.(); });
    expect(findAction('Reset')?.props.disabled).toBe(false);
    expect(commands).toHaveLength(1);
    await unmount();
  });

  test('failed delete action and stale A-host result cannot unlock or block B-host actions', async () => {
    const field = { id: 'archived.title.chat-1', sectionId: 'agent', label: 'Archived chat', kind: 'readonly',
      value: 'Archived chat', actions: [{ id: 'delete', label: 'Delete', tone: 'danger' }] };
    await mount([field]);
    await act(async () => {
      findAction('Delete')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
    });
    control = settings('b', [field]);
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    await act(async () => { commands[0].reject(new Error('Host A connection lost')); await Promise.resolve(); });
    expect(findAction('Review action result')).toBeUndefined();
    expect(findAction('Delete')?.props.disabled).toBe(false);
    expect(commands).toHaveLength(1);
    await unmount();
  });

  test('a destructive action never leaves the device before its review record is durable', async () => {
    await mount([{ id: 'agent.reset', sectionId: 'agent', label: 'Reset agent behavior', kind: 'action', value: 'Reset' }]);
    let finishSave!: () => void;
    holdStorageSave = new Promise<void>((resolve) => { finishSave = resolve; });
    await act(async () => {
      findAction('Reset')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
      await Promise.resolve();
    });
    expect(findAction('Reset')?.props.disabled).toBe(true);
    expect(commands).toHaveLength(0);
    await act(async () => { finishSave(); await Promise.resolve(); });
    expect(commands).toHaveLength(1);
    expect([...savedActionReviews.values()].at(-1)?.label).toBe('Reset');
    await finish(true);
    expect(findAction('Reset')?.props.disabled).toBe(true);
    await unmount();
  });

  test('secure-storage write or deletion errors fail closed without accidental remote actions', async () => {
    await mount([{ id: 'agent.reset', sectionId: 'agent', label: 'Reset agent behavior', kind: 'action', value: 'Reset' }]);
    storageSaveFails = true;
    await act(async () => {
      findAction('Reset')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
      await Promise.resolve();
    });
    expect(commands).toHaveLength(0);
    expect(findAction('Reset')?.props.disabled).toBe(true);
    expect(tree.root.findAllByType('Text' as any).flatMap((node) => node.children).join(' ')).toContain('No desktop request was sent');
    storageSaveFails = false;
    storageClearFails = true;
    await act(async () => {
      findAction('Review action result')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
      await Promise.resolve();
    });
    expect(findAction('Reset')?.props.disabled).toBe(true);
    expect(findAction('Review action result')).toBeDefined();
    storageClearFails = false;
    await act(async () => {
      findAction('Review action result')!.props.onPress();
      alerts.at(-1)!.buttons[1].onPress?.();
      await Promise.resolve();
    });
    expect(findAction('Reset')?.props.disabled).toBe(false);
    expect(commands).toHaveLength(0);
    await unmount();
  });

  test('saved-action read errors lock controls and support an explicit storage retry', async () => {
    const field = { id: 'agent.reset', sectionId: 'agent', label: 'Reset agent behavior', kind: 'action', value: 'Reset' };
    await mount([field]);
    await unmount();
    storageReadFails = true;
    await act(async () => { tree = TestRenderer.create(<SettingsSectionView sectionId="agent" />); });
    expect(findAction('Reset')?.props.disabled).toBe(true);
    expect(findAction('Retry saved action check')).toBeDefined();
    storageReadFails = false;
    await act(async () => { findAction('Retry saved action check')!.props.onPress(); await Promise.resolve(); });
    expect(findAction('Retry saved action check')).toBeUndefined();
    expect(findAction('Reset')?.props.disabled).toBe(false);
    await unmount();
  });

  test('live change from ordinary setting to remote action stays locked until its saved state loads', async () => {
    const toggle = { id: 'agent.maintenance', sectionId: 'agent', label: 'Maintenance', kind: 'toggle', value: false };
    await mount([toggle]);
    storageReadFails = true;
    control = settings('a', [{ ...toggle, kind: 'action', value: 'Reset' }]);
    await act(async () => { tree.update(<SettingsSectionView sectionId="agent" />); });
    expect(findAction('Reset')?.props.disabled).toBe(true);
    expect(findAction('Retry saved action check')).toBeDefined();
    await act(async () => { findAction('Reset')!.props.onPress(); await Promise.resolve(); });
    expect(commands).toHaveLength(0);

    storageReadFails = false;
    await act(async () => {
      findAction('Retry saved action check')!.props.onPress();
      await Promise.resolve();
    });
    expect(findAction('Retry saved action check')).toBeUndefined();
    expect(findAction('Reset')?.props.disabled).toBe(false);
    expect(commands).toHaveLength(0);
    await unmount();
  });
}
