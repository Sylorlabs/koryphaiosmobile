import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  Monitor,
  RefreshCw,
  Smartphone,
  Unplug,
  X,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { machineDisplayName, machineLivePresentation, readableControlError } from '../control/connectionPresentation';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  DeviceInvitation,
  DeviceNetworkInspection,
  DevicePairResult,
  LinkedDevice,
} from '../types/control';
import { ActionButton, StatusDot } from './ui';
import { LinkedDesktopPanel } from './LinkedDesktopPanel';

function MiniToggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggleTarget,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.toggle, value && styles.toggleOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

function PeerRow({
  peer,
  busy,
  onGrants,
  onUnlink,
}: {
  peer: LinkedDevice;
  busy: boolean;
  onGrants: (peer: LinkedDevice, allowAgents: boolean, agentRouting: boolean) => void;
  onUnlink: (peer: LinkedDevice) => void;
}) {
  const Icon = peer.kind === 'mobile' ? Smartphone : Monitor;
  return (
    <View style={styles.peer}>
      <View style={styles.peerHeading}>
        <Icon size={17} color={colors.textSecondary} />
        <View style={styles.peerCopy}>
          <View style={styles.peerNameRow}>
            <StatusDot status={peer.online ? 'online' : 'offline'} size={6} />
            <Text numberOfLines={1} style={styles.peerName}>{peer.name}</Text>
          </View>
          <Text style={styles.peerMeta}>{peer.os}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unlink ${peer.name}`}
          disabled={busy}
          onPress={() => Alert.alert(
            `Unlink ${peer.name}?`,
            'This device will need to be paired again to regain access.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Unlink', style: 'destructive', onPress: () => onUnlink(peer) },
            ],
          )}
          style={({ pressed }) => [styles.peerRemove, pressed && styles.pressed]}
        >
          <X size={16} color={colors.textMuted} />
        </Pressable>
      </View>
      {peer.kind === 'desktop' ? (
        <View style={styles.grants}>
          <View style={styles.grantRow}>
            <Text style={styles.grantText}>Let host agents use this desktop</Text>
            <MiniToggle
              label={`Let host agents use ${peer.name}`}
              value={peer.agentRouting}
              disabled={busy}
              onChange={(value) => onGrants(peer, peer.allowAgents, value)}
            />
          </View>
          <View style={styles.grantRow}>
            <Text style={styles.grantText}>Accept agents from this desktop</Text>
            <MiniToggle
              label={`Accept agents from ${peer.name}`}
              value={peer.allowAgents}
              disabled={busy}
              onChange={(value) => onGrants(peer, value, peer.agentRouting)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** The desktop API is mounted at the URL root; keep LAN hostnames usable. */
function desktopAddressError(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return 'Enter the Koryphaios desktop address.';
  if (/\s/.test(trimmed)) return 'Enter an address without spaces, such as http://100.x.x.x:3001.';
  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const parsed = new URL(candidate);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
        !parsed.hostname || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return 'Use a desktop address such as http://100.x.x.x:3001 (no path or credentials).';
    }
  } catch {
    return 'Use a valid desktop address such as http://100.x.x.x:3001.';
  }
  return null;
}

// A command acknowledgement is not proof that a device mutation is visible on
// the desktop. Only compare fields exposed by the authoritative device list.
function deviceActionVisible(
  name: string,
  payload: Record<string, unknown> | undefined,
  next: DeviceNetworkInspection,
): boolean | null {
  switch (name) {
    case 'device.rename':
      return next.local?.name === String(payload?.name ?? '').trim();
    case 'device.grants': {
      const peer = next.peers?.find((item) => item.id === payload?.deviceId);
      return Boolean(peer && peer.allowAgents === (payload?.allowAgents === true) &&
        peer.agentRouting === (payload?.agentRouting === true));
    }
    case 'device.unlink':
      return Array.isArray(next.peers) && !next.peers.some((peer) => peer.id === payload?.deviceId);
    case 'device.decide':
      // The request disappearing confirms processing, not the peer's eventual connection.
      return Array.isArray(next.requests) && !next.requests.some((request) => request.id === payload?.requestId);
    default:
      // Invites, invitation cancellation and outbound pairing have no matching
      // field in devices.inspect; their final state cannot be inferred here.
      return null;
  }
}

export function MachinesView() {
  const { pairing } = useControl();
  // A new host gets an entirely new editor/network state, including pending UI.
  const owner = pairing ? `${pairing.baseUrl}\u0000${pairing.machineId ?? ''}` : 'unpaired';
  return <MachinesContent key={owner} />;
}

function MachinesContent() {
  const { snapshot, pairing, live, pair, disconnect, loading, error, inspect, sendCommand, refresh, refreshing } = useControl();
  const params = useLocalSearchParams<{ baseUrl?: string; pair?: string }>();
  const linkedControl = pairing?.baseUrl.startsWith('linked://') ?? false;
  const machineName = machineDisplayName(snapshot.machine, pairing);
  const machineOffline = snapshot.machine.status !== 'online' || snapshot.machine.id === 'unpaired';
  const machineConnection = machineLivePresentation(Boolean(pairing) && snapshot.machine.id !== 'unpaired', snapshot.machine.status, live.connection);
  const [baseUrl, setBaseUrl] = useState(() => params.baseUrl?.trim() ?? '');
  const [localError, setLocalError] = useState<string | null>(null);
  const [manualPairAttempted, setManualPairAttempted] = useState(false);
  const [networkOpen, setNetworkOpen] = useState(false);
  const [network, setNetwork] = useState<DeviceNetworkInspection | null>(null);
  const [networkError, setNetworkError] = useState('');
  // Automatic inspection refreshes must not erase the result of a user action.
  const [networkActionFeedback, setNetworkActionFeedback] = useState<{
    kind: 'error' | 'notice'; text: string;
  } | null>(null);
  const [networkBusy, setNetworkBusy] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [pairCode, setPairCode] = useState('');
  const [invitation, setInvitation] = useState<DeviceInvitation | null>(null);
  const [pairResult, setPairResult] = useState<DevicePairResult | null>(null);
  const handledPairLink = useRef('');
  const deviceNameDirty = useRef(false);
  const nameDraftRevision = useRef(0);
  const networkActionInFlight = useRef(false);
  const networkReadSequence = useRef(0);
  const pendingNetworkVerification = useRef<{
    name: string;
    payload?: Record<string, unknown>;
    renameDraftRevision: number;
  } | null>(null);
  const networkOwner = pairing ? `${pairing.baseUrl}\u0000${pairing.machineId ?? ''}` : '';
  const activeNetworkOwner = useRef(networkOwner);

  useEffect(() => {
    return () => { activeNetworkOwner.current = ''; };
  }, []);

  useEffect(() => {
    const incomingBaseUrl = params.baseUrl?.trim();
    if (!incomingBaseUrl) return;
    if (params.pair !== '1' || handledPairLink.current === incomingBaseUrl) return;

    handledPairLink.current = incomingBaseUrl;
    const timer = setTimeout(() => {
      setBaseUrl(incomingBaseUrl);
      setLocalError(null);
      void pair(incomingBaseUrl)
        .then(() => router.replace('/workspace'))
        .catch(() => {
          // ControlProvider exposes the host error on this screen.
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [pair, params.baseUrl, params.pair]);

  const loadNetwork = useCallback(async (reconcile = false): Promise<DeviceNetworkInspection | null> => {
    if (!pairing || linkedControl || (networkActionInFlight.current && !reconcile)) return null;
    const owner = networkOwner;
    const sequence = ++networkReadSequence.current;
    setNetworkError('');
    try {
      const next = await inspect<DeviceNetworkInspection>('devices.inspect');
      if (activeNetworkOwner.current !== owner || networkReadSequence.current !== sequence) return null;
      const pending = pendingNetworkVerification.current;
      if (pending && deviceActionVisible(pending.name, pending.payload, next) === true) {
        pendingNetworkVerification.current = null;
        setNetworkActionFeedback(null);
        if (pending.name === 'device.rename' && nameDraftRevision.current === pending.renameDraftRevision) {
          deviceNameDirty.current = false;
        }
      }
      setNetwork(next);
      if (!deviceNameDirty.current) setDeviceName(next.local?.name ?? '');
      return next;
    } catch (caught) {
      if (activeNetworkOwner.current === owner && networkReadSequence.current === sequence) {
        setNetworkError(caught instanceof Error ? caught.message : 'Could not load linked devices');
      }
      return null;
    }
  }, [inspect, linkedControl, networkOwner, pairing]);

  useEffect(() => {
    if (!networkOpen || !pairing || linkedControl) return;
    const initial = setTimeout(() => void loadNetwork(), 0);
    const timer = setInterval(() => void loadNetwork(), 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [linkedControl, loadNetwork, networkOpen, pairing]);

  useEffect(() => {
    if (!invitation) return;
    const delay = Math.max(0, invitation.expiresAt - Date.now());
    const timer = setTimeout(() => setInvitation(null), delay);
    return () => clearTimeout(timer);
  }, [invitation]);

  const runNetworkAction = async (
    key: string,
    name: string,
    payload?: Record<string, unknown>,
  ) => {
    if (networkActionInFlight.current || activeNetworkOwner.current !== networkOwner) {
      return { accepted: false, verified: false, data: undefined };
    }
    networkActionInFlight.current = true;
    const owner = networkOwner;
    const renameDraftRevision = nameDraftRevision.current;
    // Invalidate pre-command polls so older reads cannot replace the result of reconciliation.
    networkReadSequence.current++;
    pendingNetworkVerification.current = null;
    setNetworkBusy(key);
    setNetworkActionFeedback(null);
    setNetworkError('');
    try {
      const result = await sendCommand(name, payload);
      if (activeNetworkOwner.current !== owner) return { accepted: false, verified: false, data: undefined };
      if (!result?.accepted) {
        throw new Error('The desktop did not confirm this device action. Refresh linked devices before retrying.');
      }
      const latest = await loadNetwork(true);
      if (activeNetworkOwner.current !== owner) return { accepted: false, verified: false, data: undefined };
      const verified = latest ? deviceActionVisible(name, payload, latest) : null;
      if (!latest || verified === false) {
        if (verified === false) {
          pendingNetworkVerification.current = { name, payload, renameDraftRevision };
        } else if (latest) {
          pendingNetworkVerification.current = null;
        } else if (name === 'device.rename' || name === 'device.grants' || name === 'device.unlink' || name === 'device.decide') {
          pendingNetworkVerification.current = { name, payload, renameDraftRevision };
        }
        setNetworkActionFeedback({
          kind: 'notice',
          text: `The desktop accepted ${key}, but could not verify the current device state. Review linked devices before retrying.`,
        });
      } else if (name === 'device.stop_invite') {
        setNetworkActionFeedback({
          kind: 'notice',
          text: 'The desktop accepted code cancellation. The device list does not report invitation revocation.',
        });
      } else if (name === 'device.pair') {
        setNetworkActionFeedback({
          kind: 'notice',
          text: 'The desktop accepted the pairing request. Confirm the matching numbers on both devices to finish linking.',
        });
      }
      return { accepted: true, verified: verified === true, data: result.data };
    } catch (caught) {
      if (activeNetworkOwner.current === owner) {
        setNetworkActionFeedback({ kind: 'error', text: caught instanceof Error ? caught.message : 'Device action failed' });
      }
      return { accepted: false, verified: false, data: undefined };
    } finally {
      networkActionInFlight.current = false;
      if (activeNetworkOwner.current === owner) setNetworkBusy('');
    }
  };

  const saveDeviceName = async () => {
    const name = deviceName.trim();
    const savedDraftRevision = nameDraftRevision.current;
    const result = await runNetworkAction('rename', 'device.rename', { name });
    if (!result.accepted || !result.verified) return;
    // A queued edit during the host round trip belongs to a newer draft.
    if (nameDraftRevision.current !== savedDraftRevision) return;
    deviceNameDirty.current = false;
    setDeviceName(name);
  };

  const confirmDisconnect = () => Alert.alert(
    `Disconnect ${machineName}?`,
    'This removes the saved connection. You will need to pair this desktop again.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => void disconnect() },
    ],
  );

  const submit = async () => {
    setLocalError(null);
    setManualPairAttempted(true);
    const validationError = desktopAddressError(baseUrl);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    try {
      await pair(baseUrl.trim());
    } catch {
      // ControlProvider exposes the actionable error text.
    }
  };

  const normalizedPairCode = pairCode.replace(/[\s-]/g, '');

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ActionButton icon={Smartphone} label="Link desktop with QR code" onPress={() => router.push('/link-device')} />
      <LinkedDesktopPanel />
      {pairing ? (
        <>
          <View style={styles.hostCard}>
            <View style={styles.hostRow}>
              <StatusDot status={machineConnection.status} size={7} />
              <View style={styles.hostCopy}>
                <Text numberOfLines={1} style={styles.hostName}>{machineName}</Text>
                <Text style={styles.hostMeta}>
                  {[
                    machineOffline ? `${machineConnection.label} · Check desktop and retry` : snapshot.machine.platform,
                    !machineOffline ? machineConnection.label : '',
                    snapshot.machine.latencyMs != null ? `${snapshot.machine.latencyMs} ms` : '',
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {!machineOffline ? (
                <ActionButton label="Disconnect" icon={Unplug} danger onPress={confirmDisconnect} />
              ) : null}
            </View>
            {machineOffline ? (
              <View style={styles.hostActions}>
                <ActionButton label="Retry connection" icon={RefreshCw} primary loading={refreshing}
                  onPress={() => void refresh()} />
                <ActionButton label="Disconnect" icon={Unplug} danger onPress={confirmDisconnect} />
              </View>
            ) : null}
          </View>

          {!linkedControl ? (
          <View style={styles.networkCard}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={networkOpen ? 'Close device network' : 'Open device network'}
              onPress={() => setNetworkOpen((open) => !open)}
              style={({ pressed }) => [styles.networkHeader, pressed && styles.pressed]}
            >
              <View style={styles.networkHeaderCopy}>
                <Text style={styles.networkTitle}>Device network</Text>
                <Text style={styles.networkSummary}>
                  {network
                    ? `${network.peers.length} linked device${network.peers.length === 1 ? '' : 's'}`
                    : 'Pair and manage devices'}
                </Text>
              </View>
              {networkOpen ? (
                <ChevronDown size={18} color={colors.textMuted} />
              ) : (
                <ChevronRight size={18} color={colors.textMuted} />
              )}
            </Pressable>

            {networkOpen ? (
              <View style={styles.networkBody}>
                {networkActionFeedback ? (
                  <Text style={networkActionFeedback.kind === 'error' ? styles.errorText : styles.noticeText}>
                    {networkActionFeedback.text}
                  </Text>
                ) : null}
                {networkError || network?.error ? (
                  <Text style={styles.errorText}>{networkError || network?.error}</Text>
                ) : null}

                {network ? (
                  <>
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>This desktop</Text>
                      <View style={styles.inputRow}>
                        <TextInput
                          value={deviceName}
                          editable={!networkBusy}
                          onChangeText={(name) => {
                            deviceNameDirty.current = true;
                            nameDraftRevision.current++;
                            setDeviceName(name);
                          }}
                          accessibilityLabel="Desktop name"
                          maxLength={80}
                          placeholder="Desktop name"
                          placeholderTextColor={colors.textMuted}
                          style={styles.input}
                        />
                        <ActionButton
                          label="Save"
                          disabled={
                            !deviceName.trim() ||
                            deviceName.trim() === network.local?.name ||
                            Boolean(networkBusy)
                          }
                          loading={networkBusy === 'rename'}
                          onPress={() => void saveDeviceName()}
                        />
                      </View>
                    </View>

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Pair a device</Text>
                      {invitation ? (
                        <View style={styles.invitation}>
                          <Text style={styles.inviteCode}>{invitation.code}</Text>
                          <Text style={styles.inviteMeta}>
                            Expires {new Date(invitation.expiresAt).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </Text>
                          <ActionButton
                            label="Cancel code"
                            disabled={Boolean(networkBusy)}
                            onPress={() =>
                              void runNetworkAction('stop-invite', 'device.stop_invite').then((result) => {
                                if (result.accepted) setInvitation(null);
                              })
                            }
                          />
                        </View>
                      ) : (
                        <ActionButton
                          label="Create pairing code"
                          icon={Link2}
                          disabled={!network.connected}
                          loading={networkBusy === 'invite'}
                          onPress={() =>
                              void runNetworkAction('invite', 'device.invite').then((result) => {
                                if (result.accepted && result.data) setInvitation(result.data as DeviceInvitation);
                            })
                          }
                        />
                      )}

                      <View style={styles.inputRow}>
                        <TextInput
                          value={pairCode}
                          onChangeText={setPairCode}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          placeholder="Pairing code"
                          placeholderTextColor={colors.textMuted}
                          style={styles.input}
                        />
                        <ActionButton
                          label="Connect"
                          disabled={normalizedPairCode.length !== 20 || Boolean(networkBusy)}
                          loading={networkBusy === 'pair'}
                          onPress={() =>
                            void runNetworkAction('pair', 'device.pair', { code: pairCode }).then(
                              (result) => {
                                if (!result.accepted || !result.data) return;
                                setPairResult(result.data as DevicePairResult);
                                setPairCode('');
                              },
                            )
                          }
                        />
                      </View>
                      {pairResult ? (
                        <View style={styles.verification}>
                          <Text style={styles.verificationName}>{pairResult.identity.name}</Text>
                          <Text style={styles.verificationCode}>{pairResult.check}</Text>
                          <Text style={styles.verificationHint}>Match these numbers on both devices.</Text>
                        </View>
                      ) : null}
                    </View>

                    {network.requests.map((request) => (
                      <View key={request.id} style={styles.requestCard}>
                        <Text style={styles.requestTitle}>{request.identity.name} wants to link</Text>
                        <Text style={styles.requestMeta}>{request.identity.os}</Text>
                        <Text style={styles.verificationCode}>{request.check}</Text>
                        <View style={styles.requestActions}>
                          <ActionButton
                            label="Link"
                            icon={Check}
                            primary
                            disabled={Boolean(networkBusy)}
                            onPress={() =>
                              void runNetworkAction(
                                `approve:${request.id}`,
                                'device.decide',
                                { requestId: request.id, approved: true },
                              )
                            }
                          />
                          <ActionButton
                            label="Decline"
                            icon={X}
                            disabled={Boolean(networkBusy)}
                            onPress={() =>
                              void runNetworkAction(
                                `decline:${request.id}`,
                                'device.decide',
                                { requestId: request.id, approved: false },
                              )
                            }
                          />
                        </View>
                      </View>
                    ))}

                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Linked devices</Text>
                      {network.peers.length ? (
                        <View style={styles.peerList}>
                          {network.peers.map((peer) => (
                            <PeerRow
                              key={peer.id}
                              peer={peer}
                              busy={Boolean(networkBusy)}
                              onGrants={(target, allowAgents, agentRouting) =>
                                void runNetworkAction(`grants:${target.id}`, 'device.grants', {
                                  deviceId: target.id,
                                  allowAgents,
                                  agentRouting,
                                })
                              }
                              onUnlink={(target) =>
                                void runNetworkAction(`unlink:${target.id}`, 'device.unlink', {
                                  deviceId: target.id,
                                })
                              }
                            />
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.emptyText}>No linked devices.</Text>
                      )}
                    </View>
                  </>
                ) : (
                  <Text style={styles.emptyText}>Loading device network…</Text>
                )}
              </View>
            ) : null}
          </View>
          ) : null}
        </>
      ) : (
        <View style={styles.pairCard}>
          <Text style={styles.pairTitle}>Add machine</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Remote address</Text>
            <TextInput
              accessibilityLabel="Desktop address"
              value={baseUrl}
              onChangeText={(value) => {
                setBaseUrl(value);
                setLocalError(null);
                setManualPairAttempted(false);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              placeholder="http://100.x.x.x:3001"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <Text style={styles.emptyText}>
              Enter the reachable LAN or Tailscale address of your desktop while Koryphaios is running. You can also link by QR code above.
            </Text>
          </View>
          {localError || (manualPairAttempted && error) ? (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {readableControlError(localError ?? error ?? '', pairing)}
            </Text>
          ) : null}
          <ActionButton label="Pair device" primary onPress={() => void submit()} loading={loading} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1 },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  hostCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.md,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hostActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  hostCopy: { flex: 1, minWidth: 0 },
  hostName: { color: colors.textPrimary, fontSize: typography.base, fontWeight: '800' },
  hostMeta: { marginTop: 3, color: colors.textMuted, fontSize: typography.xs },
  networkCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  networkHeader: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  networkHeaderCopy: { flex: 1, minWidth: 0 },
  networkTitle: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '800' },
  networkSummary: { marginTop: 3, color: colors.textMuted, fontSize: typography.xs },
  networkBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.lg,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '800',
  },
  inputGroup: { gap: spacing.xs },
  inputLabel: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    fontSize: typography.sm,
    paddingHorizontal: spacing.sm,
  },
  invitation: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    padding: spacing.md,
    gap: spacing.xs,
  },
  inviteCode: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  inviteMeta: { color: colors.textMuted, fontSize: typography.xs },
  verification: {
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
    padding: spacing.md,
    gap: 4,
  },
  verificationName: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
  verificationCode: {
    color: colors.accent,
    fontSize: typography.xl,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  verificationHint: { color: colors.textMuted, fontSize: typography.xs },
  requestCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    padding: spacing.md,
    gap: spacing.xs,
  },
  requestTitle: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '800' },
  requestMeta: { color: colors.textMuted, fontSize: typography.xs },
  requestActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  peerList: { gap: spacing.xs },
  peer: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  peerHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  peerCopy: { flex: 1, minWidth: 0 },
  peerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  peerName: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  peerMeta: { marginTop: 2, color: colors.textMuted, fontSize: typography.xs },
  peerRemove: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grants: { gap: spacing.xs },
  grantRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  grantText: { flex: 1, color: colors.textSecondary, fontSize: typography.xs },
  toggleTarget: {
    width: 48,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    width: 38,
    height: 23,
    borderRadius: 12,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: colors.surface4,
  },
  toggleOn: { backgroundColor: colors.accent },
  toggleThumb: {
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.textSecondary,
  },
  toggleThumbOn: {
    backgroundColor: colors.onAccent,
    transform: [{ translateX: 15 }],
  },
  pairCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  pairTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800' },
  errorText: { color: colors.error, fontSize: typography.xs, lineHeight: 17 },
  noticeText: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
  emptyText: { color: colors.textMuted, fontSize: typography.xs },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
});
