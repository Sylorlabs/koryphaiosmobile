import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
  Video,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import {
  cacheBase64File,
  pickImageBase64,
  shareBase64File,
  type PickedFile,
} from '../native/mobileFiles';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  CollaborationAccessTier,
  CollaborationInspection,
  CollaborationPolicy,
  CollaborationTierPermissions,
  MediaHistoryItem,
  MediaInspection,
  MediaProvider,
  MemoryDocument,
  MemoryInspection,
  ModelCatalogEntry,
} from '../types/control';
import { ActionButton } from './ui';

function ErrorText({ value }: { value: string }) {
  return value ? <Text style={styles.error}>{value}</Text> : null;
}

function CompactToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.switchTrack, value && styles.switchTrackActive]}>
        <View style={[styles.switchThumb, value && styles.switchThumbActive]} />
      </View>
    </Pressable>
  );
}

function ChoiceStrip({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceStrip}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.choice,
              active && styles.choiceActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function listFromText(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cloneTier(source: CollaborationAccessTier, id: string, name: string): CollaborationAccessTier {
  return {
    ...source,
    id,
    name,
    builtin: null,
    allowedModels: [...source.allowedModels],
    reasoningByModel: Object.fromEntries(
      Object.entries(source.reasoningByModel ?? {}).map(([model, levels]) => [model, [...levels]]),
    ),
    permissions: {
      ...source.permissions,
      readPaths: [...source.permissions.readPaths],
      writePaths: [...source.permissions.writePaths],
      commandAllowlist: [...source.permissions.commandAllowlist],
      commandBlocklist: [...source.permissions.commandBlocklist],
    },
  };
}

function CollaborationAccessProfiles({
  policy,
  models,
  joins,
  participants,
  loading,
  onPolicy,
  onInvite,
  onJoinDecision,
  onAssignTier,
}: {
  policy: CollaborationPolicy;
  models: ModelCatalogEntry[];
  joins: CollaborationInspection['joins'];
  participants: CollaborationInspection['participants'];
  loading: boolean;
  onPolicy: (patch: CollaborationPolicy) => void;
  onInvite: (tierId: string) => void;
  onJoinDecision: (guestId: string, approved: boolean, tierId?: string) => void;
  onAssignTier: (guestId: string, tierId: string) => void;
}) {
  const tiers = policy.accessTiers ?? [];
  const [selectedTierId, setSelectedTierId] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [newTierName, setNewTierName] = useState('');
  const [pendingAllowAll, setPendingAllowAll] = useState(false);
  const [joinAssignments, setJoinAssignments] = useState<Record<string, string>>({});
  const selectedTier =
    tiers.find((tier) => tier.id === selectedTierId) ??
    tiers.find((tier) => tier.id === policy.defaultTierId) ??
    tiers[0];

  if (!selectedTier) return null;

  const saveTier = (next: CollaborationAccessTier) => {
    onPolicy({ accessTiers: tiers.map((tier) => (tier.id === next.id ? next : tier)) });
  };

  const updatePermission = <K extends keyof CollaborationTierPermissions>(
    key: K,
    value: CollaborationTierPermissions[K],
  ) => {
    saveTier({
      ...selectedTier,
      permissions: { ...selectedTier.permissions, [key]: value },
    });
  };

  const applyGlobalPreset = (kind: 'ask' | 'allow' | 'block') => {
    if (kind === 'allow') {
      saveTier({
        ...selectedTier,
        allowedModels: ['*'],
        permissions: {
          ...selectedTier.permissions,
          viewChat: true,
          viewSystemMessages: true,
          viewDiffs: true,
          viewAgentStatus: true,
          viewParticipants: true,
          submitPrompts: true,
          autoExecutePrompts: true,
          useTools: true,
          fullSystemAccess: true,
          readPaths: ['**'],
          writePaths: ['**'],
          commandAllowlist: ['*'],
          commandBlocklist: [],
        },
      });
      return;
    }
    if (kind === 'block') {
      saveTier({
        ...selectedTier,
        allowedModels: [],
        permissions: {
          ...selectedTier.permissions,
          viewChat: false,
          viewSystemMessages: false,
          viewDiffs: false,
          viewAgentStatus: false,
          viewParticipants: false,
          submitPrompts: false,
          autoExecutePrompts: false,
          useTools: false,
          fullSystemAccess: false,
          readPaths: [],
          writePaths: [],
          commandAllowlist: [],
          commandBlocklist: ['*'],
        },
      });
      return;
    }
    saveTier({
      ...selectedTier,
      permissions: {
        ...selectedTier.permissions,
        viewChat: true,
        viewSystemMessages: false,
        viewDiffs: true,
        viewAgentStatus: true,
        viewParticipants: true,
        submitPrompts: true,
        autoExecutePrompts: false,
        useTools: true,
        fullSystemAccess: false,
        readPaths: ['**'],
        writePaths: [],
        commandAllowlist: [],
        commandBlocklist: [],
      },
    });
  };

  const applyCommandPreset = (kind: 'readonly' | 'developer' | 'allow' | 'block') => {
    const presets = {
      readonly: {
        allow: ['ls', 'pwd', 'find', 'rg', 'grep', 'cat', 'head', 'tail', 'git'],
        block: ['rm', 'mv', 'cp', 'chmod', 'chown', 'sudo', 'curl', 'wget', 'ssh'],
      },
      developer: {
        allow: [
          'git', 'bun', 'npm', 'npx', 'pnpm', 'yarn', 'node', 'python', 'python3', 'pytest',
          'cargo', 'go', 'make', 'cmake', 'rg', 'grep', 'ls', 'cat', 'mkdir', 'cp', 'mv',
        ],
        block: ['sudo', 'su', 'ssh', 'scp', 'curl', 'wget', 'nc', 'nmap', 'rm'],
      },
      allow: { allow: ['*'], block: [] },
      block: { allow: [], block: ['*'] },
    }[kind];
    saveTier({
      ...selectedTier,
      permissions: {
        ...selectedTier.permissions,
        commandAllowlist: presets.allow,
        commandBlocklist: presets.block,
      },
    });
  };

  const createTier = () => {
    const name = newTierName.trim();
    if (!name) return;
    const source = tiers.find((tier) => tier.id === 'viewer') ?? selectedTier;
    const base = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'custom';
    let id = base;
    let suffix = 2;
    while (tiers.some((tier) => tier.id === id)) id = `${base}-${suffix++}`.slice(0, 31);
    const next = cloneTier(source, id, name);
    next.description = 'Custom host-defined access profile.';
    next.color = '#a78bfa';
    next.reasoningByModel = {};
    onPolicy({ accessTiers: [...tiers, next] });
    setSelectedTierId(id);
    setNewTierName('');
  };

  const duplicateTier = () => {
    const base = `${selectedTier.id}-copy`.slice(0, 26);
    let id = base;
    let suffix = 2;
    while (tiers.some((tier) => tier.id === id)) id = `${base}-${suffix++}`.slice(0, 31);
    const next = cloneTier(selectedTier, id, `${selectedTier.name} Copy`);
    onPolicy({ accessTiers: [...tiers, next] });
    setSelectedTierId(id);
  };

  const deleteTier = () => {
    if (selectedTier.builtin || tiers.length <= 1) return;
    const next = tiers.filter((tier) => tier.id !== selectedTier.id);
    const nextDefault = policy.defaultTierId === selectedTier.id ? next[0].id : policy.defaultTierId;
    onPolicy({ accessTiers: next, defaultTierId: nextDefault });
    setSelectedTierId(nextDefault || next[0].id);
  };

  const modelIds = models.map((model) => model.id);
  const allModels = selectedTier.allowedModels.includes('*');
  const permissionToggles: { key: keyof CollaborationTierPermissions; label: string }[] = [
    { key: 'viewChat', label: 'View chats' },
    { key: 'viewSystemMessages', label: 'View system/log messages' },
    { key: 'viewDiffs', label: 'View code changes' },
    { key: 'viewAgentStatus', label: 'View agent status' },
    { key: 'viewParticipants', label: 'View participants' },
    { key: 'submitPrompts', label: 'Submit prompts' },
    { key: 'useRemoteProviders', label: 'Use shared providers' },
    { key: 'useTools', label: 'Use agent tools' },
    { key: 'autoExecutePrompts', label: 'Auto-execute prompts' },
    { key: 'fullSystemAccess', label: 'Full system access' },
  ];

  return (
    <>
      <View style={styles.card}>
        <View style={styles.statRow}>
          <Text style={styles.cardTitle}>Access profiles</Text>
          <ChoiceStrip
            value={advanced ? 'advanced' : 'basic'}
            onChange={(value) => setAdvanced(value === 'advanced')}
            options={[
              { value: 'basic', label: 'Basic' },
              { value: 'advanced', label: 'Advanced' },
            ]}
          />
        </View>

        <View style={styles.inlineField}>
          <Text style={styles.fieldLabel}>Host display name</Text>
          <TextInput
            defaultValue={policy.hostName || 'Host'}
            maxLength={80}
            onEndEditing={(event) => {
              const value = event.nativeEvent.text.trim();
              if (value && value !== policy.hostName) onPolicy({ hostName: value });
            }}
            style={styles.input}
          />
        </View>
        <View style={styles.inlineField}>
          <Text style={styles.fieldLabel}>Hosted session name</Text>
          <TextInput
            defaultValue={policy.sessionName || 'Team session'}
            maxLength={80}
            onEndEditing={(event) => {
              const value = event.nativeEvent.text.trim();
              if (value && value !== policy.sessionName) onPolicy({ sessionName: value });
            }}
            style={styles.input}
          />
        </View>

        <ChoiceStrip
          value={selectedTier.id}
          onChange={(value) => {
            setPendingAllowAll(false);
            setSelectedTierId(value);
          }}
          options={tiers.map((tier) => ({ value: tier.id, label: tier.name }))}
        />

        <View style={styles.pendingCard}>
          <Text style={styles.cardTitle}>{selectedTier.name}</Text>
          <Text style={styles.meta}>{selectedTier.description}</Text>
          <Text style={styles.meta}>
            {selectedTier.permissions.submitPrompts
              ? selectedTier.permissions.autoExecutePrompts && selectedTier.permissions.fullSystemAccess
                ? 'Prompts run automatically'
                : 'Prompts require host approval'
              : 'Prompts blocked'}
            {'  ·  '}
            {allModels ? 'All host models' : `${selectedTier.allowedModels.length} models`}
            {'  ·  '}
            {selectedTier.permissions.writePaths.length
              ? 'Can edit files'
              : selectedTier.permissions.readPaths.length
                ? 'Read-only files'
                : 'No file access'}
          </Text>
          <ActionButton
            label={loading ? 'Working…' : 'Copy invite'}
            icon={Copy}
            disabled={loading}
            onPress={() => onInvite(selectedTier.id)}
          />
        </View>

        <Text style={styles.fieldLabel}>Whole-profile preset</Text>
        <View style={styles.choiceWrap}>
          <ActionButton label="Ask all" onPress={() => applyGlobalPreset('ask')} />
          <ActionButton
            label={pendingAllowAll ? 'Confirm full control' : 'Allow all'}
            danger={pendingAllowAll}
            onPress={() => {
              if (!pendingAllowAll) {
                setPendingAllowAll(true);
                return;
              }
              setPendingAllowAll(false);
              applyGlobalPreset('allow');
            }}
          />
          <ActionButton label="Block all" danger onPress={() => applyGlobalPreset('block')} />
        </View>
        {pendingAllowAll ? (
          <Text style={styles.error}>
            Full control permits automatic prompts, every host model and tool, commands, and writable project paths.
          </Text>
        ) : null}

        {advanced ? (
          <>
            <View style={styles.inlineInputRow}>
              <TextInput
                value={newTierName}
                onChangeText={setNewTierName}
                maxLength={40}
                placeholder="New profile name"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.searchInput]}
              />
              <ActionButton label="Create" icon={Plus} disabled={!newTierName.trim() || loading} onPress={createTier} />
            </View>
            <View style={styles.choiceWrap}>
              <ActionButton label="Duplicate" icon={Copy} disabled={loading} onPress={duplicateTier} />
              {!selectedTier.builtin ? (
                <ActionButton label="Delete profile" icon={Trash2} danger disabled={loading} onPress={deleteTier} />
              ) : null}
            </View>

            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>Profile name</Text>
              <TextInput
                defaultValue={selectedTier.name}
                editable={!selectedTier.builtin}
                maxLength={40}
                onEndEditing={(event) => {
                  const value = event.nativeEvent.text.trim();
                  if (!selectedTier.builtin && value && value !== selectedTier.name) {
                    saveTier({ ...selectedTier, name: value });
                  }
                }}
                style={[styles.input, selectedTier.builtin && styles.disabled]}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                defaultValue={selectedTier.description}
                multiline
                maxLength={180}
                onEndEditing={(event) =>
                  saveTier({ ...selectedTier, description: event.nativeEvent.text.trim() })
                }
                style={[styles.input, styles.promptInput]}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>Profile color</Text>
              <TextInput
                defaultValue={selectedTier.color}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={7}
                onEndEditing={(event) => {
                  const value = event.nativeEvent.text.trim();
                  if (/^#[0-9a-f]{6}$/i.test(value)) saveTier({ ...selectedTier, color: value });
                }}
                style={styles.input}
              />
            </View>

            <Text style={styles.cardTitle}>Model access</Text>
            <CompactToggle
              label="All host models"
              value={allModels}
              onChange={(value) =>
                saveTier({ ...selectedTier, allowedModels: value ? ['*'] : [] })
              }
            />
            {models.map((model) => {
              const enabled = allModels || selectedTier.allowedModels.includes(model.id);
              return (
                <View key={model.id} style={styles.pendingCard}>
                  <CompactToggle
                    label={`${model.name} · ${model.providerLabel || model.provider}`}
                    value={enabled}
                    onChange={() => {
                      const current = allModels ? modelIds : selectedTier.allowedModels;
                      saveTier({
                        ...selectedTier,
                        allowedModels: enabled
                          ? current.filter((id) => id !== model.id)
                          : [...new Set([...current, model.id])],
                      });
                    }}
                  />
                  {enabled && model.reasoningLevels.length ? (
                    <ChoiceStrip
                      value=""
                      onChange={(level) => {
                        const current = selectedTier.reasoningByModel[model.id] ?? [];
                        saveTier({
                          ...selectedTier,
                          reasoningByModel: {
                            ...selectedTier.reasoningByModel,
                            [model.id]: current.includes(level)
                              ? current.filter((item) => item !== level)
                              : [...current, level],
                          },
                        });
                      }}
                      options={model.reasoningLevels.map((level) => ({
                        value: level,
                        label: (selectedTier.reasoningByModel[model.id] ?? []).includes(level)
                          ? `✓ ${level}`
                          : level,
                      }))}
                    />
                  ) : null}
                </View>
              );
            })}

            <Text style={styles.cardTitle}>Category presets</Text>
            <Text style={styles.fieldLabel}>Visibility</Text>
            <View style={styles.choiceWrap}>
              <ActionButton
                label="Everything"
                onPress={() =>
                  saveTier({
                    ...selectedTier,
                    permissions: {
                      ...selectedTier.permissions,
                      viewChat: true,
                      viewSystemMessages: true,
                      viewDiffs: true,
                      viewAgentStatus: true,
                      viewParticipants: true,
                    },
                  })
                }
              />
              <ActionButton
                label="Work only"
                onPress={() =>
                  saveTier({
                    ...selectedTier,
                    permissions: {
                      ...selectedTier.permissions,
                      viewChat: true,
                      viewSystemMessages: false,
                      viewDiffs: true,
                      viewAgentStatus: true,
                      viewParticipants: false,
                    },
                  })
                }
              />
              <ActionButton
                label="Hidden"
                onPress={() =>
                  saveTier({
                    ...selectedTier,
                    permissions: {
                      ...selectedTier.permissions,
                      viewChat: false,
                      viewSystemMessages: false,
                      viewDiffs: false,
                      viewAgentStatus: false,
                      viewParticipants: false,
                    },
                  })
                }
              />
            </View>

            <Text style={styles.fieldLabel}>Prompts and execution</Text>
            <View style={styles.choiceWrap}>
              <ActionButton
                label="Ask host"
                onPress={() =>
                  saveTier({
                    ...selectedTier,
                    permissions: {
                      ...selectedTier.permissions,
                      submitPrompts: true,
                      autoExecutePrompts: false,
                    },
                  })
                }
              />
              <ActionButton
                label="Auto-run"
                onPress={() =>
                  saveTier({
                    ...selectedTier,
                    permissions: {
                      ...selectedTier.permissions,
                      submitPrompts: true,
                      autoExecutePrompts: true,
                      fullSystemAccess: true,
                    },
                  })
                }
              />
              <ActionButton
                label="Block"
                onPress={() =>
                  saveTier({
                    ...selectedTier,
                    permissions: {
                      ...selectedTier.permissions,
                      submitPrompts: false,
                      autoExecutePrompts: false,
                    },
                  })
                }
              />
            </View>

            <Text style={styles.fieldLabel}>Files</Text>
            <View style={styles.choiceWrap}>
              <ActionButton
                label="Read only"
                onPress={() =>
                  saveTier({
                    ...selectedTier,
                    permissions: { ...selectedTier.permissions, readPaths: ['**'], writePaths: [] },
                  })
                }
              />
              <ActionButton
                label="Project edit"
                onPress={() =>
                  saveTier({
                    ...selectedTier,
                    permissions: { ...selectedTier.permissions, readPaths: ['**'], writePaths: ['**'] },
                  })
                }
              />
              <ActionButton
                label="No files"
                onPress={() =>
                  saveTier({
                    ...selectedTier,
                    permissions: { ...selectedTier.permissions, readPaths: [], writePaths: [] },
                  })
                }
              />
            </View>

            <Text style={styles.fieldLabel}>Commands</Text>
            <View style={styles.choiceWrap}>
              <ActionButton label="Read only" onPress={() => applyCommandPreset('readonly')} />
              <ActionButton label="Developer" onPress={() => applyCommandPreset('developer')} />
              <ActionButton label="Allow all" onPress={() => applyCommandPreset('allow')} />
              <ActionButton label="Block all" danger onPress={() => applyCommandPreset('block')} />
            </View>

            <Text style={styles.cardTitle}>Permissions</Text>
            {permissionToggles.map(({ key, label }) => (
              <CompactToggle
                key={key}
                label={label}
                value={Boolean(selectedTier.permissions[key])}
                onChange={(value) => updatePermission(key, value as never)}
              />
            ))}

            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>Readable paths</Text>
              <TextInput
                defaultValue={selectedTier.permissions.readPaths.join('\n')}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                onEndEditing={(event) => updatePermission('readPaths', listFromText(event.nativeEvent.text))}
                style={[styles.input, styles.promptInput]}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>Writable paths</Text>
              <TextInput
                defaultValue={selectedTier.permissions.writePaths.join('\n')}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                onEndEditing={(event) => updatePermission('writePaths', listFromText(event.nativeEvent.text))}
                style={[styles.input, styles.promptInput]}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>Command allowlist</Text>
              <TextInput
                defaultValue={selectedTier.permissions.commandAllowlist.join('\n')}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                onEndEditing={(event) =>
                  updatePermission('commandAllowlist', listFromText(event.nativeEvent.text))
                }
                style={[styles.input, styles.promptInput]}
              />
            </View>
            <View style={styles.inlineField}>
              <Text style={styles.fieldLabel}>Command blocklist</Text>
              <TextInput
                defaultValue={selectedTier.permissions.commandBlocklist.join('\n')}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                onEndEditing={(event) =>
                  updatePermission('commandBlocklist', listFromText(event.nativeEvent.text))
                }
                style={[styles.input, styles.promptInput]}
              />
            </View>
          </>
        ) : null}

        <Text style={styles.fieldLabel}>Code join behavior</Text>
        <ChoiceStrip
          value={policy.joinMode === 'auto' ? 'auto' : 'approval'}
          onChange={(value) => onPolicy({ joinMode: value === 'auto' ? 'auto' : 'approval' })}
          options={[
            { value: 'approval', label: 'Approve each person' },
            { value: 'auto', label: 'Auto admit' },
          ]}
        />
        <Text style={styles.fieldLabel}>Default join profile</Text>
        <ChoiceStrip
          value={policy.defaultTierId || selectedTier.id}
          onChange={(value) => onPolicy({ defaultTierId: value })}
          options={tiers.map((tier) => ({ value: tier.id, label: tier.name }))}
        />
      </View>

      {joins.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Join requests</Text>
          {joins.map((join) => {
            const tierId = joinAssignments[join.guestId] || policy.defaultTierId || tiers[0]?.id || '';
            return (
              <View key={join.guestId} style={styles.pendingCard}>
                <Text numberOfLines={1} style={styles.decisionText}>{join.name || join.guestId}</Text>
                <ChoiceStrip
                  value={tierId}
                  onChange={(value) =>
                    setJoinAssignments((current) => ({ ...current, [join.guestId]: value }))
                  }
                  options={tiers.map((tier) => ({ value: tier.id, label: tier.name }))}
                />
                <View style={styles.actionRow}>
                  <ActionButton label="Reject" onPress={() => onJoinDecision(join.guestId, false)} />
                  <ActionButton
                    label="Admit"
                    primary
                    onPress={() => onJoinDecision(join.guestId, true, tierId)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {participants.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connected people</Text>
          {participants.map((person, index) => {
            const guestId = person.guestId || person.userId || '';
            if (!guestId) return null;
            return (
              <View key={guestId || index} style={styles.pendingCard}>
                <Text style={styles.decisionText}>{person.name || guestId}</Text>
                <ChoiceStrip
                  value={person.tierId || policy.defaultTierId || tiers[0]?.id || ''}
                  onChange={(value) => onAssignTier(guestId, value)}
                  options={tiers.map((tier) => ({ value: tier.id, label: tier.name }))}
                />
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

function memoryTitle(document: MemoryDocument): string {
  if (document.scope === 'universal') return 'Universal';
  if (document.scope === 'project') return 'Project';
  if (document.scope === 'session') return 'Chat';
  if (document.scope === 'rules') return 'Rules';
  return document.name || document.path || 'Document';
}

export function MemoryControlView() {
  const { snapshot, inspect, sendCommand } = useControl();
  const [data, setData] = useState<MemoryInspection | null>(null);
  const [selected, setSelected] = useState<MemoryDocument | null>(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'memory' | 'rules'>('memory');
  const [externalOpen, setExternalOpen] = useState(false);
  const [externalScope, setExternalScope] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await inspect<MemoryInspection>('memory.inspect');
      setData(next);
      if (selected) {
        const match = next.documents.find(
          (item) =>
            item.scope === selected.scope &&
            item.name === selected.name &&
            item.documentKind === selected.documentKind,
        );
        if (match) setSelected(match);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load memory');
    } finally {
      setLoading(false);
    }
  }, [inspect, selected]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh, snapshot.activeProjectId, snapshot.activeSessionId]);

  const openDocument = async (document: MemoryDocument) => {
    setLoading(true);
    setError('');
    try {
      const full = await inspect<MemoryDocument>('memory.read', {
        scope: document.scope,
        documentKind: document.documentKind,
        name: document.name,
      });
      setSelected(full);
      setContent(full.content ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open memory');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      const result = await sendCommand('memory.save', {
        scope: selected.scope,
        documentKind: selected.documentKind,
        name: selected.name,
        sessionId: snapshot.activeSessionId,
        content,
        expectedRevision: selected.revision,
      });
      const updated = result.data as MemoryDocument | undefined;
      if (updated) {
        setSelected({ ...updated, scope: selected.scope, documentKind: selected.documentKind, name: selected.name });
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save memory');
    } finally {
      setLoading(false);
    }
  };

  const initialize = async (document: MemoryDocument) => {
    setLoading(true);
    setError('');
    try {
      await sendCommand('memory.init', {
        scope: document.scope,
        sessionId: snapshot.activeSessionId,
      });
      await refresh();
      await openDocument(document);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create memory file');
    } finally {
      setLoading(false);
    }
  };

  const createDocument = async () => {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    setError('');
    try {
      const result = await sendCommand('memory.create_document', { name, documentKind: newKind });
      setNewName('');
      setCreating(false);
      await refresh();
      const created = result.data as MemoryDocument | undefined;
      if (created) {
        await openDocument({
          ...created,
          scope: 'document',
          documentKind: newKind,
          name,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create memory document');
    } finally {
      setLoading(false);
    }
  };

  const updateMemorySetting = async (setting: string, value: unknown) => {
    setLoading(true);
    setError('');
    try {
      await sendCommand('setting.update', { settingId: `memory.${setting}`, value });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update memory settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(
      () => setExternalScope(String(data?.settings?.externalMemoryScope ?? '')),
      0,
    );
    return () => clearTimeout(timer);
  }, [data?.settings?.externalMemoryScope]);

  if (selected) {
    return (
      <View style={styles.flex}>
        <View style={styles.editorHeader}>
          <Pressable
            onPress={() => setSelected(null)}
            style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
          >
            <ChevronRight size={17} color={colors.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
            <Text numberOfLines={1} style={styles.editorTitle}>{memoryTitle(selected)}</Text>
          </Pressable>
          <ActionButton label="Save" icon={Save} primary loading={loading} onPress={() => void save()} />
        </View>
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Memory"
          placeholderTextColor={colors.textMuted}
          style={styles.documentEditor}
        />
        <ErrorText value={error} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.toolbar}>
        <Text style={styles.sectionTitle}>Memory</Text>
        <Pressable
          accessibilityLabel="Create memory document"
          onPress={() => setCreating((value) => !value)}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
        >
          <Plus size={19} color={colors.accent} />
        </Pressable>
        <Pressable
          accessibilityLabel="Refresh memory"
          onPress={() => void refresh()}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
        >
          <RefreshCw size={18} color={colors.textMuted} />
        </Pressable>
      </View>
      <ErrorText value={error} />
      {creating ? (
        <View style={styles.card}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Document name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <ChoiceStrip
            value={newKind}
            onChange={(value) => setNewKind(value === 'rules' ? 'rules' : 'memory')}
            options={[
              { value: 'memory', label: 'Memory' },
              { value: 'rules', label: 'Rules' },
            ]}
          />
          <ActionButton label="Create" icon={Plus} primary disabled={!newName.trim()} loading={loading} onPress={() => void createDocument()} />
        </View>
      ) : null}
      <View style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={externalOpen ? 'Collapse external memory' : 'Expand external memory'}
          onPress={() => setExternalOpen((value) => !value)}
          style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
        >
          <View style={styles.listCopy}>
            <Text style={styles.listTitle}>External memory</Text>
            <Text style={styles.meta}>
              {data?.settings?.externalMemoryEnabled
                ? String(data.settings.externalMemoryProvider || 'Select provider')
                : 'Off'}
            </Text>
          </View>
          {externalOpen ? (
            <ChevronDown size={17} color={colors.textMuted} />
          ) : (
            <ChevronRight size={17} color={colors.textMuted} />
          )}
        </Pressable>
        {externalOpen ? (
          <View style={styles.detailBlock}>
            <CompactToggle
              label="Use external memory"
              value={data?.settings?.externalMemoryEnabled === true}
              onChange={(value) => void updateMemorySetting('externalMemoryEnabled', value)}
            />
            {data?.settings?.externalMemoryEnabled ? (
              <>
                <Text style={styles.fieldLabel}>Provider</Text>
                <View style={styles.choiceWrap}>
                  {(data.externalProviders ?? []).map((provider) => {
                    const selected = data.settings?.externalMemoryProvider === provider.provider;
                    return (
                      <Pressable
                        key={provider.provider}
                        disabled={!provider.connected}
                        onPress={() => void updateMemorySetting('externalMemoryProvider', provider.provider)}
                        style={({ pressed }) => [
                          styles.choice,
                          selected && styles.choiceActive,
                          !provider.connected && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>
                          {provider.provider === 'mem0'
                            ? 'Mem0'
                            : provider.provider === 'letta'
                              ? 'Letta'
                              : provider.provider}
                        </Text>
                        {!provider.connected ? <Text style={styles.meta}>Needs provider key</Text> : null}
                      </Pressable>
                    );
                  })}
                </View>
                {data.externalProviders.some(
                  (provider) =>
                    provider.provider === data.settings?.externalMemoryProvider && provider.scopeRequired,
                ) ? (
                  <View style={styles.inlineField}>
                    <Text style={styles.fieldLabel}>Letta agent id</Text>
                    <View style={styles.inlineInputRow}>
                      <TextInput
                        value={externalScope}
                        onChangeText={setExternalScope}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="agent-..."
                        placeholderTextColor={colors.textMuted}
                        style={styles.input}
                      />
                      <ActionButton
                        label="Save"
                        disabled={externalScope === String(data.settings?.externalMemoryScope ?? '')}
                        onPress={() => void updateMemorySetting('externalMemoryScope', externalScope.trim())}
                      />
                    </View>
                  </View>
                ) : null}
                <CompactToggle
                  label="Include recalled memories in context"
                  value={data.settings?.externalMemoryInContext === true}
                  onChange={(value) => void updateMemorySetting('externalMemoryInContext', value)}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={styles.listCard}>
        {(data?.documents ?? []).map((document, index) => (
          <Pressable
            key={`${document.scope}:${document.documentKind ?? ''}:${document.name ?? index}`}
            onPress={() => document.exists ? void openDocument(document) : void initialize(document)}
            style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
          >
            <FileText size={17} color={document.exists ? colors.accent : colors.textMuted} />
            <View style={styles.listCopy}>
              <Text style={styles.listTitle}>{memoryTitle(document)}</Text>
              <Text numberOfLines={1} style={styles.meta}>
                {document.exists ? `${Math.max(0, document.size).toLocaleString()} bytes` : 'Create'}
              </Text>
            </View>
            <ChevronRight size={17} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// Keep existing imports on the maintained Notes implementation.
export { NotesControlView } from './NotesControlView';

export function CollaborationControlView() {
  const { snapshot, inspect, sendCommand } = useControl();
  const [data, setData] = useState<CollaborationInspection>({
    host: null,
    prompts: [],
    joins: [],
    participants: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [endArmed, setEndArmed] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinResult, setJoinResult] = useState('');
  const [hostOptionsOpen, setHostOptionsOpen] = useState(false);
  const [hostName, setHostName] = useState('');
  const [workspacePathsText, setWorkspacePathsText] = useState('');
  const hostOptionsInitialized = useRef(false);

  useEffect(() => {
    if (hostOptionsInitialized.current) return;
    const activeProject = snapshot.projects.find((project) => project.id === snapshot.activeProjectId);
    const root = activeProject?.path || snapshot.activeProjectId || '';
    setHostName(snapshot.machine.name || '');
    setWorkspacePathsText(root);
    hostOptionsInitialized.current = true;
  }, [snapshot.activeProjectId, snapshot.machine.name, snapshot.projects]);

  const refresh = useCallback(async () => {
    if (!snapshot.activeSessionId) return;
    setLoading(true);
    setError('');
    try {
      setData(await inspect<CollaborationInspection>('collab.inspect'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load team access');
    } finally {
      setLoading(false);
    }
  }, [inspect, snapshot.activeSessionId]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const run = async (name: string, payload: Record<string, unknown> = {}) => {
    setLoading(true);
    setError('');
    try {
      const result = await sendCommand(name, payload);
      if (name === 'collab.join') {
        const joined = result.data as {
          sessionName?: string;
          hostName?: string;
          tierId?: string;
        } | undefined;
        setJoinResult(joined?.sessionName || joined?.hostName || 'Joined');
        setJoinCode('');
      }
      await refresh();
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Team action failed');
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  const updatePolicy = (patch: CollaborationPolicy) => {
    if (!data.host) return;
    const modelCatalog = snapshot.modelCatalog.map((model) => ({
      id: model.id,
      label: model.name,
      provider: model.provider,
      reasoningLevels: model.reasoningLevels,
    }));
    void run('collab.policy', {
      hostId: data.host.id,
      policy: { modelCatalog, ...patch },
    });
  };

  if (!data.host) {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.heroCard}>
          <Users size={22} color={colors.accent} />
          <View style={styles.listCopy}>
            <Text style={styles.cardTitle}>Team access</Text>
            <Text style={styles.meta}>Share control of this chat from the desktop host.</Text>
          </View>
        </View>
        <ErrorText value={error} />
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: hostOptionsOpen }}
            onPress={() => setHostOptionsOpen((value) => !value)}
            style={({ pressed }) => [styles.compactHeader, pressed && styles.pressed]}
          >
            <Text style={styles.cardTitle}>Host options</Text>
            {hostOptionsOpen
              ? <ChevronDown size={17} color={colors.textMuted} />
              : <ChevronRight size={17} color={colors.textMuted} />}
          </Pressable>
          {hostOptionsOpen ? (
            <View style={styles.compactStack}>
              <TextInput
                value={hostName}
                onChangeText={setHostName}
                placeholder="Host name"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
              <TextInput
                value={workspacePathsText}
                onChangeText={setWorkspacePathsText}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Workspace roots, one host path per line"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.multilineInput]}
              />
            </View>
          ) : null}
        </View>
        <ActionButton
          label="Start"
          primary
          loading={loading}
          disabled={!snapshot.activeSessionId}
          onPress={() => void run('collab.start', {
            sessionId: snapshot.activeSessionId,
            ...(hostName.trim() ? { hostName: hostName.trim() } : {}),
            workspacePaths: listFromText(workspacePathsText),
          })}
        />
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Join with code</Text>
          <TextInput
            value={joinCode}
            onChangeText={(value) => setJoinCode(value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8))}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            placeholder="8 character code"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TextInput
            value={joinName}
            onChangeText={setJoinName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <ActionButton
            label="Join"
            disabled={joinCode.length !== 8 || loading}
            loading={loading}
            onPress={() => void run('collab.join', { joinCode, name: joinName.trim() })}
          />
          {joinResult ? <Text style={styles.meta}>{joinResult}</Text> : null}
        </View>
      </ScrollView>
    );
  }

  const policy = data.host.policy ?? {};
  const tiers = Array.isArray(policy.accessTiers) ? policy.accessTiers : [];

  const copyInvite = async (tierId: string) => {
    if (!data.host) return;
    const modelCatalog = snapshot.modelCatalog.map((model) => ({
      id: model.id,
      label: model.name,
      provider: model.provider,
      reasoningLevels: model.reasoningLevels,
    }));
    if (JSON.stringify(policy.modelCatalog ?? []) !== JSON.stringify(modelCatalog)) {
      await run('collab.policy', {
        hostId: data.host.id,
        policy: { modelCatalog },
      });
    }
    const result = await run('collab.invite', { hostId: data.host.id, tierId });
    const url = (result?.data as { url?: string } | undefined)?.url ?? '';
    if (url) await Clipboard.setStringAsync(url);
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Join code</Text>
          <Text selectable style={styles.codeValue}>{data.host.joinCode}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Participants</Text>
          <Text style={styles.statValue}>{data.participants.length}</Text>
        </View>
      </View>

      <ErrorText value={error} />

      {tiers.length ? (
        <CollaborationAccessProfiles
          policy={policy}
          models={snapshot.modelCatalog}
          joins={data.joins}
          participants={data.participants}
          loading={loading}
          onPolicy={updatePolicy}
          onInvite={(tierId) => void copyInvite(tierId)}
          onJoinDecision={(guestId, approved, tierId) =>
            void run('collab.join_decision', {
              hostId: data.host!.id,
              guestId,
              approved,
              ...(tierId ? { tierId } : {}),
            })
          }
          onAssignTier={(guestId, tierId) =>
            void run('collab.assign_tier', {
              hostId: data.host!.id,
              guestId,
              tierId,
            })
          }
        />
      ) : null}

      {data.prompts.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Prompt approvals</Text>
          {data.prompts.map((prompt, index) => {
            const promptId = String(prompt.promptId ?? prompt.id ?? '');
            if (!promptId) return null;
            return (
              <View key={promptId || index} style={styles.pendingCard}>
                <Text numberOfLines={4} style={styles.pendingText}>{String(prompt.content ?? 'Guest prompt')}</Text>
                <View style={styles.actionRow}>
                  <ActionButton
                    label="Reject"
                    onPress={() => void run('collab.prompt_decision', {
                      hostId: data.host!.id,
                      promptId,
                      approved: false,
                    })}
                  />
                  <ActionButton
                    label="Approve"
                    primary
                    onPress={() => void run('collab.prompt_decision', {
                      hostId: data.host!.id,
                      promptId,
                      approved: true,
                    })}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <ActionButton
        label={endArmed ? 'Tap again to end' : 'End team access'}
        danger
        loading={loading}
        onPress={() => {
          if (!endArmed) {
            setEndArmed(true);
            return;
          }
          void run('collab.end', { hostId: data.host!.id }).then(() => setEndArmed(false));
        }}
      />
    </ScrollView>
  );
}

function providerId(provider: MediaProvider): string {
  return provider.id || provider.provider || '';
}

type MediaDetail = MediaHistoryItem & {
  imageBase64?: string;
  videoBase64?: string;
  mimeType?: string;
  revisedPrompt?: string;
  duration?: string;
  aspectRatio?: string;
  mode?: 'generate' | 'edit' | string;
};

function mediaExtension(mimeType: string, kind: 'image' | 'video'): string {
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('quicktime')) return 'mov';
  if (mimeType.includes('mp4')) return 'mp4';
  return kind === 'video' ? 'mp4' : 'png';
}

function MediaVideoResult({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return (
    <VideoView
      player={player}
      style={styles.mediaVideo}
      nativeControls
      contentFit="contain"
    />
  );
}

export function MediaControlView() {
  const { inspect, sendCommand } = useControl();
  const instanceId = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const jobSequence = useRef(0);
  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [data, setData] = useState<MediaInspection>({
    imageProviders: [],
    videoProviders: [],
    imageHistory: [],
    videoHistory: [],
  });
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('');
  const [duration, setDuration] = useState('');
  const [size, setSize] = useState('');
  const [quality, setQuality] = useState('');
  const [effect, setEffect] = useState('cinematic');
  const [background, setBackground] = useState('auto');
  const [outputFormat, setOutputFormat] = useState('png');
  const [sourceImage, setSourceImage] = useState<PickedFile | null>(null);
  const [resolution, setResolution] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [sound, setSound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<MediaDetail | null>(null);
  const [resultUri, setResultUri] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await inspect<MediaInspection>('media.inspect');
      setData(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load media');
    } finally {
      setLoading(false);
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const providers = kind === 'image' ? data.imageProviders : data.videoProviders;
  const availableProviders = providers.filter((item) => item.configured !== false);
  const activeProvider =
    availableProviders.find((item) => providerId(item) === provider) ?? availableProviders[0];
  const models = activeProvider?.models ?? [];
  const activeProviderId = providerId(activeProvider ?? {});
  const activeModel = models.find((item) => item.id === model) ?? (model.trim() ? undefined : models[0]);
  const effectiveModelId = model.trim() || activeModel?.id || '';
  const history = kind === 'image' ? data.imageHistory : data.videoHistory;

  const generate = async () => {
    if (!prompt.trim()) return;
    const requestedPrompt = prompt.trim();
    jobSequence.current += 1;
    const jobId = `mobile-${kind}-${instanceId}-${jobSequence.current}`;
    setActiveJobId(jobId);
    setLoading(true);
    setError('');
    try {
      if (kind === 'image' && sourceImage && activeModel?.edits !== true) {
        throw new Error('The selected image model does not support editing');
      }
      const response = await sendCommand(
        kind === 'image'
          ? sourceImage
            ? 'media.edit_image'
            : 'media.generate_image'
          : 'media.generate_video',
        {
        jobId,
        prompt: requestedPrompt,
        provider: activeProviderId || undefined,
        model: effectiveModelId || undefined,
        ...(kind === 'image'
          ? {
              size: size || undefined,
              quality: quality || undefined,
              effect: effect || undefined,
              background: background || undefined,
              outputFormat: outputFormat || undefined,
              ...(sourceImage ? { imageBase64: sourceImage.data } : {}),
            }
          : {}),
        ...(kind === 'video'
          ? {
              aspectRatio: aspectRatio || undefined,
              duration: duration || undefined,
              resolution: resolution || undefined,
              negativePrompt: negativePrompt.trim() || undefined,
              sound,
            }
          : {}),
        },
      );
      const generated = (response.data ?? {}) as Partial<MediaDetail> & {
        historyId?: string;
      };
      const historyId =
        typeof generated.historyId === 'string' && generated.historyId
          ? generated.historyId
          : `generated-${jobId}`;
      const next: MediaDetail = {
        id: historyId,
        prompt: requestedPrompt,
        provider: typeof generated.provider === 'string' ? generated.provider : activeProviderId,
        model: typeof generated.model === 'string' ? generated.model : effectiveModelId || undefined,
        ...generated,
      };
      setResult(next);
      if (kind === 'video' && typeof next.videoBase64 === 'string' && next.videoBase64) {
        const mimeType = next.mimeType || 'video/mp4';
        setResultUri(
          cacheBase64File(
            `koryphaios-video-${historyId}.${mediaExtension(mimeType, 'video')}`,
            next.videoBase64,
          ),
        );
      } else {
        setResultUri('');
      }
      await refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Generation failed';
      if (!/cancel|abort/i.test(message)) setError(message);
    } finally {
      setActiveJobId('');
      setCancelling(false);
      setLoading(false);
    }
  };

  const cancelGeneration = async () => {
    if (!activeJobId || cancelling) return;
    setCancelling(true);
    setError('');
    try {
      await sendCommand('media.cancel', { kind, jobId: activeJobId });
    } catch (caught) {
      setCancelling(false);
      setError(caught instanceof Error ? caught.message : 'Could not cancel generation');
    }
  };

  const openHistory = async (item: MediaHistoryItem) => {
    setLoading(true);
    setError('');
    try {
      const detail = await inspect<MediaDetail>('media.history', { kind, id: item.id });
      const next = { ...item, ...detail };
      setResult(next);
      if (kind === 'video' && next.videoBase64) {
        const mimeType = next.mimeType || 'video/mp4';
        setResultUri(
          cacheBase64File(
            `koryphaios-video-${item.id}.${mediaExtension(mimeType, 'video')}`,
            next.videoBase64,
          ),
        );
      } else {
        setResultUri('');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open media history');
    } finally {
      setLoading(false);
    }
  };

  const downloadResult = async () => {
    if (!result) return;
    const base64 = kind === 'video' ? result.videoBase64 : result.imageBase64;
    if (!base64) {
      setError('This result is not available for download.');
      return;
    }
    const mimeType = result.mimeType || (kind === 'video' ? 'video/mp4' : 'image/png');
    const extension = mediaExtension(mimeType, kind);
    try {
      await shareBase64File(
        `koryphaios-${kind}-${result.id || 'result'}.${extension}`,
        base64,
        mimeType,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not share result');
    }
  };

  const copyResultPrompt = async () => {
    const text = result?.revisedPrompt || result?.prompt || prompt.trim();
    if (!text) return;
    await Clipboard.setStringAsync(text);
  };

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ChoiceStrip
        value={kind}
        onChange={(value) => {
          setKind(value === 'video' ? 'video' : 'image');
          setProvider('');
          setModel('');
          setResult(null);
          setResultUri('');
        }}
        options={[
          { value: 'image', label: 'Images' },
          { value: 'video', label: 'Video' },
        ]}
      />
      <ErrorText value={error} />
      <View style={styles.card}>
        <View style={styles.heroCard}>
          {kind === 'image' ? <ImageIcon size={20} color={colors.accent} /> : <Video size={20} color={colors.accent} />}
          <Text style={styles.cardTitle}>{kind === 'image' ? (sourceImage ? 'Edit image' : 'Generate image') : 'Generate video'}</Text>
        </View>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          multiline
          placeholder="Describe what to create"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.promptInput]}
        />
        {availableProviders.length > 1 ? (
          <ChoiceStrip
            value={activeProviderId}
            onChange={(value) => {
              setProvider(value);
              setModel('');
            }}
            options={availableProviders.map((item) => ({
              value: providerId(item),
              label: item.label || providerId(item),
            }))}
          />
        ) : null}
        {models.length > 1 ? (
          <ChoiceStrip
            value={activeModel?.id ?? ''}
            onChange={setModel}
            options={models.map((item) => ({ value: item.id, label: item.label || item.id }))}
          />
        ) : null}
        <Pressable
          onPress={() => setAdvanced((value) => !value)}
          style={({ pressed }) => [styles.detailsRow, pressed && styles.pressed]}
        >
          <Text style={styles.detailsLabel}>Options</Text>
          {advanced ? <ChevronDown size={16} color={colors.textMuted} /> : <ChevronRight size={16} color={colors.textMuted} />}
        </Pressable>
        {advanced && kind === 'image' ? (
          <View style={styles.detailsCard}>
            <TextInput
              value={models.some((item) => item.id === model) ? '' : model}
              onChangeText={setModel}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Custom model ID"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <View style={styles.listRow}>
              <View style={styles.listCopy}>
                <Text style={styles.listTitle}>{sourceImage?.name ?? 'Source image'}</Text>
                <Text style={styles.meta}>{sourceImage ? 'Editing this image' : 'Optional. Adds image edit mode.'}</Text>
              </View>
              <ActionButton
                label={sourceImage ? 'Change' : 'Choose'}
                onPress={() => {
                  void pickImageBase64()
                    .then((picked) => {
                      if (picked) setSourceImage(picked);
                    })
                    .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not open image'));
                }}
              />
              {sourceImage ? <ActionButton label="Clear" onPress={() => setSourceImage(null)} /> : null}
            </View>
            <Text style={styles.meta}>Effect</Text>
            <ChoiceStrip
              value={effect}
              onChange={setEffect}
              options={['none', 'cinematic', 'illustration', 'neon', 'miniature', 'watercolor'].map((value) => ({ value, label: value }))}
            />
            <TextInput value={size} onChangeText={setSize} placeholder="Size, e.g. 1024x1024" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput value={quality} onChangeText={setQuality} placeholder="Quality, e.g. high" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.meta}>Format</Text>
            <ChoiceStrip
              value={outputFormat}
              onChange={setOutputFormat}
              options={(activeModel?.formats?.length ? activeModel.formats : ['png', 'jpeg', 'webp']).map((value) => ({ value, label: value }))}
            />
            {(activeModel?.background?.length ?? 0) > 0 ? (
              <>
                <Text style={styles.meta}>Background</Text>
                <ChoiceStrip
                  value={background}
                  onChange={setBackground}
                  options={activeModel!.background!.map((value) => ({ value, label: value }))}
                />
              </>
            ) : null}
          </View>
        ) : null}
        {advanced && kind === 'video' ? (
          <View style={styles.detailsCard}>
            <TextInput
              value={models.some((item) => item.id === model) ? '' : model}
              onChangeText={setModel}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Custom model ID"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput value={aspectRatio} onChangeText={setAspectRatio} placeholder="Aspect ratio, e.g. 16:9" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput value={duration} onChangeText={setDuration} placeholder="Duration" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput value={resolution} onChangeText={setResolution} placeholder="Resolution, e.g. 1080p" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput value={negativePrompt} onChangeText={setNegativePrompt} placeholder="Negative prompt" placeholderTextColor={colors.textMuted} style={styles.input} />
            <CompactToggle label="Generate sound" value={sound} onChange={setSound} />
          </View>
        ) : null}
        <View style={styles.mediaActions}>
          <ActionButton
            label={activeJobId ? 'Generating' : 'Generate'}
            primary
            loading={Boolean(activeJobId)}
            disabled={!prompt.trim() || !activeProviderId || Boolean(activeJobId)}
            onPress={() => void generate()}
            style={styles.flexAction}
          />
          {activeJobId ? (
            <ActionButton
              label={cancelling ? 'Cancelling' : 'Cancel'}
              loading={cancelling}
              onPress={() => void cancelGeneration()}
            />
          ) : null}
        </View>
      </View>

      {result ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Result</Text>
          {kind === 'image' && result.imageBase64 ? (
            <Image
              source={{
                uri: `data:${result.mimeType || 'image/png'};base64,${result.imageBase64}`,
              }}
              resizeMode="contain"
              style={styles.mediaImage}
            />
          ) : null}
          {kind === 'video' && resultUri ? (
            <MediaVideoResult key={resultUri} uri={resultUri} />
          ) : null}
          <Text numberOfLines={2} style={styles.listTitle}>
            {result.revisedPrompt || result.prompt || 'Generated result'}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            {[result.provider, result.model].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.mediaActions}>
            {kind === 'image' && (result.revisedPrompt || result.prompt) ? (
              <ActionButton
                label="Copy prompt"
                icon={Copy}
                onPress={() => void copyResultPrompt()}
                style={styles.flexAction}
              />
            ) : null}
            <ActionButton
              label="Download"
              icon={Download}
              onPress={() => void downloadResult()}
              style={styles.flexAction}
            />
          </View>
        </View>
      ) : null}

      {history.length ? (
        <View style={styles.card}>
          <View style={styles.mediaRecentHeader}>
            <Text style={styles.cardTitle}>Recent</Text>
            <ActionButton
              label="Refresh"
              icon={RefreshCw}
              loading={loading && !activeJobId}
              onPress={() => void refresh()}
            />
          </View>
          {history.slice(0, 12).map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.prompt || 'media result'}`}
              disabled={loading}
              onPress={() => void openHistory(item)}
              style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
            >
              {kind === 'image' ? <ImageIcon size={16} color={colors.textMuted} /> : <Video size={16} color={colors.textMuted} />}
              <View style={styles.listCopy}>
                <Text numberOfLines={2} style={styles.listTitle}>{item.prompt || item.id}</Text>
                <Text numberOfLines={1} style={styles.meta}>{item.model || item.provider || ''}</Text>
              </View>
              <Pressable
                accessibilityLabel="Remove from history"
                onPress={() => void sendCommand('media.delete_history', {
                  kind,
                  historyId: item.id,
                }).then(refresh)}
                style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
              >
                <Trash2 size={16} color={colors.textMuted} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface1,
  },
  page: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  toolbar: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.lg,
    fontWeight: '800',
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  listCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  listRow: {
    minHeight: 54,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listCopy: {
    flex: 1,
    minWidth: 0,
  },
  listTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  meta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  empty: {
    padding: spacing.xl,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: typography.sm,
  },
  input: {
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    fontSize: typography.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
  },
  error: {
    color: colors.error,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  editorHeader: {
    minHeight: 54,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backRow: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editorTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
  },
  documentEditor: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    fontSize: typography.sm,
    lineHeight: 21,
    padding: spacing.md,
    fontFamily: 'monospace',
  },
  noteEditorPage: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  titleInput: {
    minHeight: 48,
    color: colors.textPrimary,
    fontSize: typography.xl,
    fontWeight: '800',
    paddingHorizontal: 2,
  },
  noteEditor: {
    minHeight: 260,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    fontSize: typography.base,
    lineHeight: 22,
    padding: spacing.md,
  },
  detailsRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsLabel: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  detailsCard: {
    gap: spacing.xs,
  },
  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  switchTrack: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface4,
    padding: 3,
  },
  switchTrackActive: {
    backgroundColor: colors.accent,
  },
  switchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textMuted,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
    backgroundColor: colors.onAccent,
  },
  choiceStrip: {
    gap: spacing.xs,
  },
  choice: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
    backgroundColor: colors.surface3,
    justifyContent: 'center',
  },
  choiceActive: {
    backgroundColor: colors.accentSoft,
  },
  choiceText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  choiceTextActive: {
    color: colors.accent,
  },
  detailBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xxs,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  disabled: {
    opacity: 0.4,
  },
  inlineField: {
    gap: 6,
  },
  inlineInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '800',
  },
  compactHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  compactStack: { gap: spacing.xs },
  multilineInput: { minHeight: 82 },
  statRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '600',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  codeValue: {
    color: colors.accent,
    fontSize: typography.lg,
    fontWeight: '800',
    letterSpacing: 2,
  },
  inviteUrl: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    lineHeight: 17,
    backgroundColor: colors.surface3,
    borderRadius: radii.lg,
    padding: spacing.sm,
  },
  decisionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  decisionText: {
    flex: 1,
    minWidth: 0,
    color: colors.textSecondary,
    fontSize: typography.sm,
  },
  pendingCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  pendingText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    lineHeight: 19,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  mediaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  flexAction: {
    flex: 1,
  },
  mediaRecentHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  mediaImage: {
    width: '100%',
    height: 320,
    borderRadius: radii.lg,
    backgroundColor: colors.surface1,
  },
  mediaVideo: {
    width: '100%',
    height: 320,
    borderRadius: radii.lg,
    backgroundColor: colors.surface1,
  },
  promptInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  pressed: {
    opacity: 0.66,
  },
});
