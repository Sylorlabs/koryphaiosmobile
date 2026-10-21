import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Link2, ShieldCheck, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseDevicePairingLink, validateDevicePairingLink } from '@koryphaios/shared/src/device-pairing-link';
import { useLinkedDevices } from '../control/LinkedDeviceProvider';
import { ActionButton } from './ui';
import { LinkedDesktopPanel } from './LinkedDesktopPanel';
import { colors, radii, spacing } from '../theme/tokens';

export function DevicePairingView() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ relay?: string | string[]; code?: string | string[]; host?: string | string[]; v?: string | string[] }>();
  const { pair, ready, busy, error, verification, cancelPairing } = useLinkedDevices();
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraView, setCameraView] = useState<React.ComponentType<any> | null>(null);
  // Native QR callbacks can arrive several times before React commits state.
  // Reserve the pairing attempt synchronously so one scan never links twice.
  const pairingInFlight = useRef(false);
  const scannerOpening = useRef(false);
  const scannerActive = useRef(false);
  useEffect(() => {
    if (params.code === undefined) return;
    const timer = setTimeout(() => {
      try {
        if (typeof params.relay !== 'string' || typeof params.code !== 'string' ||
            typeof params.host !== 'string' || params.v !== '1') throw new Error('Invalid pairing QR code');
        validateDevicePairingLink({ relayUrl: params.relay, code: params.code, hostId: params.host });
        cancelPairing();
        setLinkText(`koryphaios://link-device?${new URLSearchParams({ v: '1', relay: params.relay, code: params.code, host: params.host })}`);
        setLinkError('');
      } catch (caught) { setLinkError(caught instanceof Error ? caught.message : 'Invalid pairing QR code'); }
      router.setParams({ relay: undefined, code: undefined, host: undefined, v: undefined });
    }, 0);
    return () => clearTimeout(timer);
  }, [params.relay, params.code, params.host, params.v, cancelPairing]);

  async function submit() {
    if (pairingInFlight.current || busy || !linkText.trim()) return;
    pairingInFlight.current = true;
    setLinkError('');
    try { await pair(parseDevicePairingLink(linkText.trim())); }
    catch (caught) { setLinkError(caught instanceof Error ? caught.message : 'Invalid app pairing link'); }
    finally { pairingInFlight.current = false; }
  }

  async function openScanner() {
    if (scannerOpening.current || scannerActive.current || pairingInFlight.current) return;
    scannerOpening.current = true;
    setLinkError('');
    try {
      const camera = await import('expo-camera');
      const permission = await camera.Camera.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setLinkError('Enable camera access in iOS Settings or paste the desktop pairing link.');
        return;
      }
      setCameraView(() => camera.CameraView);
      scannerActive.current = true;
      setScannerOpen(true);
    } catch {
      setLinkError('QR scanning needs the current Koryphaios app build. You can still paste the pairing link below.');
    } finally { scannerOpening.current = false; }
  }

  function closeScanner() {
    scannerActive.current = false;
    setScannerOpen(false);
  }

  async function handleScanned(data: string) {
    if (!scannerActive.current || pairingInFlight.current || !data) return;
    pairingInFlight.current = true;
    closeScanner();
    setLinkText(data);
    setLinkError('');
    try {
      await pair(parseDevicePairingLink(data.trim()));
    } catch (caught) {
      setLinkError(caught instanceof Error ? caught.message : 'Invalid pairing QR code');
    } finally {
      pairingInFlight.current = false;
    }
  }

  const CameraView = cameraView;
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.card}>
      <ShieldCheck size={26} color={colors.accent} />
      <Text style={styles.title}>Link your desktop</Text>
      <Text style={styles.body}>On your desktop, open Link device → Phone or tablet → Generate QR code. Scan it with your camera to open Koryphaios Mobile here.</Text>
      {verification ? <>
        <Text style={styles.title}>{verification.identity.name}</Text>
        <Text selectable accessibilityLabel={`Verification numbers ${verification.check}`} style={styles.check}>{verification.check}</Text>
        {verification.approved ? (
          <View style={styles.actions}>
            <ActionButton primary label="Open Koryphaios" disabled={busy} onPress={() => router.replace('/workspace')} />
            <ActionButton label="Link another desktop" disabled={busy} onPress={() => { cancelPairing(); setLinkText(''); }} />
          </View>
        ) : (
          <>
            <Text style={styles.body}>Compare these numbers with your desktop, then approve the link there.</Text>
            <ActionButton label="Cancel pairing" disabled={busy} onPress={() => { cancelPairing(); setLinkText(''); }} />
          </>
        )}
      </> : <>
        <ActionButton label="Scan QR code" onPress={() => void openScanner()} />
        <TextInput accessibilityLabel="Koryphaios app pairing link" value={linkText} onChangeText={(value) => { setLinkText(value); setLinkError(''); }} autoCapitalize="none" autoCorrect={false} placeholder="Paste app pairing link" placeholderTextColor={colors.textMuted} style={styles.input} />
        <ActionButton primary icon={Link2} label="Link desktop" loading={busy} disabled={!ready || !linkText.trim()} onPress={() => void submit()} />
      </>}
      {linkError || error ? <Text accessibilityRole="alert" style={styles.error}>{linkError || error}</Text> : null}
    </View>
    <LinkedDesktopPanel />
  <Modal visible={scannerOpen} animationType="slide" onRequestClose={closeScanner}>
      {CameraView ? <CameraView
        style={styles.scanner}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={(result: { data?: string }) => void handleScanned(result.data ?? '')}
        onMountError={() => {
          closeScanner();
          setLinkError('Camera preview could not start. Paste the desktop pairing link instead.');
        }}
      /> : null}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close QR scanner"
          onPress={closeScanner}
          style={({ pressed }) => [
            styles.closeScanner,
            { top: Math.max(insets.top, spacing.sm) + spacing.xs },
            pressed && styles.pressed,
          ]}
        >
          <X size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={[styles.scanHint, { bottom: Math.max(insets.bottom, spacing.md) + spacing.lg }]}>
          <Text style={styles.scanHintText}>Point at the QR code on your desktop</Text>
        </View>
      </View>
    </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  title: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
  input: { color: colors.textPrimary, backgroundColor: colors.surface1, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  check: { color: colors.accent, fontSize: 36, fontWeight: '700', letterSpacing: 4 },
  actions: { gap: spacing.sm },
  error: { color: colors.error, fontSize: 13 },
  scanner: { flex: 1 },
  closeScanner: { position: 'absolute', right: spacing.md, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  scanHint: { position: 'absolute', alignSelf: 'center', maxWidth: 300, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.xl, backgroundColor: colors.surface2 },
  scanHintText: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
