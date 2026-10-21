import { expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

// Keep native module mocks isolated from all other app integration suites.
if (process.env.KORYPHAIOS_PAIRING_VIEW_TEST_CHILD !== '1') {
  test('QR and pasted pairing links admit one in-flight attempt and recover from camera failure', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_PAIRING_VIEW_TEST_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Pairing view tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text',
    TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
  }));
  mock.module('expo-router', () => ({
    router: { replace: () => {}, setParams: () => {} },
    useLocalSearchParams: () => ({}),
  }));
  mock.module('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }));
  mock.module('lucide-react-native', () => ({ Link2: 'Link2', ShieldCheck: 'ShieldCheck', X: 'X' }));
  mock.module('../src/theme/tokens', () => ({
    colors: { accent: '#888', textPrimary: '#fff', textSecondary: '#aaa', textMuted: '#aaa', border: '#333',
      surface2: '#222', surface1: '#111', error: '#f00' },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16 }, radii: { md: 8, lg: 12, xl: 16 },
  }));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
  }));
  mock.module('../src/components/LinkedDesktopPanel', () => ({ LinkedDesktopPanel: () => null }));
  mock.module('@koryphaios/shared/src/device-pairing-link', () => ({
    parseDevicePairingLink: (value: string) => {
      if (!value.startsWith('koryphaios://')) throw new Error('Invalid app pairing link');
      return { code: 'valid-test-code' };
    },
    validateDevicePairingLink: () => {},
  }));

  let permissionGranted = true;
  let pairCalls = 0;
  let pairWait: Promise<void> | null = null;
  const control = {
    ready: true, busy: false, error: '', verification: null,
    cancelPairing: () => {},
    pair: async () => { pairCalls++; await pairWait; },
  };
  mock.module('../src/control/LinkedDeviceProvider', () => ({ useLinkedDevices: () => control }));
  mock.module('expo-camera', () => ({
    Camera: { requestCameraPermissionsAsync: async () => ({ granted: permissionGranted }) },
    CameraView: 'CameraView',
  }));

  const { DevicePairingView } = await import('../src/components/DevicePairingView');
  let tree: TestRenderer.ReactTestRenderer;
  const button = (label: string) => tree.root.findAllByType('ActionButton' as any)
    .find((element) => element.props.label === label);
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const mount = async () => {
    permissionGranted = true;
    pairCalls = 0;
    pairWait = null;
    await act(async () => { tree = TestRenderer.create(<DevicePairingView />); });
  };
  const unmount = async () => { await act(async () => { tree.unmount(); }); };
  const beginInFlight = () => {
    let resolve!: () => void;
    pairWait = new Promise<void>((done) => { resolve = done; });
    return resolve;
  };
  const allText = () => tree.root.findAllByType('Text' as any)
    .flatMap((element) => element.children.filter((value): value is string => typeof value === 'string'))
    .join(' ');

  test('one QR scan cannot submit twice from back-to-back camera callbacks', async () => {
    await mount();
    const release = beginInFlight();
    await act(async () => { button('Scan QR code')!.props.onPress(); await flush(); });
    const scanner = tree.root.findByType('CameraView' as any);
    await act(async () => {
      scanner.props.onBarcodeScanned({ data: 'koryphaios://link-device?code=test' });
      scanner.props.onBarcodeScanned({ data: 'koryphaios://link-device?code=test' });
      await flush();
    });
    expect(pairCalls).toBe(1);
    expect(tree.root.findByType('Modal' as any).props.visible).toBe(false);
    await act(async () => { release(); await flush(); });
    await unmount();
  });

  test('stale camera callbacks after closing the scanner cannot pair', async () => {
    await mount();
    await act(async () => { button('Scan QR code')!.props.onPress(); await flush(); });
    const oldCallback = tree.root.findByType('CameraView' as any).props.onBarcodeScanned;
    const close = tree.root.findAllByType('Pressable' as any)
      .find((element) => element.props.accessibilityLabel === 'Close QR scanner');
    await act(async () => { close!.props.onPress(); await flush(); });
    await act(async () => { oldCallback({ data: 'koryphaios://link-device?code=test' }); await flush(); });
    expect(pairCalls).toBe(0);
    await unmount();
  });

  test('rapid repeated taps on the pasted link submit once', async () => {
    await mount();
    const release = beginInFlight();
    const input = tree.root.findByType('TextInput' as any);
    await act(async () => { input.props.onChangeText('koryphaios://link-device?code=test'); });
    await act(async () => {
      button('Link desktop')!.props.onPress();
      button('Link desktop')!.props.onPress();
      await flush();
    });
    expect(pairCalls).toBe(1);
    await act(async () => { release(); await flush(); });
    await unmount();
  });

  test('camera permission denial and preview failure offer the paste fallback', async () => {
    await mount();
    permissionGranted = false;
    await act(async () => { button('Scan QR code')!.props.onPress(); await flush(); });
    expect(allText()).toContain('Enable camera access in iOS Settings');
    expect(pairCalls).toBe(0);
    permissionGranted = true;
    await act(async () => { button('Scan QR code')!.props.onPress(); await flush(); });
    const camera = tree.root.findByType('CameraView' as any);
    await act(async () => { camera.props.onMountError({ message: 'No available camera' }); await flush(); });
    expect(tree.root.findByType('Modal' as any).props.visible).toBe(false);
    expect(allText()).toContain('Camera preview could not start');
    expect(pairCalls).toBe(0);
    await unmount();
  });
}
