import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image as NativeImage,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { pickImageBase64 } from '../native/mobileFiles';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  CommandResult,
  ProviderAccount,
  ProviderAuthData,
  ProviderRemoteStatus,
  ProvidersInspection,
} from '../types/control';

const browserAuthProviders = new Set([
  'copilot',
  'codex-auth',
  'kimicode',
  'claude',
  'grok',
  'antigravity',
]);
const localCliProviders = new Set(['codex', 'cursor', 'devin', 'freebuff']);

function resultData<T>(result: CommandResult): T | undefined {
  return result.data as T | undefined;
}

function StateDot({ state }: { state: ProviderRemoteStatus['connectionState'] }) {
  const color =
    state === 'verified'
      ? colors.success
      : state === 'failed' || state === 'unavailable'
        ? colors.error
        : state === 'detected'
          ? colors.warning
          : colors.textMuted;
  return <View style={[styles.stateDot, { backgroundColor: color }]} />;
}

function SmallButton({
  label,
  onPress,
  icon: Icon,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  icon?: typeof RefreshCw;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        danger && styles.smallButtonDanger,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {Icon ? <Icon size={13} color={danger ? colors.error : colors.textSecondary} /> : null}
      <Text style={[styles.smallButtonText, danger && styles.smallButtonTextDanger]}>{label}</Text>
    </Pressable>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.toggle, value && styles.toggleOn]}
    >
      <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
    </Pressable>
  );
}

