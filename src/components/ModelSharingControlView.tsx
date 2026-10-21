import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  Save,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  ModelShareCandidate,
  ModelSharingInspection,
  RemoteSandboxPolicy,
} from '../types/control';
import { ActionButton } from './ui';

const BLOCKLIST = [
  'rm -rf /',
  'rm -rf ~',
  'mkfs',
  ':(){',
  'shutdown',
  'reboot',
  'dd if=',
  '> /dev/sda',
];

const SANDBOX_PRESETS: Record<
  Exclude<RemoteSandboxPolicy['preset'], 'custom'>,
  RemoteSandboxPolicy
> = {
  balanced: {
    preset: 'balanced',
    filesystemIsolation: true,
    allowNetwork: true,
    allowShell: true,
    allowEdits: true,
    allowWebSearch: true,
    commandBlocklist: BLOCKLIST,
    maxRuntimeSeconds: 900,
  },
  hardened: {
    preset: 'hardened',
    filesystemIsolation: true,
    allowNetwork: false,
    allowShell: false,
    allowEdits: true,
    allowWebSearch: false,
    commandBlocklist: BLOCKLIST,
    maxRuntimeSeconds: 600,
  },
  readonly: {
    preset: 'readonly',
    filesystemIsolation: true,
    allowNetwork: false,
    allowShell: false,
    allowEdits: false,
    allowWebSearch: false,
    commandBlocklist: BLOCKLIST,
    maxRuntimeSeconds: 600,
  },
  trusted: {
    preset: 'trusted',
    filesystemIsolation: false,
    allowNetwork: true,
    allowShell: true,
    allowEdits: true,
    allowWebSearch: true,
    commandBlocklist: [],
    maxRuntimeSeconds: 0,
  },
};

function MiniToggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggle,
        value && styles.toggleOn,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
    </Pressable>
  );
}

function riskIcon(candidate: ModelShareCandidate) {
  if (candidate.risk === 'prohibited') return ShieldX;
  if (candidate.risk === 'caution') return ShieldAlert;
  return ShieldCheck;
}

