// Exercise the actual component handlers; native rendering/device replay is separate.
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { ComposerDraftStore, MAX_COMPOSER_ATTACHMENT_BYTES, composerDestinationKey } from '../src/control/composerDrafts';
import { PendingActionStore } from '../src/control/pendingActions';
import { AttentionResponseStore } from '../src/control/attentionResponses';
import { EMPTY_SNAPSHOT } from '../src/control/emptySnapshot';

if (process.env.KORYPHAIOS_WORKSPACE_TEST_CHILD !== '1') {
  test('workspace integration: isolated component callbacks', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_WORKSPACE_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 30_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Workspace tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 35_000);
} else {
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (callback: () => void) => { callback(); return 0; },
});
const appListeners = new Set<(state: string) => void>();
const appState = {
  currentState: 'active',
  addEventListener: (_: string, callback: (state: string) => void) => {
    appListeners.add(callback);
    return { remove: () => appListeners.delete(callback) };
  },
};
const platform = { OS: 'ios', isPad: false };
const scrollWideFeedToEnd = mock(() => {});
let windowSize = { width: 393, height: 852 };
mock.module('react-native', () => ({
  AppState: appState,
  Appearance: { getColorScheme: () => 'dark' },
  View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
  Modal: ({ visible, children }: any) => visible ? React.createElement('Modal', {}, children) : null,
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: platform,
  Dimensions: { get: () => ({ width: 393, height: 852 }) },
  useWindowDimensions: () => windowSize,
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}));
mock.module('react-native-keyboard-controller', () => ({
  KeyboardChatScrollView: 'KeyboardChatScrollView', KeyboardStickyView: 'KeyboardStickyView',
}));
mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
let focused = true;
const routes: string[] = [];
mock.module('expo-router', () => ({
  router: {
    push: (path: string) => routes.push(path),
    back: () => routes.push('back'),
    replace: (path: string) => routes.push(`replace:${path}`),
    setParams: () => {},
  },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (callback: () => void | (() => void)) => {
    React.useEffect(() => focused ? callback() : undefined, [callback, focused]);
  },
}));
function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let permission: ReturnType<typeof deferred> | null = null;
let prepare: ReturnType<typeof deferred> | null = null;
const recorder = {
  uri: 'file:///audit-dictation.m4a',
  prepareToRecordAsync: mock(async () => { await prepare?.promise; }),
  record: mock(() => {}), stop: mock(async () => {}), release: mock(() => {}),
};
const audioMode = mock(async (_: unknown) => {});
const players: any[] = [];
const createPlayer = mock((uri: string) => {
  const listeners = new Set<(status: any) => void>();
  const player = {
    uri,
    play: mock(() => {}),
    release: mock(() => { listeners.clear(); }),
    addListener: (_: string, callback: (status: any) => void) => {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    },
    emit: (status: any) => [...listeners].forEach((callback) => callback(status)),
  };
  players.push(player);
  return player;
});
mock.module('expo-audio', () => ({
  AudioModule: { AudioRecorder: class { constructor() { return recorder; } } },
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: () => permission?.promise ?? Promise.resolve({ granted: true }),
  setAudioModeAsync: audioMode, useAudioRecorder: () => recorder, createAudioPlayer: createPlayer,
}));
let clipboard: ReturnType<typeof deferred> | null = null;
mock.module('expo-clipboard', () => ({
  getImageAsync: () => clipboard?.promise ?? Promise.resolve(null), setStringAsync: async () => true,
}));
const removedFiles: string[] = [];
const writtenFiles: string[] = [];
let recordingSize = 5;
let recordingReadError: Error | null = null;
let fileWriteGate: ReturnType<typeof deferred> | null = null;
const readRecording = mock(async () => {
  if (recordingReadError) throw recordingReadError;
  return 'YXVkaW8=';
});
const movedFiles: string[] = [];
mock.module('expo-file-system', () => ({
  Paths: { cache: 'file:///cache', document: 'file:///documents' },
  File: class {
    uri: string;
    constructor(...parts: string[]) { this.uri = parts.join('/'); }
    get size() { return recordingSize; }
    base64 = readRecording;
    delete = () => { removedFiles.push(this.uri); };
    async write() { await fileWriteGate?.promise; writtenFiles.push(this.uri); }
    async move(destination: { uri: string }) { this.uri = destination.uri; movedFiles.push(this.uri); }
  },
}));
let shareAvailable = true;
const shareRecording = mock(async (_uri: string, _options: unknown) => {});
mock.module('expo-sharing', () => ({
  isAvailableAsync: async () => shareAvailable, shareAsync: shareRecording,
}));
let preferenceRead: ReturnType<typeof deferred> | null = null;
let preferenceWrite: ReturnType<typeof deferred> | null = null;
mock.module('../src/control/safeSecureStore', () => ({
  safeGetItem: () => preferenceRead?.promise ?? Promise.resolve(null),
  safeSetItem: () => preferenceWrite?.promise ?? Promise.resolve(), safeDeleteItem: async () => {},
}));
// Chats persists uncertain create/delete locks through this separate secure
// storage interface. Simulate persistence without loading native Expo modules.
const savedActionReviews = new Map<string, { label: string }>();
mock.module('../src/control/settingActionReviewStorage', () => ({
  settingActionReviewStorage: {
    load: async (key: string) => savedActionReviews.get(key) ?? null,
    save: async (key: string, value: { label: string }) => { savedActionReviews.set(key, value); },
    clear: async (key: string) => { savedActionReviews.delete(key); },
  },
}));
let speechStopGate: ReturnType<typeof deferred> | null = null;
let voicesGate: ReturnType<typeof deferred> | null = null;
const speechStop = mock(async () => { await speechStopGate?.promise; });
const voiceLookup = mock(async () => await voicesGate?.promise ?? []);
const speeches: { text: string; options: any }[] = [];
const speak = mock((text: string, options: any) => { speeches.push({ text, options }); options.onStart?.(); });
mock.module('expo-speech', () => ({ stop: speechStop, getAvailableVoicesAsync: voiceLookup, speak }));
let picker: ReturnType<typeof deferred> | null = null;
mock.module('../src/native/mobileFiles', () => ({ pickChatAttachments: () => picker?.promise ?? Promise.resolve([]) }));
mock.module('lucide-react-native', () => Object.fromEntries([
  'Bell', 'Check', 'ChevronDown', 'ChevronLeft', 'ClipboardPaste', 'Copy', 'EyeOff',
  'FilePlus2', 'FileText', 'Folder', 'Image', 'ImageOff', 'Mic', 'Plus', 'RotateCcw',
  'ScanSearch', 'Search', 'Send', 'Settings', 'ShieldCheck', 'Square', 'SlidersHorizontal',
  'Trash2', 'Volume2', 'X', 'CircleHelp', 'GitBranch', 'ListChecks', 'Target', 'ChevronRight',
  'FolderOpen', 'MoreHorizontal', 'Activity', 'Bot', 'BookOpen', 'Boxes', 'CircleDollarSign',
  'Folders', 'History', 'Images', 'Laptop', 'MemoryStick', 'MessageSquarePlus', 'MessagesSquare',
  'Monitor', 'Palette', 'Plug', 'Share2', 'Sparkles', 'Terminal', 'Users', 'Workflow',
].map((name) => [name, `Icon${name}`])));
mock.module('../src/components/ui', () => ({
  AgentGlyph: 'AgentGlyph', StatusDot: 'StatusDot', ActionButton: 'ActionButton',
  Eyebrow: 'Eyebrow', ProgressBar: 'ProgressBar',
}));
mock.module('../src/components/AgentDetailView', () => ({ AgentDetailView: 'AgentDetailView' }));
mock.module('../src/components/WorkspaceControls', () => ({
  GoalSteeringBar: 'GoalSteeringBar', WorkspaceControlPanel: 'WorkspaceControlPanel',
}));
mock.module('../src/components/MobileContextPopover', () => ({ MobileContextPopover: () => null }));
mock.module('../src/components/MobileSurface', () => ({
  MobileContextRing: () => null,
  // The real surface renders header actions via `right`; a host-string mock
  // leaves them inert in props, making the Chats header impossible to test.
  MobileSurface: ({ right, children }: { right?: React.ReactNode; children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, right, children),
}));

let control: any;
let preview: ReturnType<typeof deferred> | null = null;
const requests: { command: string; payload: any; result: ReturnType<typeof deferred> }[] = [];
const respondToAttention = (command: string, payload: any, key: string) => {
  const store = control.attentionResponses as AttentionResponseStore;
  const attempt = store.begin(key);
  if (!attempt) return Promise.resolve();
  const result = deferred();
  requests.push({ command, payload, result });
  return result.promise.then(() => store.submitted(attempt)).catch((error: Error) => store.failed(attempt, error.message));
};
mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
const { MobileWorkspaceView } = await import('../src/components/MobileWorkspaceView');
const { MobileChatsView } = await import('../src/components/MobileChatsView');
const { MobileControlHub } = await import('../src/components/MobileControlHub');
const { WorkspaceView } = await import('../src/components/WorkspaceView');
const { MobileAttentionView } = await import('../src/components/MobileAttentionView');
let tree: TestRenderer.ReactTestRenderer;
const key = (sessionId = 'chat-a', machineId = 'host-a') => composerDestinationKey({
  baseUrl: `https://${machineId}.test`, machineId, sessionId, projectId: 'project-a',
});
const textOf = (node: TestRenderer.ReactTestInstance): string => node.children
  .map((child) => typeof child === 'string' ? child : textOf(child)).join('');
const button = (label: string) => tree.root.findAll((node) => node.type === 'Pressable' && (
  node.props.accessibilityLabel === label || textOf(node) === label
))[0];
const input = () => tree.root.findByType('TextInput' as any);
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const tap = async (label: string) => {
  const target = button(label);
  expect(target).toBeDefined();
  expect(target.props.disabled).not.toBe(true);
  await act(async () => { target.props.onPress(); await flush(); });
};
const type = async (value: string) => { await act(async () => { input().props.onChangeText(value); }); };
const render = async () => { await act(async () => { tree.update(<MobileWorkspaceView />); await flush(); }); };
const switchChat = async (sessionId: string, machineId = 'host-a') => {
  control = { ...control, pairing: { baseUrl: `https://${machineId}.test`, machineId },
    snapshot: { ...control.snapshot, activeSessionId: sessionId } };
  await render();
};
const image = { type: 'image', name: 'image.png', mimeType: 'image/png', data: 'eA==', size: 1 };
const menuAction = async (label: string) => { await tap('More message actions'); await tap(label); };
const showResponses = async () => {
  control.snapshot = { ...control.snapshot, feed: ['A', 'B'].map((name) => ({
    id: `message-${name}`, messageId: `message-${name}`, kind: 'assistant', author: 'Kory',
    body: `Response ${name}`, model: 'text', provider: 'local',
    variantIdentityAuthoritative: true, activeMessageId: `message-${name}`,
    conversationRevision: 4, providerConversationRevision: 3,
    responseVariants: [{ id: `message-${name}`, isActive: true }, { id: `alternative-${name}` }],
  })) };
  await render();
};
const openResponse = async (name = 'A') => {
  const target = tree.root.findAll((node) => node.type === 'Pressable' &&
    typeof node.props.onLongPress === 'function' && textOf(node) === `Response ${name}`)[0];
  expect(target).toBeDefined();
  await act(async () => { target.props.onLongPress(); await flush(); });
};

beforeEach(async () => {
  focused = true; appState.currentState = 'active';
  savedActionReviews.clear();
  scrollWideFeedToEnd.mockClear();
  platform.OS = 'ios'; windowSize = { width: 393, height: 852 };
  requests.length = routes.length = removedFiles.length = writtenFiles.length = movedFiles.length = players.length = speeches.length = 0;
  permission = prepare = clipboard = picker = preview = preferenceRead = preferenceWrite = speechStopGate = voicesGate = null;
  speechStop.mockClear(); voiceLookup.mockClear(); speak.mockClear(); createPlayer.mockClear();
  fileWriteGate = null; recordingReadError = null; recordingSize = 5; shareAvailable = true;
  readRecording.mockClear(); shareRecording.mockClear();
  recorder.record.mockClear(); recorder.stop.mockClear(); recorder.release.mockClear(); recorder.prepareToRecordAsync.mockClear(); audioMode.mockClear();
  control = {
    pairing: { machineId: 'host-a', baseUrl: 'https://host-a.test' },
    snapshot: { ...EMPTY_SNAPSHOT, activeSessionId: 'chat-a', activeProjectId: 'project-a',
      machine: { ...EMPTY_SNAPSHOT.machine, id: 'host-a', name: 'Audit host', status: 'online' },
      modelCatalog: [{ id: 'text', name: 'Text', selection: 'local:text', provider: 'local', supportsAttachments: false }],
    },
    modelChoices: { 'chat-a': { selection: 'local:text' } },
    live: { connection: 'connected', runs: {}, questions: {}, reviews: {}, nativeCommands: {} },
    composerDrafts: new ComposerDraftStore(),
    pendingActions: new PendingActionStore(),
    attentionResponses: new AttentionResponseStore(),
    answerQuestion: (sessionId: string, selection: string, text: string | undefined, key: string) =>
      respondToAttention('attention.answer', { sessionId, selection, text }, key),
    resolveReview: (sessionId: string, accepted: boolean, key: string) =>
      respondToAttention('attention.review', { sessionId, accepted }, key),
    attentionSessionIds: [],
    inspect: () => preview?.promise ?? Promise.resolve({}),
    sendCommand: (command: string, payload: any) => {
      const result = deferred(); requests.push({ command, payload, result }); return result.promise;
    },
  };
  await act(async () => { tree = TestRenderer.create(<MobileWorkspaceView />, {
    createNodeMock: (element) => element.type === 'ScrollView' && element.props.accessibilityLabel === 'Conversation messages'
      ? { scrollToEnd: scrollWideFeedToEnd } : null,
  }); });
});
afterEach(async () => { await act(async () => {
  tree.unmount(); speechStopGate?.resolve(undefined); voicesGate?.resolve([]); await flush();
}); });

const resizeWorkspace = async (width: number) => {
  platform.OS = 'web'; windowSize = { width, height: 1000 };
  await act(async () => { tree.update(<WorkspaceView />); await flush(); });
};

test('wide and compact workspaces retain both drafts and scope a single submission', async () => {
  await type('First message');
  await resizeWorkspace(1440);
  expect(input().props.value).toBe('First message');
  const send = button('Send');
  await act(async () => { send.props.onPress(); send.props.onPress(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0].payload).toMatchObject({ body: 'First message', sessionId: 'chat-a', projectId: 'project-a' });
  await type('Keep this newer draft');
  await resizeWorkspace(393);
  await act(async () => { requests[0].result.reject(new Error('Connection interrupted')); await flush(); });
  expect(input().props.value).toBe('Keep this newer draft');
  expect(control.composerDrafts.read(key()).saved[0].body).toBe('First message');
  await resizeWorkspace(1440);
  await tap('Restore saved draft');
  expect(input().props.value).toBe('First message');
  expect(control.composerDrafts.read(key()).saved[0].body).toBe('Keep this newer draft');
});

test('resizing during wide composer preflight cannot send a stale attempt', async () => {
  await resizeWorkspace(1440); await type('Keep this message');
  preview = deferred();
  await tap('Send');
  await resizeWorkspace(393);
  await act(async () => { preview!.resolve({}); await flush(); });
  expect(requests).toHaveLength(0);
  expect(input().props.value).toBe('Keep this message');
  expect(control.composerDrafts.busy(key())).toBe(false);
});

test('wide composer keeps attachments visible and applies image consent', async () => {
  await act(async () => { control.composerDrafts.setAttachments(key(), () => [image]); });
  await resizeWorkspace(1440);
  expect(button('Remove image.png')).toBeDefined();
  await tap('Send');
  expect(requests).toHaveLength(0);
  expect(control.composerDrafts.busy(key())).toBe(true);
  expect(control.composerDrafts.read(key()).attachments).toHaveLength(1);
  await resizeWorkspace(393);
  expect(button('Remove image.png')).toBeDefined();
  expect(control.composerDrafts.busy(key())).toBe(false);
});

test('wide attention renders its answer controls and preserves the blocked composer draft', async () => {
  await type('Keep my next message');
  control.live = { ...control.live, questions: { 'chat-a': {
    sessionId: 'chat-a', questionId: 'question-a', question: 'Choose a direction',
    options: ['Continue'], allowOther: true, allowKeepChatting: false,
  } } };
  await resizeWorkspace(1440);
  const composer = () => tree.root.findByProps({ accessibilityLabel: 'Message Koryphaios' });
  expect(composer().props.value).toBe('Keep my next message');
  expect(composer().props.editable).toBe(false);
  expect(button('Send').props.disabled).toBe(true);
  expect(button('Send answer').props.disabled).toBe(true);
  expect(tree.root.findByProps({ placeholder: 'Type another answer…' })).toBeDefined();
  control.live = { ...control.live, questions: {} };
  await resizeWorkspace(1440);
  expect(input().props.value).toBe('Keep my next message');
  expect(input().props.editable).toBe(true);
  expect(button('Send').props.disabled).not.toBe(true);
  expect(requests).toHaveLength(0);
});

test('wide Stop remains single-dispatch across a compact layout transition', async () => {
  control.live = { ...control.live, runs: { 'chat-a': { status: 'active' } } };
  await resizeWorkspace(1440);
  const stop = button('Stop Koryphaios').props.onPress;
  await act(async () => { stop(); stop(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ command: 'agent.control', payload: {
    action: 'stop', agentId: 'kory-manager', sessionId: 'chat-a', projectId: 'project-a',
  } });
  await resizeWorkspace(393);
  expect(button('Stop Koryphaios').props.disabled).toBe(true);
  await act(async () => { stop(); button('Stop Koryphaios').props.onPress(); await flush(); });
  expect(requests).toHaveLength(1);
  await act(async () => { requests[0].result.resolve({ accepted: true }); await flush(); });
  expect(button('Stop Koryphaios').props.disabled).not.toBe(true);
});

const attentionQuestion = { sessionId: 'chat-a', questionId: 'q-a', question: 'Choose a direction', options: ['Continue'], allowOther: true };
const answerInput = () => tree.root.findByProps({ accessibilityLabel: 'Your answer' });
const showMobileAttention = async () => { await act(async () => { tree.update(<MobileAttentionView />); await flush(); }); };

test('compact attention controls expose pending state and a usable Send answer target', async () => {
  control.live = { ...control.live, questions: { 'chat-a': attentionQuestion } };
  await showMobileAttention();
  expect(button('Continue').props.accessibilityState).toEqual({ disabled: false, busy: false });
  expect(button('Send answer').props.accessibilityState).toEqual({ disabled: true, busy: false });
  const sendStyle = button('Send answer').props.style({ pressed: false })[0];
  expect(sendStyle.width).toBeGreaterThanOrEqual(44);
  expect(sendStyle.height).toBeGreaterThanOrEqual(44);

  await tap('Continue');
  expect(requests).toHaveLength(1);
  expect(button('Continue').props.disabled).toBe(true);
  expect(button('Continue').props.accessibilityState).toEqual({ disabled: true, busy: true });
  expect(button('Send answer').props.accessibilityState).toEqual({ disabled: true, busy: true });
  await act(async () => { requests[0].result.reject(new Error('Desktop unavailable')); await flush(); });
  expect(button('Continue').props.accessibilityState).toEqual({ disabled: false, busy: false });
});

test('attention opens once in a focused compact workspace, never from an embedded or unfocused composer', async () => {
  control.live = { ...control.live, questions: { 'chat-a': attentionQuestion } };
  await resizeWorkspace(1440);
  expect(routes).toEqual([]);
  focused = false;
  await resizeWorkspace(393);
  expect(routes).toEqual([]);
  focused = true;
  await resizeWorkspace(393);
  expect(routes).toEqual(['/attention']);
  await resizeWorkspace(393);
  expect(routes).toEqual(['/attention']);
  control.pairing = { baseUrl: 'https://host-b.test', machineId: 'host-b' };
  await resizeWorkspace(393);
  expect(routes).toEqual(['/attention', '/attention']);
});

test('wide streaming preserves reading position and resumes following at the bottom or in another chat', async () => {
  await resizeWorkspace(1440);
  const feed = () => tree.root.findByProps({ accessibilityLabel: 'Conversation messages' });
  const scroll = (y: number) => feed().props.onScroll({ nativeEvent: {
    contentOffset: { y }, contentSize: { height: 1000 }, layoutMeasurement: { height: 200 },
  } });
  scrollWideFeedToEnd.mockClear();
  await act(async () => { feed().props.onContentSizeChange(); });
  expect(scrollWideFeedToEnd).toHaveBeenCalledTimes(1);
  await act(async () => { scroll(200); feed().props.onContentSizeChange(); });
  expect(scrollWideFeedToEnd).toHaveBeenCalledTimes(1);
  await resizeWorkspace(1440);
  await act(async () => { feed().props.onContentSizeChange(); });
  expect(scrollWideFeedToEnd).toHaveBeenCalledTimes(1);
  await act(async () => { scroll(790); feed().props.onContentSizeChange(); });
  expect(scrollWideFeedToEnd).toHaveBeenCalledTimes(2);
  await act(async () => { scroll(200); });
  control.snapshot = { ...control.snapshot, activeSessionId: 'chat-b' };
  await resizeWorkspace(1440);
  scrollWideFeedToEnd.mockClear();
  await act(async () => { feed().props.onContentSizeChange(); });
  expect(scrollWideFeedToEnd).toHaveBeenCalledTimes(1);
});

test('failed attention answers survive wide-to-mobile remount without navigating away', async () => {
  control.live = { ...control.live, questions: { 'chat-a': attentionQuestion } };
  await resizeWorkspace(1440);
  await act(async () => { answerInput().props.onChangeText('  Preserve this exact answer  '); });
  const send = button('Send answer').props.onPress;
  await act(async () => { send(); send(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(answerInput().props.value).toBe('  Preserve this exact answer  ');
  await showMobileAttention();
  expect(answerInput().props.value).toBe('  Preserve this exact answer  ');
  expect(button('Send answer').props.disabled).toBe(true);
  expect(routes).toHaveLength(0);
  await act(async () => { requests[0].result.reject(new Error('Desktop unavailable')); await flush(); });
  expect(answerInput().props.value).toBe('  Preserve this exact answer  ');
  expect(button('Send answer').props.disabled).toBe(false);
  expect(textOf(tree.root)).toContain('Your response is saved');
  await resizeWorkspace(1440);
  expect(answerInput().props.value).toBe('  Preserve this exact answer  ');
});

test('submitted attention stays visibly pending after transport completion and remount', async () => {
  control.live = { ...control.live, questions: { 'chat-a': attentionQuestion } };
  await showMobileAttention();
  await act(async () => { answerInput().props.onChangeText('My answer'); });
  await tap('Send answer');
  await act(async () => { requests[0].result.resolve(); await flush(); });
  expect(textOf(tree.root)).toContain('Waiting for desktop confirmation');
  expect(answerInput().props.value).toBe('My answer');
  expect(button('Send answer').props.disabled).toBe(true);
  await resizeWorkspace(1440);
  expect(button('Send answer').props.disabled).toBe(true);
  expect(textOf(tree.root)).toContain('Waiting for desktop confirmation');
  expect(requests).toHaveLength(1);
  expect(routes).toHaveLength(0);
});

test('attention text belongs to its original host and prompt across navigation', async () => {
  control.live = { ...control.live, questions: { 'chat-a': attentionQuestion } };
  await showMobileAttention();
  await act(async () => { answerInput().props.onChangeText('Answer for host A'); });
  control.pairing = { baseUrl: 'https://host-b.test', machineId: 'host-b' };
  await showMobileAttention();
  expect(answerInput().props.value).toBe('');
  await act(async () => { answerInput().props.onChangeText('Answer for host B'); });
  control.live = { ...control.live, questions: { 'chat-a': { ...attentionQuestion, questionId: 'q-b' } } };
  await showMobileAttention();
  expect(answerInput().props.value).toBe('');
  control.pairing = { baseUrl: 'https://host-a.test', machineId: 'host-a' };
  control.live = { ...control.live, questions: { 'chat-a': attentionQuestion } };
  await showMobileAttention();
  expect(answerInput().props.value).toBe('Answer for host A');
  expect(requests).toHaveLength(0);
});

test('mobile review preserves its pending decision and blocks an opposite decision across remount', async () => {
  control.live = { ...control.live, reviews: { 'chat-a': { sessionId: 'chat-a', reviewId: 'r-a', changes: [] } } };
  await showMobileAttention();
  const keep = tree.root.findByProps({ label: 'Keep' }).props.onPress;
  const reject = tree.root.findByProps({ label: 'Reject' }).props.onPress;
  await act(async () => { keep(); reject(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0].payload.accepted).toBe(true);
  await resizeWorkspace(1440);
  expect(tree.root.findByProps({ label: 'Keep changes' }).props.disabled).toBe(true);
  expect(tree.root.findByProps({ label: 'Reject' }).props.disabled).toBe(true);
  expect(routes).toHaveLength(0);
  await act(async () => { requests[0].result.reject(new Error('Review not confirmed')); await flush(); });
  expect(textOf(tree.root)).toContain('Check the desktop before trying again');
});

const useRemoteVoice = async () => {
  control.snapshot = { ...control.snapshot, settings: [{ id: 'voice.output.provider', value: 'remote' }] };
  await showResponses();
};
const completeAudio = async (index: number) => {
  await act(async () => {
    requests[index].result.resolve({ data: { audioBase64: 'YXVkaW8=', mimeType: 'audio/mpeg' } });
    await flush();
  });
};

test('Listen targets its originating chat and cancels a delayed response across A to B to A', async () => {
  await useRemoteVoice(); await openResponse(); await tap('Listen');
  expect(requests[0]).toMatchObject({ command: 'voice.synthesize', payload: {
    sessionId: 'chat-a', projectId: 'project-a', text: 'Response A',
  } });
  expect(button('Cancel audio')).toBeDefined();
  await switchChat('chat-b'); await switchChat('chat-a');
  await completeAudio(0);
  expect(createPlayer).not.toHaveBeenCalled();
  expect(writtenFiles).toHaveLength(0);
  expect(button('Cancel audio')).toBeUndefined();
});

for (const change of ['chat', 'host', 'blur', 'background', 'unmount'] as const) {
  test(`pending system voice lookup cannot speak after ${change}`, async () => {
    await showResponses(); voicesGate = deferred();
    await openResponse(); await tap('Listen');
    expect(voiceLookup).toHaveBeenCalledTimes(1);
    if (change === 'chat') { await switchChat('chat-b'); await switchChat('chat-a'); }
    if (change === 'host') await switchChat('chat-a', 'host-b');
    if (change === 'blur') { focused = false; await render(); }
    if (change === 'background') await act(async () => {
      appState.currentState = 'background'; appListeners.forEach((listener) => listener('background')); await flush();
    });
    if (change === 'unmount') await act(async () => { tree.unmount(); await flush(); });
    await act(async () => { voicesGate!.resolve([]); await flush(); });
    expect(speak).not.toHaveBeenCalled();
  });
}

test('cancel during asynchronous speech stop prevents both lookup and playback', async () => {
  await showResponses(); speechStopGate = deferred();
  await openResponse(); await tap('Listen');
  await tap('Close message actions'); await tap('Cancel audio');
  await act(async () => { speechStopGate!.resolve(undefined); await flush(); });
  expect(voiceLookup).not.toHaveBeenCalled();
  expect(speak).not.toHaveBeenCalled();
});

test('a new Listen supersedes pending synthesis without playing the old response', async () => {
  await useRemoteVoice(); await openResponse(); await tap('Listen');
  await tap('Close message actions'); await openResponse('B'); await tap('Listen');
  expect(requests).toHaveLength(2);
  await completeAudio(1); await completeAudio(0);
  expect(createPlayer).toHaveBeenCalledTimes(1);
  expect(players[0].play).toHaveBeenCalledTimes(1);
  expect(writtenFiles).toHaveLength(1);
  await act(async () => { players[0].emit({ playing: true }); });
  await tap('Stop audio');
  expect(players[0].release).toHaveBeenCalledTimes(1);
  expect(removedFiles).toEqual(writtenFiles);
});

test('a delayed system stop settles before replacement speech starts, even across remount', async () => {
  await showResponses(); await openResponse(); await tap('Listen');
  expect(speeches).toHaveLength(1);
  speechStopGate = deferred();
  await act(async () => { tree.unmount(); await flush(); });
  await act(async () => { tree = TestRenderer.create(<MobileWorkspaceView />); await flush(); });
  await openResponse('B'); await tap('Listen');
  expect(speeches).toHaveLength(1);
  await act(async () => { speechStopGate!.resolve(undefined); await flush(); });
  expect(speeches.map((speech) => speech.text)).toEqual(['Response A', 'Response B']);
  await act(async () => { speeches[0].options.onDone(); });
  expect(button('Stop audio')).toBeDefined();
});

for (const event of ['completion', 'error', 'background', 'unmount'] as const) {
  test(`generated audio releases its player and cache file on ${event}`, async () => {
    await useRemoteVoice(); await openResponse(); await tap('Listen'); await completeAudio(0);
    expect(players).toHaveLength(1);
    await act(async () => {
      if (event === 'completion') players[0].emit({ didJustFinish: true });
      if (event === 'error') players[0].emit({ error: 'unsupported audio' });
      if (event === 'background') {
        appState.currentState = 'background'; appListeners.forEach((listener) => listener('background'));
      }
      if (event === 'unmount') tree.unmount();
      await flush();
    });
    expect(players[0].release).toHaveBeenCalledTimes(1);
    expect(removedFiles).toEqual(writtenFiles);
    if (event === 'error') expect(textOf(tree.root)).toContain('unsupported audio');
  });
}

test('system speech failure is visible, and a stale failure cannot overwrite another host', async () => {
  await showResponses(); await openResponse(); await tap('Listen');
  await act(async () => { speeches[0].options.onError(new Error('voice unavailable')); });
  expect(textOf(tree.root)).toContain('voice unavailable');
  await openResponse(); await tap('Listen');
  await switchChat('chat-a', 'host-b');
  await act(async () => { speeches[1].options.onError(new Error('old host failure')); });
  expect(textOf(tree.root)).not.toContain('old host failure');
});

test('unsupported synthesis content produces a visible error without creating a player', async () => {
  await useRemoteVoice(); await openResponse(); await tap('Listen');
  await act(async () => { requests[0].result.resolve({ data: { audioBase64: 'abc', mimeType: 'text/html' } }); await flush(); });
  expect(textOf(tree.root)).toContain('supported speech audio');
  expect(createPlayer).not.toHaveBeenCalled();
});

test('cancelling while the speech file is being written cleans it only after writing settles', async () => {
  fileWriteGate = deferred();
  await useRemoteVoice(); await openResponse(); await tap('Listen'); await completeAudio(0);
  expect(createPlayer).not.toHaveBeenCalled();
  await tap('Cancel audio');
  expect(removedFiles).toHaveLength(0);
  await act(async () => { fileWriteGate!.resolve(undefined); await flush(); });
  expect(createPlayer).not.toHaveBeenCalled();
  expect(writtenFiles).toHaveLength(1);
  expect(removedFiles).toEqual(writtenFiles);
});

test('connection identity distinguishes connecting, disconnected, failed, and connected states', async () => {
  for (const [connection, label] of [
    ['connecting', 'Connecting…'], ['disconnected', 'Disconnected'],
    ['error', 'Connection lost'], ['connected', 'Connected'],
  ]) {
    control.live = { ...control.live, connection }; await render();
    expect(textOf(tree.root)).toContain(`Audit host · ${label}`);
  }
});

test('double Send snapshots one explicit destination and preserves both drafts after rejection', async () => {
  await type(' original  ');
  const press = button('Send').props.onPress;
  await act(async () => { press(); press(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0].payload).toMatchObject({ sessionId: 'chat-a', projectId: 'project-a', body: 'original' });
  await type('newer typing');
  await act(async () => { requests[0].result.reject(new Error('lost acknowledgement')); await flush(); });
  expect(input().props.value).toBe('newer typing');
  expect(control.composerDrafts.read(key()).saved[0].body).toBe(' original  ');
  await tap('Restore saved draft');
  expect(input().props.value).toBe(' original  ');
  expect(control.composerDrafts.read(key()).saved[0].body).toBe('newer typing');
  expect(requests).toHaveLength(1);
});

test('late preview cannot send after A to B to A navigation', async () => {
  preview = deferred(); await type('stay in A'); await tap('Send');
  await switchChat('chat-b'); await switchChat('chat-a');
  await act(async () => { preview!.resolve({}); await flush(); });
  expect(requests).toHaveLength(0);
  expect(input().props.value).toBe('stay in A');
});

for (const change of ['model', 'reasoning', 'fast', 'blur', 'host', 'question', 'run'] as const) {
  test(`preflight is invalidated by ${change}`, async () => {
    preview = deferred(); await type('keep me'); await tap('Send');
    if (change === 'model') control.modelChoices = { 'chat-a': { selection: 'local:other' } };
    if (change === 'reasoning') control.modelChoices = { 'chat-a': { selection: 'local:text', reasoningLevel: 'high' } };
    if (change === 'fast') control.modelChoices = { 'chat-a': { selection: 'local:text', fastMode: true } };
    if (change === 'blur') focused = false;
    if (change === 'host') control.pairing = { machineId: 'host-b', baseUrl: 'https://host-b.test' };
    if (change === 'question') control.live = { ...control.live, questions: { 'chat-a': { questionId: 'q', question: 'Confirm' } } };
    if (change === 'run') control.live = { ...control.live, runs: { 'chat-a': { status: 'active' } } };
    await render();
    await act(async () => { preview!.resolve({}); await flush(); });
    expect(requests).toHaveLength(0);
    expect(control.composerDrafts.read(key()).body).toBe('keep me');
  });
}

test('editing during an image preference read cancels the send', async () => {
  await act(async () => { control.composerDrafts.setAttachments(key(), () => [image]); });
  preferenceRead = deferred(); await type('image prompt'); await tap('Send');
  await type('updated prompt');
  await act(async () => { preferenceRead!.resolve(null); await flush(); });
  expect(requests).toHaveLength(0);
  expect(button('Remember my choice')).toBeUndefined();
});

test('double image consent cannot dispatch twice while saving a preference', async () => {
  await act(async () => { control.composerDrafts.setAttachments(key(), () => [image]); });
  await type('image prompt'); await tap('Send'); await tap('Remember my choice');
  preferenceWrite = deferred();
  const press = button('Continue without imagesSend text only.').props.onPress;
  await act(async () => { press(); press(); await flush(); });
  await type('revised while remembering');
  await act(async () => { preferenceWrite!.resolve(undefined); await flush(); });
  expect(requests).toHaveLength(0);
  expect(input().props.value).toBe('revised while remembering');
});

test('remote agent consent is scoped and duplicate confirmation sends once', async () => {
  control.snapshot = { ...control.snapshot, modelCatalog: [{ ...control.snapshot.modelCatalog[0], remoteAgentic: true }] };
  await render(); await type('remote prompt'); await tap('Send');
  const press = button('Send files and run').props.onPress;
  await act(async () => { press(); press(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0].payload.sessionId).toBe('chat-a');
});

for (const source of ['picker', 'clipboard'] as const) {
  test(`late ${source} belongs to its originating chat`, async () => {
    if (source === 'picker') picker = deferred(); else clipboard = deferred();
    await menuAction(source === 'picker' ? 'Add files or images' : 'Paste image');
    await switchChat('chat-b', 'host-b');
    await act(async () => {
      if (source === 'picker') picker!.resolve([image]); else clipboard!.resolve({ data: 'data:image/png;base64,eA==' });
      await flush();
    });
    expect(control.composerDrafts.read(key()).attachments).toHaveLength(1);
    expect(control.composerDrafts.read(key('chat-b', 'host-b')).attachments).toHaveLength(0);
  });
}

test('no-chat state disables Send and offers chat selection', async () => {
  await switchChat(''); await type('not sent');
  expect(button('Send').props.disabled).toBe(true);
  expect(textOf(tree.root)).toContain('Choose a chat to begin');
  await tap('Open chats to choose or create a conversation');
  await tap('Choose or create a chat to send a message');
  expect(routes).toContain('/chats'); expect(requests).toHaveLength(0);
});

test('offline empty state explains reconnect and keeps the draft intact', async () => {
  await type('Do not lose this draft');
  control.live = { ...control.live, connection: 'disconnected' };
  await render();
  expect(textOf(tree.root)).toContain('Waiting for your computer');
  expect(textOf(tree.root)).toContain('Your draft stays here');
  await tap('Open connection settings');
  expect(routes).toContain('/machines');
  expect(input().props.value).toBe('Do not lose this draft');
  control.live = { ...control.live, connection: 'connected' };
  await render();
  expect(textOf(tree.root)).toContain('Ready for your next message');
  expect(input().props.value).toBe('Do not lose this draft');
  expect(requests).toHaveLength(0);
});

test('disconnected no-chat state prioritizes restoring the desktop before choosing a chat', async () => {
  await switchChat('');
  control.live = { ...control.live, connection: 'error' };
  await render();
  expect(textOf(tree.root)).toContain('Reconnect to choose a chat');
  expect(textOf(tree.root)).toContain('Check the connection in Machines');
  const connectionAction = button('Open connection settings');
  const chatsAction = button('Open chats to choose or create a conversation');
  const actions = tree.root.findAll((node) => node.type === 'Pressable' &&
    (node === connectionAction || node === chatsAction));
  expect(actions).toEqual([connectionAction, chatsAction]);
  expect(connectionAction.props.style({ pressed: false })).toContainEqual(expect.objectContaining({ backgroundColor: expect.any(String) }));
  await tap('Open chats to choose or create a conversation');
  await tap('Open connection settings');
  expect(routes).toEqual(['/chats', '/machines']);
  expect(requests).toHaveLength(0);
});

test('Chats prevents duplicate creation, gives failure feedback, and only returns on confirmation', async () => {
  await act(async () => { tree.update(<MobileChatsView />); await flush(); });
  expect(textOf(tree.root)).toContain('No chats in this project');
  const create = button('Create first chat').props.onPress;
  const headerCreate = button('New chat').props.onPress;
  await act(async () => { create(); headerCreate(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0].command).toBe('session.create');
  expect(button('New chat').props.disabled).toBe(true);
  expect(routes).toHaveLength(0);
  await act(async () => { requests[0].result.reject(new Error('socket refused')); await flush(); });
  expect(textOf(tree.root)).toContain('A new chat was not confirmed');
  expect(button('New chat').props.disabled).toBe(true);
  expect(routes).toHaveLength(0);
  await tap('Reviewed chat list, allow another chat');
  expect(button('New chat').props.disabled).not.toBe(true);
  await tap('New chat');
  expect(requests).toHaveLength(2);
  await act(async () => { requests[1].result.resolve({ accepted: true, sessionId: 'created-chat' }); await flush(); });
  expect(routes).toHaveLength(0);
  expect(button('New chat').props.disabled).toBe(true);
  await act(async () => {
    control.snapshot = {
      ...control.snapshot,
      activeSessionId: 'created-chat',
      sessions: [{ id: 'created-chat', projectId: 'project-a', title: 'New chat', updatedAt: 'Today' }],
    };
    tree.update(<MobileChatsView />);
    await flush();
  });
  expect(routes).toEqual(['back']);
});

test('Controls prevents duplicate chat creation and preserves recovery on rejection', async () => {
  await act(async () => { tree.update(<MobileControlHub />); await flush(); });
  expect(button('New chat').props.accessibilityRole).toBe('button');
  const create = button('New chat').props.onPress;
  await act(async () => { create(); create(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ command: 'session.create', payload: { projectId: 'project-a' } });
  expect(button('New chat').props.disabled).toBe(true);
  expect(button('New chat').props.accessibilityState.busy).toBe(true);
  expect(textOf(tree.root)).toContain('Creating chat…');
  expect(routes).toHaveLength(0);
  await act(async () => { requests[0].result.reject(new Error('socket refused')); await flush(); });
  expect(textOf(tree.root)).toContain('A new chat was not confirmed');
  expect(button('New chat').props.disabled).not.toBe(true);
  expect(routes).toHaveLength(0);
  await tap('New chat');
  expect(requests).toHaveLength(2);
  await act(async () => { requests[1].result.resolve({ accepted: true, sessionId: 'created-chat' }); await flush(); });
  expect(routes).toHaveLength(0);
  expect(button('New chat').props.disabled).toBe(true);
  await act(async () => {
    control.snapshot = { ...control.snapshot, activeSessionId: 'created-chat' };
    tree.update(<MobileControlHub />);
    await flush();
  });
  expect(routes).toEqual(['back']);
  expect(textOf(tree.root)).not.toContain('A new chat was not confirmed');
});

test('Controls does not navigate after chat rejection or while a previous screen is gone', async () => {
  await act(async () => { tree.update(<MobileControlHub />); await flush(); });
  await tap('New chat');
  await act(async () => { requests[0].result.resolve({ accepted: false }); await flush(); });
  expect(routes).toHaveLength(0);
  expect(textOf(tree.root)).toContain('A new chat was not confirmed');
  await tap('New chat');
  await act(async () => { tree.update(<MobileChatsView />); await flush(); });
  await act(async () => { requests[1].result.resolve({ accepted: true }); await flush(); });
  expect(routes).toHaveLength(0);
});

test('Chats marks active selection offline when the host stream is disconnected', async () => {
  control.snapshot = { ...control.snapshot, sessions: [{ id: 'chat-a', title: 'My chat',
    projectId: 'project-a', updatedAt: 'Today' }] };
  control.live = { ...control.live, connection: 'disconnected' };
  await act(async () => { tree.update(<MobileChatsView />); await flush(); });
  expect(tree.root.findByType('StatusDot' as any).props.status).toBe('offline');
});

test('Chats keeps session list open after failed selection and blocks duplicate presses', async () => {
  control.snapshot = { ...control.snapshot, sessions: [{ id: 'chat-a', title: 'My chat',
    projectId: 'project-a', updatedAt: 'Today' }] };
  await act(async () => { tree.update(<MobileChatsView />); await flush(); });
  const choose = tree.root.findAll((node) => node.type === 'Pressable' &&
    textOf(node).includes('My chat'))[0]?.props.onPress;
  expect(choose).toBeDefined();
  await act(async () => { choose(); choose(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ command: 'session.select', payload: { sessionId: 'chat-a' } });
  await act(async () => { requests[0].result.reject(new Error('offline')); await flush(); });
  expect(routes).toHaveLength(0);
  expect(textOf(tree.root)).toContain('chat selection');
});

test('Chats failed bulk deletion disarms confirmation and keeps the page open', async () => {
  await act(async () => { tree.update(<MobileChatsView />); await flush(); });
  await tap('More chat controls');
  await tap('Delete all chats');
  const confirm = button('Tap again to delete all chats').props.onPress;
  await act(async () => { confirm(); confirm(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0].command).toBe('session.delete_all');
  await act(async () => { requests[0].result.reject(new Error('not confirmed')); await flush(); });
  expect(routes).toHaveLength(0);
  expect(textOf(tree.root)).toContain('Chat deletion was not confirmed');
  expect(button('Delete all chats')).toBeDefined();
});

test('Stop locks synchronously and late failure does not appear in a different chat', async () => {
  control.live = { ...control.live, runs: { 'chat-a': { status: 'active' } } };
  await render();
  const press = button('Stop Koryphaios').props.onPress;
  await act(async () => { press(); press(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0].payload).toMatchObject({ sessionId: 'chat-a', projectId: 'project-a' });
  await switchChat('chat-b');
  await act(async () => { requests[0].result.reject(new Error('old stop failed')); await flush(); });
  expect(textOf(tree.root)).not.toContain('old stop failed');
});

test('Stop stays locked across a Workspace remount until the original command settles', async () => {
  control.live = { ...control.live, runs: { 'chat-a': { status: 'active' } } };
  await render(); await tap('Stop Koryphaios');
  const oldPress = button('Stop Koryphaios').props.onPress;
  await act(async () => { tree.unmount(); });
  await act(async () => { tree = TestRenderer.create(<MobileWorkspaceView />); await flush(); });
  expect(button('Stop Koryphaios').props.disabled).toBe(true);
  await act(async () => { oldPress(); button('Stop Koryphaios').props.onPress(); await flush(); });
  expect(requests).toHaveLength(1);
  await act(async () => { requests[0].result.resolve({ accepted: true }); await flush(); });
  expect(button('Stop Koryphaios').props.disabled).not.toBe(true);
});

for (const action of [
  ['Regenerate', 'message.regenerate'],
  ['Hide from this view', 'message.visibility'],
  ['Save as note', 'notes.chat_finding'],
  ['Response 2 of 2', 'message.select_variant'],
] as const) {
  test(`${action[0]} dispatches once with the menu's explicit chat/project`, async () => {
    await showResponses(); await openResponse();
    const press = button(action[0]).props.onPress;
    await act(async () => { press(); press(); await flush(); });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ command: action[1], payload: {
      sessionId: 'chat-a', projectId: 'project-a',
      messageId: action[1] === 'message.select_variant' ? 'alternative-A' : 'message-A',
    } });
    if (action[1] === 'message.select_variant') expect(requests[0].payload).toMatchObject({
      expectedActiveMessageId: 'message-A', expectedProviderConversationRevision: 3,
    });
    await act(async () => { requests[0].result.resolve({ accepted: true }); await flush(); });
    expect(button('Close message actions')).toBeUndefined();
  });
}

test('delete confirmation resets on dismiss, a different message, and failure', async () => {
  await showResponses(); await openResponse(); await tap('Delete message');
  const staleDelete = button('Tap again to delete').props.onPress;
  await tap('Close message actions'); await openResponse();
  expect(button('Delete message')).toBeDefined();
  await act(async () => { staleDelete(); await flush(); });
  expect(requests).toHaveLength(0);
  await tap('Delete message'); await tap('Close message actions'); await openResponse('B');
  expect(button('Delete message')).toBeDefined();
  await tap('Delete message');
  const confirm = button('Tap again to delete').props.onPress;
  await act(async () => { confirm(); confirm(); await flush(); });
  expect(requests).toHaveLength(1);
  expect(requests[0].payload).toMatchObject({ sessionId: 'chat-a', projectId: 'project-a', messageId: 'message-B' });
  await act(async () => { requests[0].result.reject(new Error('delete not confirmed')); await flush(); });
  expect(button('Close message actions')).toBeDefined();
  expect(button('Delete message')).toBeDefined();
  expect(textOf(tree.root)).toContain('delete not confirmed');
});

for (const reopened of ['A', 'B']) {
  test(`an older completion cannot close a reopened menu for response ${reopened}`, async () => {
    await showResponses(); await openResponse(); await tap('Regenerate');
    await tap('Close message actions'); await openResponse(reopened);
    if (reopened === 'A') {
      expect(button('Regenerating…').props.disabled).toBe(true);
      await act(async () => { button('Regenerating…').props.onPress(); await flush(); });
      expect(requests).toHaveLength(1);
    }
    await act(async () => { requests[0].result.resolve({ accepted: true }); await flush(); });
    expect(button('Close message actions')).toBeDefined();
    expect(button('Regenerate').props.disabled).not.toBe(true);
  });
}

test('message actions reject stale A to B to A callbacks and ignore another host’s late failure', async () => {
  await showResponses(); await openResponse();
  const stalePress = button('Hide from this view').props.onPress;
  await switchChat('chat-b'); await switchChat('chat-a');
  await act(async () => { stalePress(); await flush(); });
  expect(requests).toHaveLength(0);
  await openResponse(); await tap('Regenerate');
  await switchChat('chat-a', 'host-b'); await openResponse(); await tap('Hide from this view');
  expect(requests).toHaveLength(2);
  await act(async () => { requests[0].result.reject(new Error('old host failed')); await flush(); });
  expect(textOf(tree.root)).not.toContain('old host failed');
  expect(button('Hiding…').props.disabled).toBe(true);
  await act(async () => { requests[1].result.resolve({ accepted: true }); await flush(); });
});

test('failed transcription preserves recording separately from newer typing', async () => {
  await type('typed draft'); await menuAction('Dictate'); await tap('Stop dictation');
  expect(requests[0].command).toBe('voice.transcribe');
  await type('new typing');
  await act(async () => { requests[0].result.reject(new Error('transcription offline')); await flush(); });
  expect(input().props.value).toBe('new typing');
  expect(control.composerDrafts.read(key()).saved[0].attachments[0].data).toBe('YXVkaW8=');
});

test('leaving the chat stops dictation and preserves audio without remote transcription', async () => {
  await menuAction('Dictate'); expect(recorder.record).toHaveBeenCalledTimes(1);
  await switchChat('chat-b');
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(0);
  expect(control.composerDrafts.read(key()).saved[0].attachments[0].mimeType).toBe('audio/mp4');
  expect(control.composerDrafts.read(key('chat-b')).saved).toHaveLength(0);
});

test('backgrounding stops dictation and late preparation never starts a hidden recording', async () => {
  prepare = deferred(); await menuAction('Dictate');
  await act(async () => {
    appState.currentState = 'background'; appListeners.forEach((listener) => listener('background')); await flush();
  });
  await act(async () => { prepare!.resolve(undefined); await flush(); });
  expect(recorder.record).toHaveBeenCalledTimes(0);
  expect(requests).toHaveLength(0);
});

test('oversized dictation stays on disk, offers export, and never enters a send', async () => {
  recordingSize = MAX_COMPOSER_ATTACHMENT_BYTES + 1;
  await type('Keep my typed work'); await menuAction('Dictate'); await tap('Stop dictation');
  expect(readRecording).not.toHaveBeenCalled();
  expect(requests).toHaveLength(0);
  expect(input().props.value).toBe('Keep my typed work');
  const recovery = control.composerDrafts.read(key()).saved[0];
  expect(recovery.attachments).toHaveLength(0);
  expect(recovery.localRecording.uri).toMatch(/^file:\/\/\/documents\//);
  expect(removedFiles).toHaveLength(0);
  expect(button('Restore saved draft')).toBeUndefined();
  await tap('Export recording');
  expect(shareRecording).toHaveBeenCalledWith(recovery.localRecording.uri, {
    mimeType: 'audio/mp4', dialogTitle: 'Export recording',
  });
  expect(control.composerDrafts.read(key()).saved).toHaveLength(1);
});

test('unreadable dictation retains an exportable recording and shows export failure', async () => {
  recordingReadError = new Error('file read failed');
  await menuAction('Dictate'); await tap('Stop dictation');
  expect(recorder.release).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(0);
  expect(removedFiles).toHaveLength(0);
  expect(control.composerDrafts.read(key()).saved[0].localRecording).toBeDefined();
  shareAvailable = false;
  await tap('Export recording');
  expect(textOf(tree.root)).toContain('File export is unavailable');
  expect(shareRecording).not.toHaveBeenCalled();
});

const referenceInput = () => tree.root.findAll((node) => node.type === 'TextInput' &&
  node.props.placeholder === 'Find a file or folder')[0];
const searchFor = async (query: string) => {
  await act(async () => { referenceInput().props.onChangeText(query); await flush(); });
  await tap('Search workspace');
};

test('reference searches lock synchronously and newer queries own their results', async () => {
  const searches: { payload: any; result: ReturnType<typeof deferred> }[] = [];
  control.inspect = (_kind: string, payload: any) => {
    const result = deferred(); searches.push({ payload, result }); return result.promise;
  };
  await menuAction('Reference workspace');
  const submit = referenceInput().props.onSubmitEditing;
  await act(async () => { submit(); submit(); await flush(); });
  expect(searches).toHaveLength(1);
  expect(searches[0].payload).toMatchObject({ sessionId: 'chat-a', projectId: 'project-a' });
  await searchFor('new');
  expect(searches).toHaveLength(2);
  await act(async () => { searches[1].result.resolve({ files: ['new/file.ts'] }); await flush(); });
  await act(async () => { searches[0].result.resolve({ files: ['old/file.ts'] }); await flush(); });
  expect(button('Reference new/file.ts')).toBeDefined();
  expect(button('Reference old/file.ts')).toBeUndefined();
  await tap('Reference new/file.ts');
  expect(input().props.value).toBe('@new/file.ts ');
});

test('closed reference picker cannot accept old results after reopen or host change', async () => {
  const searches: ReturnType<typeof deferred>[] = [];
  control.inspect = () => { const result = deferred(); searches.push(result); return result.promise; };
  await menuAction('Reference workspace');
  await tap('Close workspace reference picker');
  await menuAction('Reference workspace');
  await act(async () => { searches[0].reject(new Error('stale picker error')); await flush(); });
  expect(textOf(tree.root)).not.toContain('stale picker error');
  expect(button('Search workspace').props.disabled).toBe(true);
  await switchChat('chat-a', 'host-b');
  await act(async () => { searches[1].resolve({ files: ['old-host-secret.ts'] }); await flush(); });
  expect(textOf(tree.root)).not.toContain('old-host-secret.ts');
  expect(control.composerDrafts.read(key('chat-a', 'host-b')).body).toBe('');
});
}
