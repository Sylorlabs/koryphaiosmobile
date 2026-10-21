import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Server,
  Trash2,
  X,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import { formatCommandArguments, parseCommandArguments } from '../utils/commandArguments';
import type {
  McpInspection,
  McpRegistryEntry,
  McpServerStatus,
} from '../types/control';
import { ActionButton } from './ui';

type KeyValueRow = {
  key: string;
  value: string;
  secret?: boolean;
};

type FormState = {
  currentName: string;
  name: string;
  type: 'stdio' | 'sse';
  command: string;
  args: string;
  url: string;
  env: KeyValueRow[];
  headers: KeyValueRow[];
};

const emptyForm = (): FormState => ({
  currentName: '',
  name: '',
  type: 'stdio',
  command: '',
  args: '',
  url: '',
  env: [],
  headers: [],
});

function displayName(value: string): string {
  if (!value) return 'MCP server';
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function RegistryCard({
  entry,
  onSelect,
}: {
  entry: McpRegistryEntry;
  onSelect: (entry: McpRegistryEntry) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect(entry)}
      style={({ pressed }) => [styles.registryCard, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Server size={16} color={colors.accent} />
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.rowTitle}>{entry.title || entry.name}</Text>
          {entry.auth && entry.auth.kind !== 'none' ? (
            <Text style={styles.badge}>
              {entry.auth.kind === 'oauth'
                ? 'Sign in'
                : entry.auth.kind === 'env'
                  ? 'Key'
                  : entry.auth.kind === 'headers'
                    ? 'Token'
                    : entry.auth.kind === 'manual'
                      ? 'App credentials'
                      : 'Setup'}
            </Text>
          ) : null}
        </View>
        <Text numberOfLines={2} style={styles.rowMeta}>{entry.description}</Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export function McpControlView() {
  const { inspect, sendCommand } = useControl();
  const [data, setData] = useState<McpInspection>({ servers: [], featured: [] });
  const [view, setView] = useState<'servers' | 'discover' | 'form'>('servers');
  const [expanded, setExpanded] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<McpRegistryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [removeArmed, setRemoveArmed] = useState('');
  const [awaitingOAuth, setAwaitingOAuth] = useState('');
  const [manualClientId, setManualClientId] = useState('');
  const [manualClientSecret, setManualClientSecret] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await inspect<McpInspection>('mcp.inspect'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load MCP servers');
    } finally {
      setLoading(false);
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const startManual = () => {
    setForm(emptyForm());
    setView('form');
    setError('');
  };

  const startRegistry = (entry: McpRegistryEntry) => {
    setForm({
      currentName: '',
      name: entry.name,
      type: entry.transport,
      command: entry.command ?? '',
      args: formatCommandArguments(entry.args),
      url: entry.url ?? '',
      env: entry.envVars.map((item) => ({
        key: item.name,
        value: item.defaultValue ?? '',
        secret: item.isSecret,
      })),
      headers: entry.headerVars.map((item) => ({
        key: item.name,
        value: '',
        secret: item.isSecret,
      })),
    });
    setView('form');
    setError('');
  };

  const startEdit = async (server: McpServerStatus) => {
    setLoading(true);
    setError('');
    try {
      const env = await inspect<{ keys: string[] }>('mcp.env_keys', { name: server.name });
      setForm({
        currentName: server.name,
        name: server.name,
        type: server.transport,
        command: '',
        args: '',
        url: '',
        env: (env.keys ?? []).map((key) => ({ key, value: '', secret: true })),
        headers: [],
      });
      setView('form');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not edit MCP server');
    } finally {
      setLoading(false);
    }
  };

  const updateRows = (
    type: 'env' | 'headers',
    index: number,
    field: 'key' | 'value',
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [type]: current[type].map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    }));
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) return;
    const input: Record<string, unknown> = { name, type: form.type };
    if (form.type === 'stdio') {
      if (form.command.trim()) input.command = form.command.trim();
      let args: string[];
      try {
        args = parseCommandArguments(form.args);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Invalid command arguments');
        return;
      }
      if (args.length) input.args = args;
      const env = Object.fromEntries(
        form.env
          .map((row) => [row.key.trim(), row.value] as const)
          .filter(([key, value]) => key && value),
      );
      if (Object.keys(env).length) input.env = env;
    } else {
      if (form.url.trim()) input.url = form.url.trim();
      const headers = Object.fromEntries(
        form.headers
          .map((row) => [row.key.trim(), row.value] as const)
          .filter(([key, value]) => key && value),
      );
      if (Object.keys(headers).length) input.headers = headers;
    }

    setLoading(true);
    setError('');
    try {
      const result = await sendCommand('mcp.save', { currentName: form.currentName, input });
      if (!result.accepted) throw new Error('The host did not accept this MCP server change.');
      setView('servers');
      setForm(emptyForm());
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save MCP server');
    } finally {
      setLoading(false);
    }
  };

  const searchRegistry = async (cursor = '') => {
    const query = search.trim();
    if (!query) {
      setSearchResults([]);
      setNextCursor(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await inspect<{ results: McpRegistryEntry[]; nextCursor: string | null }>(
        'mcp.search',
        { query, cursor },
      );
      setSearchResults((current) => cursor ? [...current, ...result.results] : result.results);
      setNextCursor(result.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Registry search failed');
    } finally {
      setLoading(false);
    }
  };

  const runServerAction = async (action: 'test' | 'reload' | 'remove', server: McpServerStatus) => {
    setLoading(true);
    setError('');
    try {
      await sendCommand(`mcp.${action}`, { name: server.name });
      setRemoveArmed('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${action} MCP server`);
    } finally {
      setLoading(false);
    }
  };

  const beginOAuth = async (server: McpServerStatus) => {
    setLoading(true);
    setError('');
    try {
      const result = await sendCommand('mcp.oauth_start', {
        name: server.name,
        ...(manualClientId.trim() ? { clientId: manualClientId.trim() } : {}),
        ...(manualClientSecret.trim() ? { clientSecret: manualClientSecret.trim() } : {}),
      });
      const auth = result.data as { authorizationUrl?: string } | undefined;
      if (!auth?.authorizationUrl) throw new Error('The host did not return an authorization URL');
      setAwaitingOAuth(server.name);
      await Linking.openURL(auth.authorizationUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start authorization');
    } finally {
      setLoading(false);
    }
  };

  const finishOAuth = async (server: McpServerStatus) => {
    setLoading(true);
    setError('');
    try {
      await sendCommand('mcp.oauth_complete', { name: server.name });
      setAwaitingOAuth('');
      setManualClientId('');
      setManualClientSecret('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authorization is not complete yet');
    } finally {
      setLoading(false);
    }
  };

  const cancelOAuth = async (server: McpServerStatus) => {
    setLoading(true);
    try {
      await sendCommand('mcp.oauth_cancel', { name: server.name });
      setAwaitingOAuth('');
    } finally {
      setLoading(false);
    }
  };

  const source = search.trim() ? searchResults : data.featured;
  const featuredGroups = useMemo(() => {
    const groups = new Map<string, McpRegistryEntry[]>();
    for (const entry of source) {
      const key = search.trim() ? 'Results' : entry.category || 'Featured';
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    return [...groups.entries()];
  }, [search, source]);

  if (view === 'form') {
    return (
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.formHeader}>
          <Pressable
            accessibilityLabel="Close MCP server editor"
            onPress={() => setView('servers')}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
          >
            <X size={18} color={colors.textMuted} />
          </Pressable>
          <View style={styles.rowCopy}>
            <Text style={styles.sectionTitle}>{form.currentName ? 'Edit server' : 'Add server'}</Text>
            <Text style={styles.rowMeta}>Runs on the paired Koryphaios host.</Text>
          </View>
          <ActionButton label="Save" primary loading={loading} disabled={!form.name.trim()} onPress={() => void save()} />
        </View>

        <TextInput
          value={form.name}
          onChangeText={(name) => setForm((current) => ({ ...current, name }))}
          editable={!form.currentName}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Server name"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />

        <View style={styles.segmentRow}>
          {(['stdio', 'sse'] as const).map((type) => (
            <Pressable
              key={type}
              onPress={() => setForm((current) => ({ ...current, type }))}
              style={({ pressed }) => [
                styles.segment,
                form.type === type && styles.segmentActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.segmentText, form.type === type && styles.segmentTextActive]}>
                {type === 'stdio' ? 'Local command' : 'Remote URL'}
              </Text>
            </Pressable>
          ))}
        </View>

        {form.type === 'stdio' ? (
          <>
            <TextInput
              value={form.command}
              onChangeText={(command) => setForm((current) => ({ ...current, command }))}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Command"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <TextInput
              value={form.args}
              onChangeText={(args) => {
                setError('');
                setForm((current) => ({ ...current, args }));
              }}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Arguments"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <KeyValueEditor
              title="Environment"
              rows={form.env}
              onRowsChange={(rows) => setForm((current) => ({ ...current, env: rows }))}
              onChange={(index, field, value) => updateRows('env', index, field, value)}
            />
          </>
        ) : (
          <>
            <TextInput
              value={form.url}
              onChangeText={(url) => setForm((current) => ({ ...current, url }))}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <KeyValueEditor
              title="Headers"
              rows={form.headers}
              onRowsChange={(rows) => setForm((current) => ({ ...current, headers: rows }))}
              onChange={(index, field, value) => updateRows('headers', index, field, value)}
            />
          </>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.toolbar}>
        <View style={styles.segmentRow}>
          {(['servers', 'discover'] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setView(item)}
              style={({ pressed }) => [
                styles.segment,
                view === item && styles.segmentActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.segmentText, view === item && styles.segmentTextActive]}>
                {item === 'servers' ? 'Servers' : 'Discover'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityLabel="Refresh MCP servers"
          onPress={() => void refresh()}
          style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
        >
          <RefreshCw size={17} color={colors.textMuted} />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {view === 'servers' ? (
        <>
          <Pressable
            onPress={startManual}
            style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
          >
            <Plus size={17} color={colors.accent} />
            <Text style={styles.addText}>Add server</Text>
          </Pressable>
          <View style={styles.listCard}>
            {data.servers.map((server) => {
              const open = expanded === server.name;
              return (
                <View key={server.name}>
                  <Pressable
                    onPress={() => setExpanded((current) => current === server.name ? '' : server.name)}
                    style={({ pressed }) => [styles.serverRow, pressed && styles.pressed]}
                  >
                    <View style={styles.statusWrap}>
                      <View style={[styles.statusDot, server.connected && styles.statusDotReady]} />
                    </View>
                    <View style={styles.rowCopy}>
                      <Text numberOfLines={1} style={styles.rowTitle}>{server.name}</Text>
                      <Text numberOfLines={1} style={styles.rowMeta}>
                        {server.connected
                          ? `${server.toolCount} tool${server.toolCount === 1 ? '' : 's'}`
                          : server.lastError || server.auth?.detail || displayName(server.transport)}
                      </Text>
                    </View>
                    {open ? (
                      <ChevronDown size={16} color={colors.textMuted} />
                    ) : (
                      <ChevronRight size={16} color={colors.textMuted} />
                    )}
                  </Pressable>
                  {open ? (
                    <View style={styles.serverDetails}>
                      <View style={styles.actionWrap}>
                        <ActionButton label="Test" loading={loading} onPress={() => void runServerAction('test', server)} />
                        <ActionButton label="Reload" disabled={!server.configured} onPress={() => void runServerAction('reload', server)} />
                        <ActionButton label="Edit" disabled={!server.configured} onPress={() => void startEdit(server)} />
                      </View>

                      {server.oauth?.authorized ? (
                        <View style={styles.authBlock}>
                          <View style={styles.authTitleRow}>
                            <CheckCircle2 size={15} color={colors.success} />
                            <Text style={styles.authTitle}>Authorized</Text>
                          </View>
                          <ActionButton
                            label="Disconnect"
                            onPress={() =>
                              void sendCommand('mcp.oauth_disconnect', { name: server.name })
                                .then(() => refresh())
                                .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not disconnect'))
                            }
                          />
                        </View>
                      ) : server.auth?.kind === 'oauth' || server.auth?.kind === 'manual' || server.oauth?.needsAuthorization ? (
                        <View style={styles.authBlock}>
                          <View style={styles.authTitleRow}>
                            <KeyRound size={15} color={colors.accent} />
                            <Text style={styles.authTitle}>{server.auth?.label || 'Authorize'}</Text>
                          </View>
                          {server.auth?.kind === 'manual' ? (
                            <>
                              <TextInput
                                value={manualClientId}
                                onChangeText={setManualClientId}
                                autoCapitalize="none"
                                autoCorrect={false}
                                placeholder="Client ID"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                              />
                              <TextInput
                                value={manualClientSecret}
                                onChangeText={setManualClientSecret}
                                autoCapitalize="none"
                                autoCorrect={false}
                                secureTextEntry
                                placeholder="Client secret (optional)"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                              />
                            </>
                          ) : null}
                          <View style={styles.actionWrap}>
                            {awaitingOAuth === server.name ? (
                              <>
                                <ActionButton label="Finish sign-in" primary loading={loading} onPress={() => void finishOAuth(server)} />
                                <ActionButton label="Cancel" onPress={() => void cancelOAuth(server)} />
                              </>
                            ) : (
                              <ActionButton label="Authorize" primary loading={loading} onPress={() => void beginOAuth(server)} />
                            )}
                          </View>
                        </View>
                      ) : null}

                      <ActionButton
                        label={removeArmed === server.name ? 'Confirm remove' : 'Remove'}
                        icon={Trash2}
                        danger
                        onPress={() => {
                          if (removeArmed !== server.name) {
                            setRemoveArmed(server.name);
                            return;
                          }
                          void runServerAction('remove', server);
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
            {!data.servers.length ? <Text style={styles.empty}>No MCP servers configured.</Text> : null}
          </View>
        </>
      ) : (
        <>
          <View style={styles.searchRow}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => void searchRegistry()}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Search MCP registry"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
            />
            <ActionButton label="Search" disabled={!search.trim()} loading={loading} onPress={() => void searchRegistry()} />
          </View>
          {featuredGroups.map(([category, entries]) => (
            <View key={category} style={styles.group}>
              <Text style={styles.groupTitle}>{category}</Text>
              <View style={styles.listCard}>
                {entries.map((entry) => (
                  <RegistryCard key={entry.id} entry={entry} onSelect={startRegistry} />
                ))}
              </View>
            </View>
          ))}
          {search.trim() && !searchResults.length && !loading ? (
            <Text style={styles.empty}>No registry results.</Text>
          ) : null}
          {nextCursor ? (
            <ActionButton label="Load more" loading={loading} onPress={() => void searchRegistry(nextCursor)} />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function KeyValueEditor({
  title,
  rows,
  onRowsChange,
  onChange,
}: {
  title: string;
  rows: KeyValueRow[];
  onRowsChange: (rows: KeyValueRow[]) => void;
  onChange: (index: number, field: 'key' | 'value', value: string) => void;
}) {
  return (
    <View style={styles.keyValueBlock}>
      <View style={styles.titleRow}>
        <Text style={styles.fieldLabel}>{title}</Text>
        <Pressable
          accessibilityLabel={`Add ${title.toLowerCase()} value`}
          onPress={() => onRowsChange([...rows, { key: '', value: '' }])}
          style={({ pressed }) => [styles.smallRoundButton, pressed && styles.pressed]}
        >
          <Plus size={14} color={colors.accent} />
        </Pressable>
      </View>
      {rows.map((row, index) => (
        <View key={`${index}:${row.key}`} style={styles.keyValueRow}>
          <TextInput
            value={row.key}
            onChangeText={(value) => onChange(index, 'key', value)}
            editable={!row.secret || !row.key}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="KEY"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.keyInput]}
          />
          <TextInput
            value={row.value}
            onChangeText={(value) => onChange(index, 'value', value)}
            secureTextEntry={row.secret === true}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={row.secret ? 'Secret' : 'Value'}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.valueInput]}
          />
          <Pressable
            accessibilityLabel="Remove field"
            onPress={() => onRowsChange(rows.filter((_, rowIndex) => rowIndex !== index))}
            style={({ pressed }) => [styles.smallRoundButton, pressed && styles.pressed]}
          >
            <X size={13} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  toolbar: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  formHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '800',
  },
  segmentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segment: {
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.accentSoft,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.accent,
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  smallRoundButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  addText: {
    color: colors.accent,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  listCard: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  serverRow: {
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  registryCard: {
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusWrap: {
    width: 20,
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
  },
  statusDotReady: {
    backgroundColor: colors.success,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  rowMeta: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.xs,
    lineHeight: 16,
  },
  badge: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  serverDetails: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  actionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  authBlock: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  authTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  authTitle: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  input: {
    minHeight: 44,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    fontSize: typography.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  searchRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: typography.sm,
  },
  group: {
    gap: spacing.xs,
  },
  groupTitle: {
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
    paddingHorizontal: spacing.xs,
  },
  keyValueBlock: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  fieldLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: typography.xs,
    fontWeight: '700',
  },
  keyValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  keyInput: {
    flex: 0.42,
  },
  valueInput: {
    flex: 0.58,
  },
  empty: {
    padding: spacing.xl,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: typography.sm,
  },
  error: {
    color: colors.error,
    fontSize: typography.xs,
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.66,
  },
});