export function ModelSharingControlView() {
  const { inspect, sendCommand } = useControl();
  const [data, setData] = useState<ModelSharingInspection | null>(null);
  const [shared, setShared] = useState<string[]>([]);
  const [sharedModels, setSharedModels] = useState<Record<string, string[]>>({});
  const [hostName, setHostName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [clientName, setClientName] = useState('');
  const [expandedProvider, setExpandedProvider] = useState('');
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [sandbox, setSandbox] = useState<RemoteSandboxPolicy | null>(null);
  const [blocklist, setBlocklist] = useState('');
  const [runtime, setRuntime] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const next = await inspect<ModelSharingInspection>('model_sharing.inspect');
      setData(next);
      setShared(next.shared);
      setSharedModels(next.sharedModels);
      setHostName(next.sharing.hostName ?? '');
      if (next.sandbox?.policy) {
        setSandbox(next.sandbox.policy);
        setBlocklist(next.sandbox.policy.commandBlocklist.join('\n'));
        setRuntime(String(next.sandbox.policy.maxRuntimeSeconds));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load model sharing');
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const sharedSet = useMemo(() => new Set(shared), [shared]);

  const run = async (
    key: string,
    command: string,
    payload: Record<string, unknown> = {},
  ) => {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      await sendCommand(command, payload);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Model sharing action failed');
    } finally {
      setBusy('');
    }
  };

  const toggleProvider = (candidate: ModelShareCandidate, enabled: boolean) => {
    setShared((current) =>
      enabled
        ? [...new Set([...current, candidate.provider])]
        : current.filter((provider) => provider !== candidate.provider),
    );
    if (enabled && !sharedModels[candidate.provider]?.length) {
      setSharedModels((current) => ({
        ...current,
        [candidate.provider]: candidate.models.map((model) => model.id),
      }));
    }
  };

  const toggleModel = (candidate: ModelShareCandidate, modelId: string) => {
    setSharedModels((current) => {
      const fallback = candidate.models.map((model) => model.id);
      const selected = current[candidate.provider] ?? fallback;
      const next = selected.includes(modelId)
        ? selected.filter((id) => id !== modelId)
        : [...selected, modelId];
      return { ...current, [candidate.provider]: next };
    });
  };

  const saveShared = () =>
    void run('save', 'model_sharing.save', {
      providers: shared,
      models: sharedModels,
    });

  const saveSandbox = () => {
    if (!sandbox) return;
    const maxRuntimeSeconds = Number(runtime);
    if (!Number.isFinite(maxRuntimeSeconds) || maxRuntimeSeconds < 0) {
      setError('Runtime limit must be zero or more seconds');
      return;
    }
    const policy: RemoteSandboxPolicy = {
      ...sandbox,
      preset: 'custom',
      commandBlocklist: blocklist
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      maxRuntimeSeconds,
    };
    setSandbox(policy);
    void run('sandbox', 'model_sharing.sandbox', { policy });
  };

  const applyPreset = (preset: Exclude<RemoteSandboxPolicy['preset'], 'custom'>) => {
    const policy = { ...SANDBOX_PRESETS[preset], commandBlocklist: [...SANDBOX_PRESETS[preset].commandBlocklist] };
    setSandbox(policy);
    setBlocklist(policy.commandBlocklist.join('\n'));
    setRuntime(String(policy.maxRuntimeSeconds));
    void run('sandbox', 'model_sharing.sandbox', { policy });
  };

  const patchSandbox = (patch: Partial<RemoteSandboxPolicy>) => {
    if (!sandbox) return;
    const policy: RemoteSandboxPolicy = { ...sandbox, ...patch, preset: 'custom' };
    setSandbox(policy);
    void run('sandbox', 'model_sharing.sandbox', { policy });
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <View style={styles.heading}>
          <Text style={styles.title}>Share this machine’s models</Text>
          <ActionButton
            label="Save"
            icon={Save}
            loading={busy === 'save'}
            disabled={Boolean(busy)}
            onPress={saveShared}
          />
        </View>
        {data?.candidates.map((candidate) => {
          const enabled = sharedSet.has(candidate.provider);
          const expanded = expandedProvider === candidate.provider;
          const RiskIcon = riskIcon(candidate);
          const selectedModels =
            sharedModels[candidate.provider] ?? candidate.models.map((model) => model.id);
          return (
            <View key={candidate.provider} style={styles.providerBlock}>
              <View style={styles.providerRow}>
                <Pressable
                  disabled={!candidate.models.length}
                  onPress={() => setExpandedProvider(expanded ? '' : candidate.provider)}
                  style={({ pressed }) => [styles.providerMain, pressed && styles.pressed]}
                >
                  <RiskIcon
                    size={15}
                    color={
                      candidate.risk === 'prohibited'
                        ? colors.error
                        : candidate.risk === 'caution'
                          ? colors.warning
                          : colors.success
                    }
                  />
                  <View style={styles.providerCopy}>
                    <Text numberOfLines={1} style={styles.providerName}>{candidate.label}</Text>
                    <Text numberOfLines={2} style={styles.meta}>
                      {candidate.sharingBlockedReason || `${candidate.modelCount} models`}
                    </Text>
                  </View>
                  {candidate.models.length ? (
                    expanded
                      ? <ChevronDown size={15} color={colors.textMuted} />
                      : <ChevronRight size={15} color={colors.textMuted} />
                  ) : null}
                </Pressable>
                <MiniToggle
                  value={enabled}
                  disabled={!candidate.available || Boolean(candidate.sharingBlockedReason)}
                  onChange={(value) => toggleProvider(candidate, value)}
                />
              </View>
              {expanded ? (
                <View style={styles.modelList}>
                  {candidate.models.map((model) => {
                    const selected = selectedModels.includes(model.id);
                    return (
                      <Pressable
                        key={model.id}
                        disabled={!enabled}
                        onPress={() => toggleModel(candidate, model.id)}
                        style={({ pressed }) => [
                          styles.modelRow,
                          !enabled && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.check, selected && styles.checkActive]}>
                          {selected ? <Check size={11} color={colors.onAccent} /> : null}
                        </View>
                        <Text numberOfLines={1} style={styles.modelName}>{model.name || model.id}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Sharing code</Text>
        <TextInput
          value={hostName}
          onChangeText={setHostName}
          placeholder="Host name"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
        {data?.sharing.active ? (
          <>
            {data.sharing.joinCode ? <Text selectable style={styles.code}>{data.sharing.joinCode}</Text> : null}
            <ActionButton
              label="Stop sharing"
              danger
              loading={busy === 'stop'}
              disabled={Boolean(busy)}
              onPress={() => void run('stop', 'model_sharing.stop')}
            />
          </>
        ) : (
          <ActionButton
            label="Start sharing"
            icon={Link2}
            primary
            loading={busy === 'start'}
            disabled={Boolean(busy)}
            onPress={() => void run('start', 'model_sharing.start', { hostName: hostName.trim() })}
          />
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Use models from another host</Text>
        {data?.remote?.connected ? (
          <>
            <Text style={styles.meta}>{data.remote.hostName || 'Remote host'}</Text>
            <ActionButton
              label="Disconnect"
              loading={busy === 'disconnect'}
              disabled={Boolean(busy)}
              onPress={() => void run('disconnect', 'model_sharing.disconnect')}
            />
          </>
        ) : (
          <>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Model sharing code"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={clientName}
              onChangeText={setClientName}
              placeholder="This device name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <ActionButton
              label="Connect"
              primary
              loading={busy === 'connect'}
              disabled={!joinCode.trim() || Boolean(busy)}
              onPress={() =>
                void run('connect', 'model_sharing.connect', {
                  joinCode: joinCode.trim(),
                  name: clientName.trim(),
                })
              }
            />
          </>
        )}
      </View>

      {sandbox ? (
        <View style={styles.card}>
          <Pressable
            onPress={() => setSandboxOpen((open) => !open)}
            style={({ pressed }) => [styles.heading, pressed && styles.pressed]}
          >
            <View style={styles.providerCopy}>
              <Text style={styles.title}>Remote agent sandbox</Text>
              <Text style={styles.meta}>{sandbox.preset}</Text>
            </View>
            {sandboxOpen
              ? <ChevronDown size={16} color={colors.textMuted} />
              : <ChevronRight size={16} color={colors.textMuted} />}
          </Pressable>
          {sandboxOpen ? (
            <View style={styles.sandboxBody}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.presetRow}
              >
                {(['balanced', 'hardened', 'readonly', 'trusted'] as const).map((preset) => (
                  <Pressable
                    key={preset}
                    disabled={Boolean(busy)}
                    onPress={() => applyPreset(preset)}
                    style={({ pressed }) => [
                      styles.preset,
                      sandbox.preset === preset && styles.presetActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[
                      styles.presetText,
                      sandbox.preset === preset && styles.presetTextActive,
                    ]}>
                      {preset}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              {([
                ['Filesystem jail', 'filesystemIsolation'],
                ['Network', 'allowNetwork'],
                ['Shell', 'allowShell'],
                ['Edits', 'allowEdits'],
                ['Web search', 'allowWebSearch'],
              ] as const).map(([label, key]) => (
                <View key={key} style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>{label}</Text>
                  <MiniToggle
                    value={sandbox[key]}
                    disabled={Boolean(busy)}
                    onChange={(value) => patchSandbox({ [key]: value })}
                  />
                </View>
              ))}

              <Text style={styles.fieldLabel}>Blocked commands</Text>
              <TextInput
                value={blocklist}
                onChangeText={setBlocklist}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                textAlignVertical="top"
                style={[styles.input, styles.blocklistInput]}
              />
              <Text style={styles.fieldLabel}>Max runtime seconds</Text>
              <TextInput
                value={runtime}
                onChangeText={setRuntime}
                keyboardType="number-pad"
                style={styles.input}
              />
              <ActionButton
                label="Save sandbox"
                loading={busy === 'sandbox'}
                disabled={Boolean(busy)}
                onPress={saveSandbox}
              />
              {data?.sandbox?.capabilities ? (
                <Text style={styles.meta}>
                  {[
                    data.sandbox.capabilities.platform,
                    data.sandbox.capabilities.mechanism,
                    data.sandbox.capabilities.osIsolation ? 'OS isolation' : null,
                  ].filter(Boolean).join(' / ')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.md,
  },
  card: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  providerBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  providerRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  providerMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  providerCopy: {
    flex: 1,
    minWidth: 0,
  },
  providerName: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  meta: {
    color: colors.textMuted,
    fontSize: typography.xs,
    lineHeight: 16,
  },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: colors.surface4,
  },
  toggleOn: {
    backgroundColor: colors.accent,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textMuted,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.onAccent,
  },
  modelList: {
    paddingLeft: 23,
    paddingBottom: spacing.xs,
  },
  modelRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.borderBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modelName: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.xs,
  },
  input: {
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.sm,
  },
  code: {
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
    paddingVertical: spacing.xs,
  },
  sandboxBody: {
    gap: spacing.sm,
  },
  presetRow: {
    gap: spacing.xs,
  },
  preset: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: 17,
    justifyContent: 'center',
    backgroundColor: colors.surface3,
  },
  presetActive: {
    backgroundColor: colors.accentSoft,
  },
  presetText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    textTransform: 'capitalize',
  },
  presetTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  toggleRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  toggleLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  blocklistInput: {
    minHeight: 116,
    paddingTop: spacing.sm,
  },
  error: {
    color: colors.error,
    fontSize: typography.xs,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.68,
  },
});
