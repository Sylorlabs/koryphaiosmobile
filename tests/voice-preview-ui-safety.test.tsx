import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_VOICE_PREVIEW_CHILD !== '1') {
  test('voice preview UI preserves cancel, scope and single-flight semantics', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_VOICE_PREVIEW_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Voice preview regression failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  type Request = {
    name: string;
    resolve: (value: { accepted: boolean; data?: unknown }) => void;
    reject: (error: Error) => void;
  };
  let requests: Request[] = [];
  let voices: Promise<{ identifier: string; name: string }[]> = Promise.resolve([]);
  let speechCalls: { onDone?: () => void; onStopped?: () => void }[] = [];
  let stopCount = 0;
  let playbackCount = 0;
  let replaceCount = 0;
  let writes = 0;
  const pairing = { baseUrl: 'https://host-a.invalid', machineId: 'host-a' };
  const snapshot = { settings: [
    { id: 'voice.output.provider', value: 'system' },
    { id: 'voice.output.modelId', value: 'system-default' },
    { id: 'voice.output.voiceId', value: 'system-default' },
  ] };
  const control = {
    snapshot, pairing,
    sendCommand: (name: string) => new Promise<{ accepted: boolean; data?: unknown }>((resolve, reject) => {
      requests.push({ name, resolve, reject });
    }),
  };
  const player = {
    pause: () => undefined, seekTo: async () => undefined,
    replace: (_uri: string) => { replaceCount++; },
    play: () => { playbackCount++; },
  };

  mock.module('react-native', () => ({
    Pressable: 'Pressable', View: 'View', Text: 'Text',
    StyleSheet: { create: (styles: unknown) => styles },
  }));
  mock.module('expo-speech', () => ({
    stop: async () => { stopCount++; },
    getAvailableVoicesAsync: () => voices,
    speak: (_text: string, options: { onDone?: () => void; onStopped?: () => void }) => {
      speechCalls.push(options);
    },
  }));
  mock.module('expo-audio', () => ({
    useAudioPlayer: () => player,
    useAudioPlayerStatus: () => ({ playing: false }),
  }));
  mock.module('expo-file-system', () => ({
    File: class {
      uri = 'file:///preview.mp3';
      write() { writes++; }
    },
    Paths: { cache: '/tmp' },
  }));
  mock.module('lucide-react-native', () => ({ Play: 'Play', Square: 'Square' }));
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  mock.module('../src/theme/tokens', () => ({
    colors: { textPrimary: '#fff', textSecondary: '#ccc', textMuted: '#888', error: '#f00', surface2: '#222', surface3: '#333' },
    radii: { md: 8, lg: 12 }, spacing: { xxs: 2, xs: 4, sm: 8, md: 16 }, type: { xs: 12, sm: 14 },
  }));

  const { VoicePreviewControl } = await import('../src/components/VoicePreviewControl');
  let tree: TestRenderer.ReactTestRenderer;
  const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
  const button = () => tree.root.findByType('Pressable' as any);
  const copy = () => tree.root.findAllByType('Text' as any).map((item) => item.children.join(' ')).join(' ');
  const mount = async (provider: string) => {
    snapshot.settings[0].value = provider;
    requests = [];
    stopCount = 0;
    speechCalls = [];
    playbackCount = 0;
    replaceCount = 0;
    writes = 0;
    await act(async () => { tree = TestRenderer.create(<VoicePreviewControl />); });
  };
  const unmount = async () => { await act(async () => { tree.unmount(); }); };

  test('rapid system preview taps enqueue one utterance and expose a 44-point control', async () => {
    let finishVoices!: (v: { identifier: string; name: string }[]) => void;
    voices = new Promise((resolve) => { finishVoices = resolve; });
    await mount('system');
    await act(async () => { button().props.onPress(); button().props.onPress(); await flush(); });
    await act(async () => { finishVoices([]); await flush(); });
    expect(speechCalls).toHaveLength(1);
    expect(button().props.style({ pressed: false }).filter(Boolean)[0].minHeight).toBeGreaterThanOrEqual(44);
    await unmount();
  });

  test('remote preparation can be canceled and a late host response cannot start playback', async () => {
    await mount('acme-voice');
    await act(async () => { button().props.onPress(); button().props.onPress(); await flush(); });
    expect(requests).toHaveLength(1);
    expect(requests[0].name).toBe('voice.synthesize');
    expect(button().props.disabled).toBe(false);
    expect(button().props.accessibilityLabel).toContain('Cancel');
    await act(async () => { button().props.onPress(); await flush(); });
    await act(async () => {
      requests[0].resolve({ accepted: true, data: { audioBase64: 'ZGF0YQ==', mimeType: 'audio/mp3' } });
      await flush();
    });
    expect(playbackCount).toBe(0);
    expect(replaceCount).toBe(0);
    expect(writes).toBe(0);
    await unmount();
  });

  test('a changed machine invalidates pending audio and future preview starts cleanly', async () => {
    await mount('acme-voice');
    await act(async () => { button().props.onPress(); await flush(); });
    control.pairing = { baseUrl: 'https://host-b.invalid', machineId: 'host-b' };
    await act(async () => { tree.update(<VoicePreviewControl />); await flush(); });
    await act(async () => {
      requests[0].resolve({ accepted: true, data: { audioBase64: 'ZGF0YQ==', mimeType: 'audio/mp3' } });
      await flush();
    });
    expect(playbackCount).toBe(0);
    expect(button().props.accessibilityLabel).toBe('Test voice');
    await act(async () => { button().props.onPress(); await flush(); });
    expect(requests).toHaveLength(2);
    await unmount();
    control.pairing = pairing;
  });

  test('rejected synthesis retains visible error without playing an unconfirmed payload', async () => {
    await mount('acme-voice');
    await act(async () => { button().props.onPress(); await flush(); });
    await act(async () => {
      requests[0].resolve({ accepted: false, data: { audioBase64: 'ZGF0YQ==', mimeType: 'audio/mp3' } });
      await flush();
    });
    expect(playbackCount).toBe(0);
    expect(copy()).toContain('could not be confirmed');
    await unmount();
  });

  test('canceling a pending system voice lookup prevents a late utterance', async () => {
    let finishVoices!: (v: { identifier: string; name: string }[]) => void;
    voices = new Promise((resolve) => { finishVoices = resolve; });
    await mount('system');
    await act(async () => { button().props.onPress(); await flush(); });
    expect(button().props.accessibilityLabel).toBe('Cancel voice preview');
    await act(async () => { button().props.onPress(); await flush(); });
    await act(async () => { finishVoices([]); await flush(); });
    expect(speechCalls).toHaveLength(0);
    expect(button().props.accessibilityLabel).toBe('Test voice');
    await unmount();
  });

  test('a stale speech stopped callback cannot clear a newer preview', async () => {
    voices = Promise.resolve([]);
    await mount('system');
    await act(async () => { button().props.onPress(); await flush(); });
    expect(button().props.accessibilityLabel).toBe('Stop voice preview');
    const oldStopped = speechCalls[0].onStopped;
    await act(async () => { button().props.onPress(); await flush(); });
    await act(async () => { button().props.onPress(); await flush(); });
    expect(speechCalls).toHaveLength(2);
    await act(async () => { oldStopped?.(); await flush(); });
    expect(button().props.accessibilityLabel).toBe('Stop voice preview');
    await unmount();
  });

  test('unmounting before a host reply never writes or plays the returned audio', async () => {
    await mount('acme-voice');
    await act(async () => { button().props.onPress(); await flush(); });
    expect(requests).toHaveLength(1);
    await unmount();
    await act(async () => {
      requests[0].resolve({ accepted: true, data: { audioBase64: 'ZGF0YQ==', mimeType: 'audio/mp3' } });
      await flush();
    });
    expect(replaceCount).toBe(0);
    expect(playbackCount).toBe(0);
    expect(writes).toBe(0);
  });
}
