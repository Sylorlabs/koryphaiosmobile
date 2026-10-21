import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Monitor, Unplug } from 'lucide-react-native';

import { useLinkedDevices } from '../control/LinkedDeviceProvider';
import { colors, radii, spacing } from '../theme/tokens';
import { ActionButton, StatusDot } from './ui';

export function LinkedDesktopPanel() {
  const { links, activeHostId, ready, selectHost, unlink } = useLinkedDevices();
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  if (!ready || !links.length) return null;

  async function open(hostId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyId(hostId);
    setError('');
    try {
      await selectHost(hostId);
      router.replace('/workspace');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open this desktop');
    } finally {
      inFlight.current = false;
      setBusyId('');
    }
  }

  async function remove(hostId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyId(hostId);
    setError('');
    try {
      await unlink(hostId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not unlink this desktop');
    } finally {
      inFlight.current = false;
      setBusyId('');
    }
  }

  function confirmRemove(hostId: string, hostName: string) {
    if (inFlight.current) return;
    Alert.alert(
      `Unlink ${hostName}?`,
      'This desktop will need to be paired again to regain access.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlink', style: 'destructive', onPress: () => void remove(hostId) },
      ],
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Linked desktops</Text>
      <View style={styles.list}>
        {links.map((link) => {
          const active = link.peer.id === activeHostId;
          return (
            <View
              key={link.peer.id}
              style={[
                styles.host,
                active && styles.hostActive,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${link.peer.name}, ${link.peer.online ? 'online' : 'offline'}`}
                accessibilityState={{ selected: active, disabled: Boolean(busyId) }}
                disabled={Boolean(busyId)}
                onPress={() => void open(link.peer.id)}
                style={({ pressed }) => [styles.openHost, pressed && styles.pressed]}
              >
                <Monitor size={17} color={active ? colors.accent : colors.textSecondary} />
                <View style={styles.copy}>
                  <View style={styles.nameRow}>
                    <StatusDot status={link.peer.online ? 'online' : 'offline'} size={6} />
                    <Text numberOfLines={1} style={styles.name}>{link.peer.name}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.meta}>{link.peer.os}</Text>
                </View>
              </Pressable>
              <ActionButton
                label="Unlink"
                accessibilityLabel={`Unlink ${link.peer.name}`}
                icon={Unplug}
                disabled={Boolean(busyId)}
                loading={busyId === link.peer.id}
                onPress={() => confirmRemove(link.peer.id, link.peer.name)}
              />
            </View>
          );
        })}
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  list: { gap: spacing.xs },
  host: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  openHost: { flex: 1, minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hostActive: { backgroundColor: colors.surface3 },
  pressed: { opacity: 0.76 },
  copy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  error: { color: colors.error, fontSize: 12 },
});