function AccountRow({
  provider,
  account,
  busy,
  run,
}: {
  provider: ProviderRemoteStatus;
  account: ProviderAccount;
  busy: boolean;
  run: (name: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const detected = account.source === 'cli-autodetect';
  const canActivate = !detected || provider.name === 'kimicode';
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(account.label);

  const saveRename = async () => {
    const next = label.trim();
    if (!next) return;
    if (next !== account.label) {
      await run('provider.account.rename', {
        provider: provider.name,
        accountId: account.id,
        label: next,
      });
    }
    setRenaming(false);
  };

  if (renaming && !detected) {
    return (
      <View style={styles.accountRenameRow}>
        <TextInput
          value={label}
          onChangeText={setLabel}
          onSubmitEditing={() => void saveRename()}
          autoFocus
          returnKeyType="done"
          placeholder="Account name"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.accountRenameInput]}
        />
        <SmallButton label="Save" disabled={busy || !label.trim()} onPress={() => void saveRename()} />
        <Pressable
          accessibilityLabel="Cancel rename"
          onPress={() => {
            setLabel(account.label);
            setRenaming(false);
          }}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <X size={14} color={colors.textMuted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.accountRow}>
      <View style={styles.accountCopy}>
        <Text numberOfLines={1} style={styles.accountName}>{account.label}</Text>
        <Text numberOfLines={1} style={styles.accountMeta}>
          {[account.email, account.plan, detected ? 'CLI' : 'Saved'].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {canActivate ? (
        <SmallButton
          label="Use"
          disabled={busy}
          onPress={() => void run('provider.account.activate', {
            provider: provider.name,
            accountId: account.id,
          })}
        />
      ) : null}
      {!detected ? (
        <Pressable
          accessibilityLabel={`Rename ${account.label}`}
          disabled={busy}
          onPress={() => setRenaming(true)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Pencil size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
      {!detected ? (
        <Pressable
          accessibilityLabel={`Remove ${account.label}`}
          disabled={busy}
          onPress={() => void run('provider.account.delete', {
            provider: provider.name,
            accountId: account.id,
          })}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Trash2 size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function parseCustomHeaders(raw: string): Record<string, string> | undefined {
  const parsed = new Map<string, { name: string; value: string }>();
  for (const line of raw.split('\n')) {
    const text = line.trim();
    const colon = text.indexOf(':');
    if (colon <= 0) continue;
    const name = text.slice(0, colon).trim();
    if (!/^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/.test(name)) continue;
    parsed.set(name.toLowerCase(), { name, value: text.slice(colon + 1).trim() });
  }
  if (!parsed.size) return undefined;
  return Object.fromEntries([...parsed.values()].map(({ name, value }) => [name, value]));
}

function CredentialForm({
  provider,
  busy,
  onSave,
  onClose,
}: {
  provider: ProviderRemoteStatus;
  busy: boolean;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [activate, setActivate] = useState(true);
  const hasValue = Boolean(apiKey.trim() || authToken.trim() || baseUrl.trim());

  return (
    <View style={styles.inlinePanel}>
      <View style={styles.inlineHeader}>
        <Text style={styles.inlineTitle}>Add account</Text>
        <Pressable accessibilityLabel="Close account form" onPress={onClose} style={styles.iconButton}>
          <X size={15} color={colors.textMuted} />
        </Pressable>
      </View>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Account name"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      {provider.supportsApiKey ? (
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="API key"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      ) : null}
      {provider.supportsAuthToken ? (
        <TextInput
          value={authToken}
          onChangeText={setAuthToken}
          placeholder="Auth token"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      ) : null}
      {provider.requiresBaseUrl || provider.authMode === 'base_url_only' ? (
        <TextInput
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder={provider.baseUrlPlaceholder ?? 'Endpoint URL'}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
        />
      ) : null}
      <View style={styles.inlineFooter}>
        <View style={styles.toggleLabelRow}>
          <Toggle value={activate} onChange={setActivate} />
          <Text style={styles.inlineHint}>Use now</Text>
        </View>
        <SmallButton
          label={busy ? 'Saving' : 'Save'}
          disabled={busy || !hasValue}
          onPress={() => void onSave({
            provider: provider.name,
            label,
            apiKey,
            authToken,
            baseUrl,
            activate,
          })}
        />
      </View>
    </View>
  );
}

type CustomProviderIconShape = 'rounded-square' | 'circle';

async function pickNormalizedProviderIcon(): Promise<{ base64: string; uri: string } | null> {
  const picked = await pickImageBase64();
  if (!picked) return null;
  if (picked.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');

  const probe = await ImageManipulator.manipulate(picked.uri).renderAsync();
  if (probe.width < 1 || probe.height < 1 || probe.width * probe.height > 40_000_000) {
    throw new Error('Choose an image smaller than 40 megapixels.');
  }
  const side = Math.min(probe.width, probe.height);
  const context = ImageManipulator.manipulate(picked.uri);
  context.crop({
    originX: Math.floor((probe.width - side) / 2),
    originY: Math.floor((probe.height - side) / 2),
    width: side,
    height: side,
  });
  context.resize({ width: 256, height: 256 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.PNG, compress: 1, base64: true });
  if (!saved.base64) throw new Error('Could not prepare this image.');
  return { base64: saved.base64, uri: saved.uri };
}

function CustomProviderIconModal({
  provider,
  visible,
  busy,
  run,
  onClose,
}: {
  provider: ProviderRemoteStatus;
  visible: boolean;
  busy: boolean;
  run: (name: string, payload: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [shape, setShape] = useState<CustomProviderIconShape>('rounded-square');
  const [draft, setDraft] = useState<{ base64: string; uri: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setShape('rounded-square');
      setDraft(null);
      setWorking(false);
      setError('');
    }, 0);
    return () => clearTimeout(timer);
  }, [visible]);

  const choose = async () => {
    setWorking(true);
    setError('');
    try {
      const next = await pickNormalizedProviderIcon();
      if (next) setDraft(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare this image.');
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setWorking(true);
    setError('');
    try {
      await run('provider.custom.icon.set', {
        provider: provider.name,
        base64: draft.base64,
        shape,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this icon.');
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    setWorking(true);
    setError('');
    try {
      await run('provider.custom.icon.remove', { provider: provider.name });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove this icon.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.iconEditorScreen}>
        <View style={styles.iconEditorHeader}>
          <Pressable disabled={working || busy} onPress={onClose} style={styles.iconEditorHeaderButton}>
            <Text style={styles.iconEditorHeaderText}>Cancel</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.iconEditorTitle}>{provider.label} icon</Text>
          <Pressable
            disabled={working || busy || !draft}
            onPress={() => void save()}
            style={[styles.iconEditorHeaderButton, !draft && styles.disabled]}
          >
            <Text style={[styles.iconEditorHeaderText, styles.iconEditorSaveText]}>Save</Text>
          </Pressable>
        </View>

        <View style={styles.iconEditorBody}>
          <View
            style={[
              styles.iconPreview,
              shape === 'circle' ? styles.iconPreviewCircle : styles.iconPreviewRounded,
            ]}
          >
            {draft ? (
              <NativeImage source={{ uri: draft.uri }} resizeMode="cover" style={styles.iconPreviewImage} />
            ) : (
              <ImageIcon size={34} color={colors.textMuted} />
            )}
          </View>

          <SmallButton
            label={working ? 'Preparing' : draft ? 'Choose another image' : 'Choose image'}
            icon={ImageIcon}
            disabled={working || busy}
            onPress={() => void choose()}
          />

          <View style={styles.iconShapeRow}>
            {(['rounded-square', 'circle'] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => setShape(value)}
                style={({ pressed }) => [
                  styles.iconShapeChoice,
                  shape === value && styles.iconShapeChoiceActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.iconShapeText, shape === value && styles.iconShapeTextActive]}>
                  {value === 'circle' ? 'Circle' : 'Rounded'}
                </Text>
              </Pressable>
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <SmallButton
            label="Remove current icon"
            danger
            disabled={working || busy}
            onPress={() => void remove()}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ProviderRow({
  provider,
  open,
  busy,
  auth,
  onToggle,
  run,
  startAuth,
  checkAuth,
}: {
  provider: ProviderRemoteStatus;
  open: boolean;
  busy: boolean;
  auth?: ProviderAuthData;
  onToggle: () => void;
  run: (name: string, payload: Record<string, unknown>) => Promise<void>;
  startAuth: (provider: ProviderRemoteStatus) => Promise<void>;
  checkAuth: (provider: ProviderRemoteStatus) => Promise<void>;
}) {
  const [addingAccount, setAddingAccount] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [iconEditorOpen, setIconEditorOpen] = useState(false);
  const orderedFallbackAccounts = useMemo(() => {
    const candidates = provider.accounts.filter((account) => account.source === 'cli-autodetect');
    const order = provider.fallbackOrder;
    return [
      ...order.map((id) => candidates.find((account) => account.id === id)).filter(Boolean),
      ...candidates.filter((account) => !order.includes(account.id)),
    ] as ProviderAccount[];
  }, [provider.accounts, provider.fallbackOrder]);
  const selected = new Set(provider.selectedModels);

  const moveFallback = (index: number, direction: -1 | 1) => {
    const next = [...orderedFallbackAccounts];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void run('provider.fallback.set', {
      provider: provider.name,
      order: next.map((account) => account.id),
      enabled: provider.fallbackEnabled,
    });
  };

  const toggleModel = (modelId: string) => {
    const next = new Set(selected);
    if (next.has(modelId)) next.delete(modelId);
    else next.add(modelId);
    void run('provider.credentials.set', {
      provider: provider.name,
      selectedModels: [...next],
    });
  };

  const models = provider.allAvailableModels
    .map((model) => ({ id: model.id ?? model.name ?? '', name: model.name ?? model.id ?? '' }))
    .filter((model) => model.id);

  return (
    <View style={[styles.providerCard, open && styles.providerCardOpen]}>
      <Pressable
        accessibilityRole="button"
        onPress={onToggle}
        style={({ pressed }) => [styles.providerHeader, pressed && styles.pressed]}
      >
        <StateDot state={provider.connectionState} />
        <View style={styles.providerCopy}>
          <Text numberOfLines={1} style={styles.providerName}>{provider.label}</Text>
          <Text numberOfLines={1} style={styles.providerMeta}>
            {provider.models.length || provider.allAvailableModels.length
              ? `${provider.allAvailableModels.length || provider.models.length} models`
              : provider.authSource || provider.deployment || provider.connectionState.replaceAll('_', ' ')}
          </Text>
        </View>
        {open
          ? <ChevronDown size={16} color={colors.textMuted} />
          : <ChevronRight size={16} color={colors.textMuted} />}
      </Pressable>

      {open ? (
        <View style={styles.providerBody}>
          {provider.verificationError ? (
            <Text style={styles.errorText}>{provider.verificationError}</Text>
          ) : null}

          {provider.name === 'bedrock' && provider.awsCredentialScan?.detected && provider.connectionState !== 'verified' ? (
            <View style={styles.systemCredentialCard}>
              <View style={styles.accountCopy}>
                <Text style={styles.groupTitle}>AWS login on this computer</Text>
                <Text style={styles.inlineHint}>{provider.awsCredentialScan.description}</Text>
              </View>
              <SmallButton
                label="Use"
                disabled={busy}
                onPress={() => void run('provider.credentials.set', {
                  provider: provider.name,
                  fullCheck: true,
                  awsRegion: provider.awsCredentialScan?.sources.find((source) => source.region)?.region,
                })}
              />
            </View>
          ) : null}

          <View style={styles.buttonRow}>
            <SmallButton
              label="Refresh"
              icon={RefreshCw}
              disabled={busy}
              onPress={() => void run('provider.refresh', { provider: provider.name })}
            />
            <SmallButton
              label="Verify"
              disabled={busy}
              onPress={() => void run('provider.refresh', {
                provider: provider.name,
                runtimeCheck: true,
              })}
            />
            {browserAuthProviders.has(provider.name) ? (
              <SmallButton
                label={provider.connectionState === 'verified' ? 'Sign in again' : 'Sign in'}
                icon={KeyRound}
                disabled={busy}
                onPress={() => void startAuth(provider)}
              />
            ) : null}
            {provider.custom ? (
              <SmallButton
                label="Icon"
                icon={ImageIcon}
                disabled={busy}
                onPress={() => setIconEditorOpen(true)}
              />
            ) : null}
            {(provider.credentialDetected || provider.enabled) ? (
              <SmallButton
                label={provider.custom ? 'Remove' : 'Disconnect'}
                danger
                disabled={busy}
                onPress={() => void run(
                  provider.custom ? 'provider.custom.delete' : 'provider.disconnect',
                  { provider: provider.name },
                )}
              />
            ) : null}
          </View>

          {auth ? (
            <View style={styles.authPanel}>
              {auth.userCode ? <Text selectable style={styles.authCode}>{auth.userCode}</Text> : null}
              <Text style={styles.authMessage}>{auth.message ?? 'Finish sign in, then check access.'}</Text>
              <SmallButton label="Check access" disabled={busy} onPress={() => void checkAuth(provider)} />
            </View>
          ) : null}

          {models.length ? (
            <View style={styles.group}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowModels((value) => !value)}
                style={styles.groupHeader}
              >
                <Text style={styles.groupTitle}>Models</Text>
                <Text style={styles.groupMeta}>
                  {provider.selectedModels.length ? `${provider.selectedModels.length} selected` : 'All'}
                </Text>
                {showModels
                  ? <ChevronDown size={14} color={colors.textMuted} />
                  : <ChevronRight size={14} color={colors.textMuted} />}
              </Pressable>
              {showModels ? (
                <View style={styles.modelList}>
                  {models.map((model) => {
                    const explicitSelection = provider.selectedModels.length > 0;
                    const active = explicitSelection ? selected.has(model.id) : true;
                    return (
                      <Pressable
                        key={model.id}
                        onPress={() => toggleModel(model.id)}
                        style={({ pressed }) => [styles.modelRow, pressed && styles.pressed]}
                      >
                        <View style={[styles.checkBox, active && styles.checkBoxOn]}>
                          {active ? <Check size={11} color={colors.onAccent} /> : null}
                        </View>
                        <Text numberOfLines={1} style={styles.modelName}>{model.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {provider.accounts.length ? (
            <View style={styles.group}>
              <Text style={styles.groupTitle}>Accounts</Text>
              {provider.accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  provider={provider}
                  account={account}
                  busy={busy}
                  run={run}
                />
              ))}
            </View>
          ) : null}

          {orderedFallbackAccounts.length > 1 ? (
            <View style={styles.group}>
              <View style={styles.fallbackHeader}>
                <View style={styles.accountCopy}>
                  <Text style={styles.groupTitle}>Fallback</Text>
                </View>
                <Toggle
                  value={provider.fallbackEnabled}
                  onChange={(enabled) => void run('provider.fallback.set', {
                    provider: provider.name,
                    order: orderedFallbackAccounts.map((account) => account.id),
                    enabled,
                  })}
                />
              </View>
              {orderedFallbackAccounts.map((account, index) => (
                <View key={account.id} style={styles.fallbackRow}>
                  <Text style={styles.fallbackIndex}>{index + 1}</Text>
                  <Text numberOfLines={1} style={styles.fallbackName}>{account.label}</Text>
                  <Pressable
                    disabled={busy || index === 0}
                    onPress={() => moveFallback(index, -1)}
                    style={[styles.iconButton, index === 0 && styles.disabled]}
                  >
                    <ArrowUp size={14} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    disabled={busy || index === orderedFallbackAccounts.length - 1}
                    onPress={() => moveFallback(index, 1)}
                    style={[
                      styles.iconButton,
                      index === orderedFallbackAccounts.length - 1 && styles.disabled,
                    ]}
                  >
                    <ArrowDown size={14} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {!localCliProviders.has(provider.name) && !addingAccount ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setAddingAccount(true)}
              style={({ pressed }) => [styles.addInline, pressed && styles.pressed]}
            >
              <Plus size={14} color={colors.textMuted} />
              <Text style={styles.addInlineText}>Add account</Text>
            </Pressable>
          ) : null}
          {addingAccount ? (
            <CredentialForm
              provider={provider}
              busy={busy}
              onClose={() => setAddingAccount(false)}
              onSave={async (values) => {
                await run('provider.account.add', values);
                setAddingAccount(false);
              }}
            />
          ) : null}
          {provider.custom ? (
            <CustomProviderIconModal
              provider={provider}
              visible={iconEditorOpen}
              busy={busy}
              run={run}
              onClose={() => setIconEditorOpen(false)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CustomProviderForm({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [adapter, setAdapter] = useState('');
  const [headers, setHeaders] = useState('');
  const [allowUnverified, setAllowUnverified] = useState(false);
  return (
    <View style={styles.customPanel}>
      <View style={styles.inlineHeader}>
        <Text style={styles.inlineTitle}>Custom provider</Text>
        <Pressable accessibilityLabel="Close custom provider" onPress={onClose} style={styles.iconButton}>
          <X size={15} color={colors.textMuted} />
        </Pressable>
      </View>
      <TextInput value={label} onChangeText={setLabel} placeholder="Name" placeholderTextColor={colors.textMuted} style={styles.input} />
      <TextInput
        value={baseUrl}
        onChangeText={setBaseUrl}
        placeholder="Endpoint URL"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={styles.input}
      />
      <TextInput
        value={apiKey}
        onChangeText={setApiKey}
        placeholder="API key, if needed"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={styles.input}
      />
      <TextInput
        value={models}
        onChangeText={setModels}
        placeholder="Model IDs, comma separated"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedOpen }}
        onPress={() => setAdvancedOpen((value) => !value)}
        style={({ pressed }) => [styles.advancedHeader, pressed && styles.pressed]}
      >
        <Text style={styles.advancedTitle}>Advanced</Text>
        {advancedOpen
          ? <ChevronDown size={15} color={colors.textMuted} />
          : <ChevronRight size={15} color={colors.textMuted} />}
      </Pressable>
      {advancedOpen ? (
        <View style={styles.advancedBody}>
          <Text style={styles.fieldLabel}>Wire adapter</Text>
          <View style={styles.adapterRow}>
            {[
              { value: '', label: 'Auto' },
              { value: 'ollama', label: 'Ollama' },
              { value: 'cohere', label: 'Cohere' },
            ].map((option) => {
              const active = adapter === option.value;
              return (
                <Pressable
                  key={option.value || 'auto'}
                  onPress={() => setAdapter(option.value)}
                  style={({ pressed }) => [
                    styles.adapterChoice,
                    active && styles.adapterChoiceActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.adapterChoiceText, active && styles.adapterChoiceTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={headers}
            onChangeText={setHeaders}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            placeholder="Custom headers, one Name: Value per line"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, styles.headersInput]}
          />
          <View style={styles.unverifiedRow}>
            <View style={styles.accountCopy}>
              <Text style={styles.groupTitle}>Save if model discovery fails</Text>
              <Text style={styles.inlineHint}>Requires explicit model IDs above.</Text>
            </View>
            <Toggle value={allowUnverified} onChange={setAllowUnverified} />
          </View>
        </View>
      ) : null}
      <View style={styles.inlineFooter}>
        <View />
        <SmallButton
          label={busy ? 'Adding' : 'Add'}
          disabled={busy || !label.trim() || !baseUrl.trim() || (allowUnverified && !models.trim())}
          onPress={() => void onSave({
            label,
            baseUrl,
            apiKey,
            models,
            adapter: adapter || undefined,
            headers: parseCustomHeaders(headers),
            allowUnverified,
          })}
        />
      </View>
    </View>
  );
}

export function ProviderSettingsView({ showIntro = true }: { showIntro?: boolean }) {
  const { pairing, inspect, sendCommand } = useControl();
  const [inspection, setInspection] = useState<ProvidersInspection | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [auth, setAuth] = useState<Record<string, ProviderAuthData>>({});
  const [customOpen, setCustomOpen] = useState(false);

  const load = useCallback(async () => {
    if (!pairing) return;
    try {
      setError('');
      setInspection(await inspect<ProvidersInspection>('providers.inspect'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load providers');
    }
  }, [inspect, pairing]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const run = useCallback(async (name: string, payload: Record<string, unknown>) => {
    const key = `${name}:${String(payload.provider ?? '')}`;
    setBusyKey(key);
    setError('');
    try {
      await sendCommand(name, payload);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Provider action failed');
      throw caught;
    } finally {
      setBusyKey('');
    }
  }, [load, sendCommand]);

  const startAuth = useCallback(async (provider: ProviderRemoteStatus) => {
    setBusyKey(`provider.auth.start:${provider.name}`);
    setError('');
    try {
      const result = await sendCommand('provider.auth.start', { provider: provider.name });
      const data = resultData<ProviderAuthData>(result) ?? {};
      if (data.status === 'connected' || data.status === 'detected') {
        setAuth((current) => {
          const next = { ...current };
          delete next[provider.name];
          return next;
        });
        await load();
        return;
      }
      const url = data.verificationUriComplete ?? data.url ?? data.verificationUri;
      if (url) await Linking.openURL(url);
      setAuth((current) => ({ ...current, [provider.name]: data }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start sign in');
    } finally {
      setBusyKey('');
    }
  }, [load, sendCommand]);

  const checkAuth = useCallback(async (provider: ProviderRemoteStatus) => {
    const current = auth[provider.name];
    setBusyKey(`provider.auth.check:${provider.name}`);
    setError('');
    try {
      const result =
        current?.deviceCode && ['copilot', 'kimicode'].includes(provider.name)
          ? await sendCommand('provider.auth.poll', {
              provider: provider.name,
              deviceCode: current.deviceCode,
            })
          : await sendCommand('provider.auth.complete', { provider: provider.name });
      const data = resultData<ProviderAuthData>(result) ?? {};
      if (data.status === 'connected' || data.status === 'verified' || result.accepted) {
        setAuth((state) => {
          const next = { ...state };
          delete next[provider.name];
          return next;
        });
      } else {
        setAuth((state) => ({ ...state, [provider.name]: { ...current, ...data } }));
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign in is not complete');
    } finally {
      setBusyKey('');
    }
  }, [auth, load, sendCommand]);

  if (!pairing) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Pair a Koryphaios machine to manage its providers.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      {showIntro ? (
        <View style={styles.intro}>
          <View style={styles.introCopy}>
            <Text style={styles.heading}>Providers & models</Text>
            <Text style={styles.description}>Accounts, models and routing on the remote machine</Text>
          </View>
          <Pressable
            accessibilityLabel="Add custom provider"
            onPress={() => setCustomOpen((value) => !value)}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Plus size={17} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {customOpen ? (
        <CustomProviderForm
          busy={busyKey === 'provider.custom.add:'}
          onClose={() => setCustomOpen(false)}
          onSave={async (values) => {
            await run('provider.custom.add', values);
            setCustomOpen(false);
          }}
        />
      ) : null}

      {error ? <Text style={styles.pageError}>{error}</Text> : null}

      {!inspection ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <View style={styles.providerList}>
          {inspection.providers.map((provider) => (
            <ProviderRow
              key={provider.name}
              provider={provider}
              open={expanded === provider.name}
              busy={busyKey.endsWith(`:${provider.name}`) || busyKey.includes(`:${provider.name}:`)}
              auth={auth[provider.name]}
              onToggle={() => setExpanded((current) => current === provider.name ? null : provider.name)}
              run={run}
              startAuth={startAuth}
              checkAuth={checkAuth}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
  },
  intro: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  introCopy: { flex: 1, minWidth: 0 },
  heading: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  description: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: typography.sm,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface3,
  },
  providerList: { gap: 5 },
  providerCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  providerCardOpen: { backgroundColor: colors.surface2 },
  providerHeader: {
    minHeight: 54,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateDot: { width: 8, height: 8, borderRadius: 4 },
  providerCopy: { flex: 1, minWidth: 0 },
  providerName: {
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  providerMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 10,
    textTransform: 'capitalize',
  },
  providerBody: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  smallButton: {
    minHeight: 32,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  smallButtonDanger: { backgroundColor: colors.errorSoft },
  smallButtonText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  smallButtonTextDanger: { color: colors.error },
  iconEditorScreen: {
    flex: 1,
    backgroundColor: colors.surface1,
  },
  iconEditorHeader: {
    minHeight: 52,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconEditorHeaderButton: {
    minWidth: 62,
    minHeight: 40,
    justifyContent: 'center',
  },
  iconEditorHeaderText: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  iconEditorSaveText: {
    color: colors.accent,
    textAlign: 'right',
  },
  iconEditorTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '800',
    textAlign: 'center',
  },
  iconEditorBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  iconPreview: {
    width: 144,
    height: 144,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconPreviewCircle: { borderRadius: 72 },
  iconPreviewRounded: { borderRadius: 34 },
  iconPreviewImage: { width: '100%', height: '100%' },
  iconShapeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconShapeChoice: {
    minWidth: 98,
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShapeChoiceActive: { backgroundColor: colors.accentSoft },
  iconShapeText: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700' },
  iconShapeTextActive: { color: colors.accent },
  group: {
    borderRadius: radii.md,
    backgroundColor: colors.surface1,
    padding: spacing.xs,
    gap: 4,
  },
  groupHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  groupTitle: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  groupMeta: { color: colors.textMuted, fontSize: 10 },
  modelList: { gap: 1 },
  modelRow: {
    minHeight: 37,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: colors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: colors.accent },
  modelName: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.xs,
  },
  accountRow: {
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: spacing.xs,
  },
  accountRenameRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: spacing.xs,
  },
  accountRenameInput: { flex: 1, minHeight: 36, height: 36 },
  accountCopy: { flex: 1, minWidth: 0 },
  accountName: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '600',
  },
  accountMeta: { marginTop: 2, color: colors.textMuted, fontSize: 9 },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  systemCredentialCard: {
    minHeight: 54,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fallbackRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fallbackIndex: {
    width: 23,
    textAlign: 'center',
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
  },
  fallbackName: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.xs,
  },
  toggle: {
    width: 40,
    height: 24,
    padding: 3,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: colors.surface4,
  },
  toggleOn: { backgroundColor: colors.accent },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textSecondary,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.onAccent,
  },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addInline: {
    minHeight: 38,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  addInlineText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  inlinePanel: {
    borderRadius: radii.md,
    backgroundColor: colors.surface1,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  customPanel: {
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  input: {
    minHeight: 42,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    fontSize: typography.sm,
  },
  advancedHeader: {
    minHeight: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  advancedTitle: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  advancedBody: { gap: spacing.xs },
  fieldLabel: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700' },
  adapterRow: { flexDirection: 'row', gap: spacing.xs },
  adapterChoice: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adapterChoiceActive: { backgroundColor: colors.accentSoft },
  adapterChoiceText: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700' },
  adapterChoiceTextActive: { color: colors.accent },
  headersInput: { minHeight: 76, paddingTop: spacing.sm },
  unverifiedRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inlineFooter: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  inlineHint: { color: colors.textMuted, fontSize: typography.xs },
  authPanel: {
    borderRadius: radii.md,
    backgroundColor: colors.accentSofter,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  authCode: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
  },
  authMessage: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.xs,
    lineHeight: 16,
  },
  pageError: {
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.errorSoft,
    color: colors.error,
    padding: spacing.sm,
    fontSize: typography.xs,
  },
  loading: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    maxWidth: 360,
    color: colors.textMuted,
    fontSize: typography.sm,
    textAlign: 'center',
  },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.68 },
});
