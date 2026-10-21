import type {
  ActivityItem,
  Agent,
  AgentMessage,
  AgentPreferencesInspection,
  AgentStatus,
  AgentThreadEntry,
  BundledSkillComparison,
  ChatGitDetails,
  ChatGitState,
  ChatGitTarget,
  ChatPullRequest,
  CollaborationHost,
  CollaborationInspection,
  CommandResult,
  ComputerUseInspection,
  ComputerUseSettings,
  ContextArchiveEntry,
  ContextBreakdown,
  ControlSnapshot,
  DeviceInvitation,
  DeviceNetworkInspection,
  DevicePairResult,
  FeedEntry,
  GitInspection,
  GitState,
  HostDirectoryCreated,
  HostDirectoryInspection,
  HarnessQualificationRecord,
  MobileCommand,
  MediaInspection,
  MediaProvider,
  MediaHistoryItem,
  MessageAttachment,
  BillingInspection,
  BillingSessionCostSummary,
  McpInspection,
  McpRegistryEntry,
  McpServerStatus,
  MemoryDocument,
  MemoryInspection,
  ModelSharingInspection,
  ModelCatalogEntry,
  NativeCommandInspection,
  NoteAppearances,
  NoteBase,
  NoteBaseQueryResult,
  NoteDraft,
  NoteDraftSummary,
  NoteFolderNode,
  NoteGraphData,
  NoteContextActivation,
  NotePropertiesSnapshot,
  NotePropertySchema,
  NoteRelationship,
  NoteRevisionSummary,
  NoteSemanticIndexRebuildResult,
  NoteSemanticIndexStatus,
  NotesSettings,
  PairingTarget,
  ProcessInspection,
  ProviderAccount,
  ProviderAuthData,
  ProviderRemoteStatus,
  ProvidersInspection,
  Project,
  RemoteNote,
  RemoteBinaryFile,
  NotesInspection,
  VaultRestorePreview,
  VaultRestoreResult,
  RemoteChecklist,
  RemoteGoal,
  RewindPreview,
  RemoteSandboxPolicy,
  ResponseStyleInspection,
  Session,
  SettingField,
  SettingSection,
  SkillConversionPreview,
  SkillEvaluationCard,
  SkillResolutionPreview,
  SkillRevision,
  SkillRevisionComparison,
  SkillWorkspaceInspection,
  TimeTravelState,
  WorkspaceFilesInspection,
  WorkspaceNavigationState,
  WorkflowsInspection,
} from '../types/control';
import { applyAppearanceSettings } from '../theme/tokens';

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  message?: string;
};

type HealthData = {
  id?: string;
  version?: string;
  pid?: number;
};

type RemoteSession = {
  id: string;
  title?: string;
  workingDirectory?: string;
  gitWorkspace?: Session['gitWorkspace'];
  totalTokensIn?: number;
  totalTokensOut?: number;
  createdAt?: number;
  updatedAt?: number;
  archivedAt?: number;
  interactionMode?: 'act' | 'plan';
  agentOverrides?: Session['agentOverrides'];
};

type RemoteMessage = {
  id: string;
  role?: string;
  content?: string;
  model?: string;
  provider?: string;
  variantGroupId?: string;
  variantIndex?: number;
  isActive?: boolean;
  createdAt?: number;
  attachments?: MessageAttachment[];
};

type RemoteMessageProjection = {
  messages?: RemoteMessage[];
  activeMessageId?: string | null;
  activeMessageIds?: string[];
  conversationRevision?: number;
  providerConversationRevision?: number;
};

type RemoteContextSnapshot = {
  ok?: boolean;
  lastUsage?: {
    used: number;
    max: number;
    contextKnown: boolean;
    provider?: string;
    model?: string;
    cachedInputTokens?: number;
    estimated?: boolean;
    breakdown?: ContextBreakdown;
  } | null;
  data?: ContextArchiveEntry[];
};

type RemoteFeedPersistence = {
  tombstones?: {
    targetKey: string;
    visibility: 'hidden' | 'deleted';
  }[];
};

type RemoteAgentThread = {
  agent: {
    id: string;
    name?: string;
    role?: string;
    model?: string;
    provider?: string;
  };
  status?: string;
  kind?: 'worker' | 'critic';
  updatedAt?: number;
  lastMessage?: string;
};

type WorkspaceState = {
  workspaceRoot?: string | null;
  selectedProject?: string | null;
  projects?: { path: string; name?: string }[];
};

type RemoteProcess = {
  id?: string;
  name?: string;
  command?: string;
  commandReplayable?: boolean;
  pid?: number;
  status?: string;
  sessionId?: string;
  restartCount?: number;
  createdAt?: number;
  updatedAt?: number;
};

type RemoteProviderModel = {
  id?: string;
  name?: string;
  provider?: string;
  apiModelId?: string;
  realModelId?: string;
  aliases?: string[];
  contextWindow?: number;
  contextVerified?: boolean;
  reasoningLevels?: string[];
  supportsFastMode?: boolean;
  supportsAttachments?: boolean;
  vision?: boolean;
};

type RemoteProviderStatus = {
  name?: string;
  label?: string;
  enabled?: boolean;
  authenticated?: boolean;
  adapterAvailable?: boolean;
  credentialDetected?: boolean;
  connectionState?: string;
  verificationError?: string;
  authSource?: string;
  authMode?: string | { id?: string };
  supportsApiKey?: boolean;
  supportsAuthToken?: boolean;
  requiresBaseUrl?: boolean;
  requiresDeployment?: boolean;
  baseUrlPlaceholder?: string;
  models?: string[];
  selectedModels?: string[];
  allAvailableModels?: RemoteProviderModel[];
  hideModelSelector?: boolean;
  description?: string;
  deployment?: string;
  custom?: boolean;
  remoteAgentic?: boolean;
  remoteHostName?: string;
};

type AppearanceSettings = {
  preset: string;
  accent: string;
  secondaryAccent: string;
  font: string;
  customAccent?: { main: string; hover: string };
  customSecondaryAccent?: { main: string; hover: string };
};

type VoiceSettings = {
  input?: { provider?: string; modelId?: string; language?: string };
  output?: { provider?: string; modelId?: string; voiceId?: string; speed?: number };
  autoReadFinalReplies?: boolean;
  voiceModeEnabled?: boolean;
};

type VoiceProvider = {
  id?: string;
  name?: string;
  configured?: boolean;
  capabilities?: string[];
  models?: { id?: string; name?: string; capability?: string }[];
  voices?: { id?: string; name?: string }[];
};

type McpServer = {
  name?: string;
  transport?: string;
  connected?: boolean;
  toolCount?: number;
  protocolVersion?: string;
  lastError?: string;
  configured?: boolean;
  oauth?: { authorized?: boolean; needsAuthorization?: boolean };
};

type SpendCapConfig = {
  enabled?: boolean;
  sessionHourlyCents?: number;
  sessionDailyCents?: number;
  globalHourlyCents?: number;
  globalDailyCents?: number;
  perRequestCents?: number;
  action?: string;
  notifyAtPercent?: number[];
};

type ProviderCapability = {
  id?: string;
  label?: string;
  provider?: string;
  configured?: boolean;
  models?: unknown[];
};

type DesktopShortcut = {
  id: string;
  keys: string[];
  action: string;
  description?: string;
};

type DesktopUiSettings = {
  welcome: {
    enabled: { suggestions: boolean };
    suggestionPrompts: Record<string, string>;
  };
  shortcuts: DesktopShortcut[];
  onboardingReplayRevision: number;
  updatedAt?: number;
};

const SETTINGS_SECTIONS: SettingSection[] = [
  { id: 'providers', label: 'Providers & models', description: 'Accounts, models and routing' },
  { id: 'agent', label: 'Agent behavior', description: 'Permissions, skills, execution and context' },
  { id: 'devices', label: 'Link device', description: 'Pair and manage remote machines' },
  { id: 'archived', label: 'Archived chats', description: 'Restore, rename or delete chats' },
  { id: 'mcp', label: 'MCP servers', description: 'Tool servers' },
  { id: 'teams', label: 'Team access', description: 'Hosting and access' },
  { id: 'notes', label: 'Notes', description: 'Notes and agent access' },
  { id: 'memory', label: 'Memory', description: 'Memory and retrieval' },
  { id: 'skills', label: 'Skills', description: 'Write, test and activate reusable agent instructions' },
  { id: 'appearance', label: 'Appearance', description: 'Theme and type' },
  { id: 'welcome', label: 'Home screen', description: 'Home preferences' },
  { id: 'shortcuts', label: 'Keyboard shortcuts', description: 'Keyboard bindings' },
  { id: 'voice', label: 'Voice', description: 'Input and output' },
  { id: 'billing', label: 'Usage & billing', description: 'Usage and balances' },
  { id: 'experimental', label: 'Safety limits', description: 'Spend limits and paused chats' },
  { id: 'images', label: 'Images', description: 'Image providers' },
  { id: 'video', label: 'Video', description: 'Video providers' },
];

const extendedSettingsCache = new Map<
  string,
  { expiresAt: number; fields: SettingField[] }
>();
const gitPollingEligibility = new Map<string, boolean>();

function gitScopeKey(baseUrl: string, sessionId: string, projectId: string): string {
  return `${baseUrl}:${sessionId || 'none'}:${projectId || 'none'}`;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

export type RemoteTransportResponse = { status: number; contentType?: string; contentDisposition?: string; body?: string; bodyEncoding?: 'base64' };
export type RemoteTransportFormPart =
  | { name: string; value: string }
  | { name: string; filename: string; mimeType: string; base64: string };
export type RemoteTransport = {
  key: string;
  request: (endpoint: string, init: RequestInit, timeoutMs: number) => Promise<RemoteTransportResponse>;
  requestForm?: (
    endpoint: string,
    parts: RemoteTransportFormPart[],
    headers: Record<string, string>,
    timeoutMs: number,
  ) => Promise<RemoteTransportResponse>;
};

class RemoteRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = '',
  ) {
    super(message);
    this.name = 'RemoteRequestError';
  }
}

export function isRemoteAuthError(error: unknown): boolean {
  return (
    error instanceof RemoteRequestError &&
    (error.status === 401 || error.code === 'AUTH_REQUIRED')
  );
}

function responseErrorMessage(value: unknown, fallback: string): string {
  // Proxy pages and arbitrary payloads must not become user-facing errors.
  if (typeof value !== 'string') return fallback;
  const message = value.trim();
  if (!message || message.length > 300 || /<[^>]*>|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message)) return fallback;
  return message.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
}

function requiresAcknowledgement(method = 'GET'): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function decodeTransportJson<T>(response: RemoteTransportResponse, requireAcknowledgement = false): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body ?? '');
  } catch {
    // Preserve HTTP status even when an authentication proxy returns non-JSON.
  }
  const record = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : undefined;
  const code = typeof record?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(record.code)
    ? record.code
    : '';
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    throw new RemoteRequestError(
      responseErrorMessage(record?.error ?? record?.message, `Remote Koryphaios returned ${response.status}`),
      response.status,
      code,
    );
  }
  if (record?.ok === false || record?.success === false) {
    throw new RemoteRequestError(
      responseErrorMessage(record.error ?? record.message, 'Remote request failed'),
      response.status,
      code,
    );
  }
  if (
    !record ||
    ('ok' in record && typeof record.ok !== 'boolean') ||
    ('success' in record && typeof record.success !== 'boolean') ||
    (requireAcknowledgement && record.ok !== true && record.success !== true)
  ) {
    throw new RemoteRequestError(
      requireAcknowledgement
        ? 'The host returned an invalid acknowledgement. Check the host state before repeating the action.'
        : 'The host returned an invalid JSON response.',
      response.status,
      'INVALID_REMOTE_RESPONSE',
    );
  }
  return record as T;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return decodeTransportJson<T>(
      { status: response.status, body: await response.text() },
      requiresAcknowledgement(init.method),
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The host response timed out. Check the host state before repeating the action.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function blobFromBase64(data: string, mimeType = 'application/octet-stream'): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes.buffer], { type: mimeType });
}

function unwrap<T>(value: ApiEnvelope<T>, label: string): T {
  if (value.ok === false) throw new Error(value.error || `${label} failed`);
  if (value.data === undefined) throw new Error(`${label} returned no data`);
  return value.data;
}

function stripBearer(value: string): string {
  return value.replace(/^Bearer\s+/i, '').trim();
}

function basename(value: string): string {
  const clean = value.replace(/\/+$/, '');
  return clean.split('/').pop() || clean;
}

function ageLabel(timestamp?: number): string {
  if (!timestamp) return '';
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return 'now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return `${Math.floor(elapsed / 86_400_000)}d`;
}

function timeLabel(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function mapAgentStatus(status?: string): AgentStatus {
  switch (status) {
    case 'done':
      return 'completed';
    case 'error':
      return 'error';
    case 'waiting_user':
      return 'blocked';
    case 'waiting':
    case 'idle':
      return 'idle';
    default:
      return status ? 'running' : 'idle';
  }
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

const sensitiveSetting = /(api.?key|token|secret|password|credential|signature|private.?key)/i;

const agentSelectOptions: Record<string, string[]> = {
  ruleEnforcementLevel: ['strict', 'moderate', 'lenient'],
  agentExecutionMode: ['auto', 'single', 'multi'],
  gateStrictness: ['strict', 'advisory', 'off'],
  intentInterview: ['off', 'adaptive', 'deep'],
  goalPlanningDepth: ['minimal', 'adaptive', 'structured'],
  planApproval: ['always', 'material', 'never'],
  modelQualification: ['enforce', 'warn', 'off'],
  skillLearningMode: ['human-only', 'propose-then-verify', 'automatic'],
  agentMessaging: ['open', 'approval-cross-project', 'off'],
  localWebSearch: ['off', 'on', 'fallback'],
  promptCacheKeepaliveMode: ['economic', 'always', 'off'],
  permissionMode: ['guarded', 'ask', 'edits', 'yolo', 'plan', 'custom'],
  subAgentApproval: ['manager', 'user', 'auto'],
  'sandbox.mode': ['auto', 'always', 'off'],
};

const structuredAgentSettings = new Set([
  'managerModelAccess',
  'managerNotes',
  'skillCollisionChoices',
  'toolPermissionsByTier',
]);

const listAgentSettings = new Set([
  'toolAllowlist',
  'toolBlocklist',
  'bashCommandAllowlist',
  'bashCommandBlocklist',
]);

function flattenSettings(
  value: unknown,
  prefix: string[] = [],
  fields: SettingField[] = [],
  depth = 0,
): SettingField[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return fields;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveSetting.test(key)) continue;
    const pathParts = [...prefix, key];
    const path = pathParts.join('.');
    if (path === 'computerUse') continue;
    if (listAgentSettings.has(path) && Array.isArray(child)) {
      fields.push({
        id: `agent.${path}`,
        sectionId: 'agent',
        label: humanize(key),
        description: pathParts.length > 1
          ? pathParts.slice(0, -1).map((part) => humanize(part)).join(' / ')
          : undefined,
        kind: 'list',
        value: child.filter((item): item is string => typeof item === 'string').join('\n'),
      });
      continue;
    }
    if (structuredAgentSettings.has(path) && child && typeof child === 'object') {
      fields.push({
        id: `agent.${path}`,
        sectionId: 'agent',
        label: humanize(key),
        description: pathParts.length > 1
          ? pathParts.slice(0, -1).map((part) => humanize(part)).join(' / ')
          : undefined,
        kind: 'json',
        value: JSON.stringify(child, null, 2),
      });
      continue;
    }
    if (path === 'skillContextBudget' && child === null) {
      fields.push({
        id: 'agent.skillContextBudget',
        sectionId: 'agent',
        label: humanize(key),
        description: 'Leave blank to use the model context window automatically',
        kind: 'number-auto',
        value: null,
      });
      continue;
    }
    if (typeof child === 'boolean') {
      fields.push({
        id: `agent.${path}`,
        sectionId: 'agent',
        label: humanize(key),
        description: pathParts.length > 1
          ? pathParts.slice(0, -1).map((part) => humanize(part)).join(' / ')
          : undefined,
        kind: 'toggle',
        value: child,
      });
    } else if (typeof child === 'string' || typeof child === 'number') {
      const selectOptions = agentSelectOptions[path] ?? agentSelectOptions[key];
      const numberAuto = path === 'skillContextBudget';
      fields.push({
        id: `agent.${path}`,
        sectionId: 'agent',
        label: humanize(key),
        description: pathParts.length > 1
          ? pathParts.slice(0, -1).map((part) => humanize(part)).join(' / ')
          : undefined,
        kind: selectOptions
          ? 'select'
          : numberAuto
            ? 'number-auto'
            : typeof child === 'number'
              ? 'number'
              : 'text',
        value: child,
        options: selectOptions,
      });
    } else if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenSettings(child, pathParts, fields, depth + 1);
    }
  }
  return fields;
}

function flattenSectionSettings(
  value: unknown,
  config: {
    idPrefix: string;
    sectionId: string;
    description: string;
    selectOptions?: Record<string, string[]>;
    exclude?: RegExp;
  },
  prefix: string[] = [],
  fields: SettingField[] = [],
  depth = 0,
): SettingField[] {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 4) return fields;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveSetting.test(key) || config.exclude?.test(key)) continue;
    const pathParts = [...prefix, key];
    const path = pathParts.join('.');
    if (typeof child === 'boolean') {
      fields.push({
        id: `${config.idPrefix}.${path}`,
        sectionId: config.sectionId,
        label: humanize(key),
        description: pathParts.length > 1
          ? pathParts.slice(0, -1).map((part) => humanize(part)).join(' / ')
          : undefined,
        kind: 'toggle',
        value: child,
      });
      continue;
    }
    if (typeof child === 'string' || typeof child === 'number') {
      const options = config.selectOptions?.[path] ?? config.selectOptions?.[key];
      fields.push({
        id: `${config.idPrefix}.${path}`,
        sectionId: config.sectionId,
        label: humanize(key),
        description: pathParts.length > 1
          ? pathParts.slice(0, -1).map((part) => humanize(part)).join(' / ')
          : undefined,
        kind: options ? 'select' : typeof child === 'number' ? 'number' : 'text',
        value: child,
        options,
      });
      continue;
    }
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenSectionSettings(child, config, pathParts, fields, depth + 1);
    }
  }
  return fields;
}

function configuredCapabilityCount(items: ProviderCapability[] | undefined): string {
  if (!items?.length) return 'No providers reported';
  const configured = items.filter((item) => item.configured).length;
  return `${configured} of ${items.length} configured`;
}

function nestedPatch(pathParts: string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = pathParts;
  if (!head) return {};
  return { [head]: rest.length ? nestedPatch(rest, value) : value };
}

function mergeNestedValue(
  base: Record<string, unknown>,
  pathParts: string[],
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = pathParts;
  if (!head) return base;
  if (!rest.length) return { ...base, [head]: value };
  const current = base[head];
  const child = current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : {};
  return { ...base, [head]: mergeNestedValue(child, rest, value) };
}

function invalidateExtendedSettings(baseUrl: string): void {
  for (const key of extendedSettingsCache.keys()) {
    if (key.startsWith(`${baseUrl}:`)) extendedSettingsCache.delete(key);
  }
}

function buildProjects(workspace: WorkspaceState, sessions: RemoteSession[]): Project[] {
  const byPath = new Map<string, Project>();
  for (const item of workspace.projects ?? []) {
    if (!item.path) continue;
    byPath.set(item.path, {
      id: item.path,
      name: item.name || basename(item.path),
      path: item.path,
    });
  }
  if (workspace.selectedProject && !byPath.has(workspace.selectedProject)) {
    byPath.set(workspace.selectedProject, {
      id: workspace.selectedProject,
      name: basename(workspace.selectedProject),
      path: workspace.selectedProject,
    });
  }
  for (const session of sessions) {
    if (!session.workingDirectory || byPath.has(session.workingDirectory)) continue;
    byPath.set(session.workingDirectory, {
      id: session.workingDirectory,
      name: basename(session.workingDirectory),
      path: session.workingDirectory,
    });
  }
  return [...byPath.values()];
}

function buildModelCatalog(statuses: RemoteProviderStatus[]): ModelCatalogEntry[] {
  return statuses.flatMap((status) => {
    const provider = status.name?.trim();
    if (
      !provider ||
      status.enabled === false ||
      status.hideModelSelector ||
      status.connectionState === 'unavailable'
    ) {
      return [];
    }
    const enabledIds = new Set(status.models ?? []);
    const discovered = status.allAvailableModels ?? [];
    const models: RemoteProviderModel[] = discovered.length
      ? discovered.filter((model) => {
          const id = model.id?.trim();
          return !!id && (!enabledIds.size || enabledIds.has(id));
        })
      : [...enabledIds].map((id): RemoteProviderModel => ({ id, name: id }));

    return models.flatMap((model): ModelCatalogEntry[] => {
      const id = model.id?.trim();
      if (!id) return [];
      return [{
        id,
        name: model.name?.trim() || id,
        provider,
        providerLabel: status.label?.trim() || humanize(provider),
        selection: `${provider}:${id}`,
        reasoningLevels:
          model.reasoningLevels?.filter((level): level is string => typeof level === 'string') ?? [],
        ...(typeof model.supportsFastMode === 'boolean'
          ? { supportsFastMode: model.supportsFastMode }
          : {}),
        ...(typeof model.supportsAttachments === 'boolean'
          ? { supportsAttachments: model.supportsAttachments }
          : {}),
        ...(typeof model.vision === 'boolean' ? { vision: model.vision } : {}),
        ...(status.remoteAgentic === true ? { remoteAgentic: true } : {}),
        ...(status.remoteHostName?.trim()
          ? { remoteHostName: status.remoteHostName.trim() }
          : status.remoteAgentic === true
            ? { remoteHostName: status.label?.trim() || humanize(provider) }
            : {}),
        ...(typeof model.contextWindow === 'number' && model.contextWindow > 0
          ? { contextWindow: model.contextWindow }
          : {}),
        ...(typeof model.contextVerified === 'boolean'
          ? { contextVerified: model.contextVerified }
          : {}),
      }];
    });
  });
}

function mapFeed(
  messages: RemoteMessage[],
  projection: RemoteMessageProjection = {},
  persistence: RemoteFeedPersistence = {},
): FeedEntry[] {
  const tombstones = new Map(
    (persistence.tombstones ?? []).map((record) => [record.targetKey, record.visibility] as const),
  );
  const activeMessageIds = new Set(
    (projection.activeMessageIds ?? []).filter((id): id is string => typeof id === 'string'),
  );
  if (projection.activeMessageId) activeMessageIds.add(projection.activeMessageId);
  const variantsByGroup = new Map<string, RemoteMessage[]>();
  for (const message of messages) {
    if (!message.variantGroupId) continue;
    const current = variantsByGroup.get(message.variantGroupId) ?? [];
    current.push(message);
    variantsByGroup.set(message.variantGroupId, current);
  }
  for (const variants of variantsByGroup.values()) {
    variants.sort(
      (left, right) =>
        (left.variantIndex ?? 0) - (right.variantIndex ?? 0) ||
        (left.createdAt ?? 0) - (right.createdAt ?? 0) ||
        left.id.localeCompare(right.id),
    );
  }

  return messages.flatMap((message) => {
    const visibility = tombstones.get(`message:${message.id}`);
    if (visibility === 'deleted') return [];
    const group = message.variantGroupId ? variantsByGroup.get(message.variantGroupId) ?? [] : [];
    const activeVariant = group.find(
      (variant) => variant.isActive === true || activeMessageIds.has(variant.id),
    );
    const representative = activeVariant ?? group[0];
    if (group.length && representative?.id !== message.id) return [];
    const role = message.role ?? 'assistant';
    const variants = group.length
      ? group.map((variant) => ({
          id: variant.id,
          body: displayMessageContent(variant.content),
          model: variant.model,
          provider: variant.provider,
          index: variant.variantIndex ?? 0,
          isActive: variant.id === activeVariant?.id,
        }))
      : undefined;
    const boundaryAuthoritative =
      typeof projection.conversationRevision === 'number' &&
      typeof projection.providerConversationRevision === 'number' &&
      typeof projection.activeMessageId === 'string';
    return [{
      id: message.id,
      kind: role === 'user' ? 'user' : role === 'assistant' ? 'assistant' : 'tool',
      author: role === 'user' ? 'You' : role === 'assistant' ? 'Kory' : humanize(role),
      body: displayMessageContent(message.content),
      createdAt: timeLabel(message.createdAt),
      ...(role === 'assistant' ? { agentId: 'kory-manager' } : {}),
      meta: message.model || message.provider,
      messageId: message.id,
      model: message.model,
      provider: message.provider,
      variantGroupId: message.variantGroupId,
      activeVariantId: activeVariant?.id ?? null,
      variantIdentityAuthoritative: boundaryAuthoritative && Boolean(activeVariant),
      activeMessageId: projection.activeMessageId ?? null,
      conversationRevision: projection.conversationRevision ?? null,
      providerConversationRevision: projection.providerConversationRevision ?? null,
      userHidden: visibility === 'hidden',
      responseVariants: variants,
      attachments: message.attachments,
    }];
  });
}

function displayMessageContent(content?: string): string {
  if (!content) return '';
  const trimmed = content.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return content;
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) return content;
    const text = parsed
      .map((block) => {
        if (!block || typeof block !== 'object') return '';
        const item = block as { type?: unknown; text?: unknown; thinking?: unknown; name?: unknown };
        if (item.type === 'text' && typeof item.text === 'string') return item.text;
        if (item.type === 'thinking' && typeof item.thinking === 'string') return item.thinking;
        if (item.type === 'image') return typeof item.name === 'string' ? `[Image: ${item.name}]` : '[Image]';
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
    return text || content;
  } catch {
    return content;
  }
}

function mapProcesses(processes: RemoteProcess[]): ActivityItem[] {
  return processes.slice(0, 40).map((process, index) => {
    const raw = process.status ?? 'info';
    const status: ActivityItem['status'] =
      raw === 'running' || raw === 'starting'
        ? 'running'
        : raw === 'failed' || raw === 'error'
          ? 'error'
          : raw === 'exited' || raw === 'completed'
            ? 'success'
            : 'info';
    return {
      id: process.id || `process-${index}`,
      title: process.name || 'Remote process',
      detail: process.command ? `${humanize(raw)} · ${process.command}` : humanize(raw),
      createdAt: ageLabel(process.updatedAt ?? process.createdAt),
      status,
      processId: process.id,
      processSessionId: process.sessionId,
      processStatus: raw,
      commandReplayable: process.commandReplayable,
    };
  });
}

export class RemoteClient {
  constructor(private readonly target: PairingTarget, private readonly transport?: RemoteTransport) {}

  static async pair(baseUrl: string, _deviceName: string): Promise<PairingTarget> {
    const normalized = normalizeBaseUrl(baseUrl);
    const session = await fetchJson<ApiEnvelope<{ bearerToken: string; sessionId: string }>>(
      `${normalized}/api/auth/session`,
      { method: 'POST', headers: { accept: 'application/json' } },
    );
    const data = unwrap(session, 'Pairing');
    const token = stripBearer(data.bearerToken);
    if (!token) throw new Error('Koryphaios did not return a usable session token');

    const [healthResult, projectResult] = await Promise.all([
      fetchJson<ApiEnvelope<HealthData>>(`${normalized}/api/health`),
      fetchJson<ApiEnvelope<{ projectName?: string }>>(`${normalized}/api/project`),
    ]);
    const health = unwrap(healthResult, 'Health check');
    const project = unwrap(projectResult, 'Project check');

    return {
      baseUrl: normalized,
      token,
      machineId: `${health.id || 'koryphaios'}-${health.pid || 'host'}`,
      machineName: project.projectName ? `Koryphaios · ${project.projectName}` : 'Koryphaios Desktop',
    };
  }

  async health(): Promise<{ ok: boolean; machineId: string }> {
    const response = await this.request<ApiEnvelope<HealthData>>('/api/health');
    const health = unwrap(response, 'Health check');
    return {
      ok: true,
      machineId: `${health.id || 'koryphaios'}-${health.pid || 'host'}`,
    };
  }

  async snapshot(preferredSessionId?: string): Promise<ControlSnapshot> {
    const startedAt = Date.now();
    const appearanceSync = this.request<ApiEnvelope<AppearanceSettings | null>>(
      '/api/appearance',
      {},
      2500,
    )
      .then((response) => {
        if (response.data) applyAppearanceSettings(response.data);
      })
      .catch(() => undefined);
    const [
      healthResponse,
      projectResponse,
      sessionsResponse,
      workspaceResponse,
      settingsResponse,
      providersResponse,
      processesResponse,
    ] = await Promise.all([
      this.request<ApiEnvelope<HealthData>>('/api/health'),
      this.request<ApiEnvelope<{ projectName?: string }>>('/api/project'),
      this.request<ApiEnvelope<RemoteSession[]>>('/api/sessions/'),
      this.request<ApiEnvelope<WorkspaceState>>('/api/workspace/state'),
      this.request<ApiEnvelope<Record<string, unknown>>>('/api/agent/settings'),
      this.request<ApiEnvelope<RemoteProviderStatus[]>>('/api/providers/status', {}, 1500).catch(() => ({
        ok: true,
        data: [] as RemoteProviderStatus[],
      })),
      this.request<{ ok?: boolean; processes?: RemoteProcess[]; error?: string }>(
        '/api/processes?limit=40',
      ),
    ]);
    await appearanceSync;

    const health = unwrap(healthResponse, 'Health check');
    const projectInfo = unwrap(projectResponse, 'Project check');
    const remoteSessions = unwrap(sessionsResponse, 'Sessions')
      .slice()
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
    const workspace = workspaceResponse.data ?? {};
    const agentSettings = settingsResponse.data ?? {};
    const providerStatuses = providersResponse.data ?? [];
    const modelCatalog = buildModelCatalog(providerStatuses);
    const processes = processesResponse.processes ?? [];

    const hasPreferredSession = preferredSessionId !== undefined;
    const activeRemoteSession = hasPreferredSession
      ? remoteSessions.find((session) => session.id === preferredSessionId)
      : workspace.selectedProject
        ? remoteSessions.find((session) => session.workingDirectory === workspace.selectedProject)
        : workspace.workspaceRoot
          ? undefined
          : remoteSessions[0];
    const activeSessionId = activeRemoteSession?.id ?? '';

    const [messagesResponse, threadsResponse, contextResponse, feedPersistenceResponse] = activeSessionId
      ? await Promise.all([
          this.request<ApiEnvelope<RemoteMessageProjection>>(
            `/api/messages/${encodeURIComponent(activeSessionId)}`,
          ),
          this.request<ApiEnvelope<RemoteAgentThread[]>>(
            `/api/agent/threads/${encodeURIComponent(activeSessionId)}`,
          ),
          this.request<RemoteContextSnapshot>(
            `/api/sessions/${encodeURIComponent(activeSessionId)}/context`,
          ).catch((): RemoteContextSnapshot => ({ ok: false, lastUsage: null, data: [] })),
          this.request<ApiEnvelope<RemoteFeedPersistence>>(
            `/api/sessions/${encodeURIComponent(activeSessionId)}/feed`,
          ).catch(() => ({ ok: true, data: { tombstones: [] } })),
        ])
      : [
          { ok: true, data: { messages: [] as RemoteMessage[] } },
          { ok: true, data: [] as RemoteAgentThread[] },
          { ok: true, lastUsage: null, data: [] as ContextArchiveEntry[] },
          { ok: true, data: { tombstones: [] } as RemoteFeedPersistence },
        ];

    const messages = messagesResponse.data?.messages ?? [];
    const threads = threadsResponse.data ?? [];
    const projects = buildProjects(workspace, remoteSessions);
    const activeProjectId =
      activeRemoteSession?.workingDirectory ||
      workspace.selectedProject ||
      (workspace.workspaceRoot ? '' : projects[0]?.id || 'remote-project');

    const scopedHeaders: Record<string, string> = {};
    if (activeSessionId) scopedHeaders['x-koryphaios-session'] = activeSessionId;
    if (activeProjectId) scopedHeaders['x-koryphaios-project'] = activeProjectId;

    const [goalsResponse, checklistsResponse] = await Promise.all([
      this.request<ApiEnvelope<RemoteGoal[]>>('/api/goals').catch(() => ({
        ok: true,
        data: [] as RemoteGoal[],
      })),
      this.request<ApiEnvelope<RemoteChecklist[]>>('/api/checklists?includeArchived=true').catch(
        () => ({ ok: true, data: [] as RemoteChecklist[] }),
      ),
    ]);

    const emptyGitStatus: Pick<
      GitState,
      'isRepo' | 'status' | 'branch' | 'ahead' | 'behind' | 'remote' | 'conflicts'
    > = {
      isRepo: false,
      status: [],
      branch: '',
      ahead: 0,
      behind: 0,
      remote: null,
      conflicts: [],
    };
    const emptyWorktrees: GitState['worktrees'] = {
      active: [],
      availableSlots: 0,
      maxAllowed: 0,
      pendingResolutions: [],
    };
    let gitBase = emptyGitStatus;
    let branches: string[] = [];
    let worktrees = emptyWorktrees;
    const scopeKey = gitScopeKey(this.target.baseUrl, activeSessionId, activeProjectId);
    const shouldProbeGit =
      activeRemoteSession?.gitWorkspace !== undefined || gitPollingEligibility.get(scopeKey) !== false;

    if (shouldProbeGit) {
      try {
        const gitStatusResponse = await this.request<
          ApiEnvelope<
            Pick<GitState, 'isRepo' | 'status' | 'branch' | 'ahead' | 'behind' | 'remote' | 'conflicts'>
          >
        >('/api/git/status', { headers: scopedHeaders });
        gitBase = gitStatusResponse.data ?? emptyGitStatus;
        gitPollingEligibility.set(scopeKey, gitBase.isRepo);
        if (gitBase.isRepo) {
          const [branchesResponse, worktreesResponse] = await Promise.all([
            this.request<ApiEnvelope<{ branches: string[] }>>('/api/git/branches', {
              headers: scopedHeaders,
            }).catch(() => ({ ok: true, data: { branches: [] as string[] } })),
            this.request<ApiEnvelope<GitState['worktrees']>>('/api/git/worktrees', {
              headers: scopedHeaders,
            }).catch(() => ({ ok: true, data: emptyWorktrees })),
          ]);
          branches = branchesResponse.data?.branches ?? [];
          worktrees = worktreesResponse.data ?? emptyWorktrees;
        }
      } catch {
        gitPollingEligibility.set(scopeKey, false);
      }
    }

    const git: GitState = {
      ...gitBase,
      writeReady: Boolean(activeRemoteSession?.gitWorkspace && activeRemoteSession.archivedAt === undefined),
      branches,
      worktrees,
    };

    const sessions: Session[] = remoteSessions.map((session) => ({
      id: session.id,
      title: session.title || 'Untitled chat',
      projectId: session.workingDirectory || activeProjectId,
      updatedAt: ageLabel(session.updatedAt),
      gitWorkspace: session.gitWorkspace,
      interactionMode: session.interactionMode,
      agentOverrides: session.agentOverrides,
    }));

    const latestAssistant = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && (message.model || message.provider));
    const workers: Agent[] = threads.map((thread) => ({
      id: thread.agent.id,
      name: thread.agent.name || 'Agent',
      role: humanize(thread.agent.role || 'worker'),
      provider: thread.agent.provider || 'Koryphaios',
      model: thread.agent.model || 'Current model',
      status: mapAgentStatus(thread.status),
      parentId: 'kory-manager',
      currentTask: thread.lastMessage,
    }));
    const hasActiveWorker = workers.some((agent) => agent.status === 'running');
    const hasActiveProcess = processes.some(
      (process) =>
        process.sessionId === activeSessionId &&
        (process.status === 'running' || process.status === 'starting'),
    );
    const currentModel = latestAssistant
      ? modelCatalog.find(
          (model) =>
            model.provider === latestAssistant.provider &&
            (model.id === latestAssistant.model || model.selection === latestAssistant.model),
        ) ??
        modelCatalog.find(
          (model) => model.id === latestAssistant.model || model.selection === latestAssistant.model,
        )
      : undefined;
    const contextUsage = contextResponse.lastUsage ?? null;
    const contextUsed = Math.max(0, contextUsage?.used ?? 0);
    const contextLimit = contextUsage?.contextKnown
      ? Math.max(0, contextUsage.max)
      : currentModel?.contextVerified === true
        ? (currentModel.contextWindow ?? 0)
        : 0;
    const manager: Agent = {
      id: 'kory-manager',
      name: 'Kory',
      role: 'Manager',
      provider: latestAssistant?.provider || 'Koryphaios',
      model: latestAssistant?.model || 'Current model',
      status: hasActiveWorker || hasActiveProcess ? 'running' : 'idle',
      currentTask: activeRemoteSession?.title || 'Ready',
      contextUsed: contextUsed || undefined,
      contextLimit: contextLimit || undefined,
    };

    const settingsSections = SETTINGS_SECTIONS;
    const settings: SettingField[] = [
      ...flattenSettings(agentSettings),
      ...(await this.loadExtendedSettings(activeSessionId, activeProjectId, providerStatuses)),
    ];

    return {
      version: 1,
      machine: {
        id: this.target.machineId,
        name: this.target.machineName || projectInfo.projectName || 'Koryphaios Desktop',
        platform: 'Remote host',
        status: 'online',
        latencyMs: Date.now() - startedAt,
        lastSeen: 'now',
        executionLabel: `Koryphaios ${health.version || ''}`.trim(),
      },
      projects,
      activeProjectId,
      sessions,
      activeSessionId,
      agents: [manager, ...workers],
      feed: mapFeed(messages, messagesResponse.data ?? {}, feedPersistenceResponse.data ?? {}),
      activity: mapProcesses(processes),
      goals: goalsResponse.data ?? [],
      checklists: checklistsResponse.data ?? [],
      git,
      settingsSections,
      settings,
      modelCatalog,
      context: {
        used: contextUsed,
        limit: contextLimit,
        cached: Math.max(0, contextUsage?.cachedInputTokens ?? 0),
        contextKnown: contextUsage?.contextKnown ?? (contextLimit > 0),
        estimated: contextUsage?.estimated,
        provider: contextUsage?.provider,
        model: contextUsage?.model,
        breakdown: contextUsage?.breakdown,
        archive: contextResponse.data ?? [],
      },
      capabilities: [
        'sessions',
        'messages',
        'agents',
        'subagents',
        'agent-messaging',
        'settings',
        'providers',
        'skills',
        'processes',
        'process-input',
        'process-logs',
        'workspace',
        'goals',
        'checklists',
        'git',
        'worktrees',
        'memory',
        'notes',
        'archived',
        'mcp',
        'appearance',
        'voice',
        'billing',
        'spend-caps',
        'images',
        'video',
      ],
    };
  }

  private async loadExtendedSettings(
    activeSessionId: string,
    activeProjectId: string,
    providerStatuses: unknown[],
  ): Promise<SettingField[]> {
    const cacheKey = `${this.target.baseUrl}:${activeSessionId || 'none'}:${activeProjectId || 'none'}`;
    const cached = extendedSettingsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.fields;

    const scopedHeaders: Record<string, string> = {};
    if (activeSessionId) scopedHeaders['x-koryphaios-session'] = activeSessionId;
    if (activeProjectId) scopedHeaders['x-koryphaios-project'] = activeProjectId;

    const read = async <T>(endpoint: string, timeoutMs = 4000): Promise<T | undefined> => {
      try {
        const response = await this.request<ApiEnvelope<T>>(endpoint, { headers: scopedHeaders }, timeoutMs);
        return response.data;
      } catch {
        return undefined;
      }
    };

    const [
      appearance,
      memory,
      notes,
      notesPermissions,
      mode,
      voice,
      voiceProviders,
      spendResponse,
      spendStatus,
      archived,
      mcpServers,
      usage,
      imageProviders,
      videoProviders,
      desktopUi,
    ] = await Promise.all([
      read<AppearanceSettings | null>('/api/appearance'),
      read<Record<string, unknown>>('/api/memory/settings'),
      read<Record<string, unknown>>('/api/notes/settings'),
      read<Record<string, unknown>>('/api/notes/settings/agent-permissions'),
      read<{ mode?: string }>('/api/mode'),
      read<VoiceSettings>('/api/voice/settings'),
      read<VoiceProvider[]>('/api/voice/providers'),
      this.request<{ ok?: boolean; config?: SpendCapConfig }>('/api/spend-caps/config', {}, 4000).catch(
        (): { ok?: boolean; config?: SpendCapConfig } => ({ ok: false }),
      ),
      this.request<{
        ok?: boolean;
        pausedSessions?: { sessionId?: string; id?: string; reason?: string }[];
      }>('/api/spend-caps/status', {}, 4000).catch(
        (): {
          ok?: boolean;
          pausedSessions?: { sessionId?: string; id?: string; reason?: string }[];
        } => ({ ok: false }),
      ),
      read<RemoteSession[]>('/api/sessions/archived'),
      read<McpServer[]>('/api/v1/mcp-servers'),
      read<{ totals?: Record<string, unknown> }>('/api/usage?limit=1'),
      read<ProviderCapability[]>('/api/images/providers'),
      read<ProviderCapability[]>('/api/video/providers'),
      read<DesktopUiSettings>('/api/desktop-ui'),
    ]);

    const fields: SettingField[] = [];

    fields.push({
      id: 'providers.refresh',
      sectionId: 'providers',
      label: 'Refresh provider models',
      kind: 'action',
      value: 'Refresh',
    });
    for (const [index, raw] of providerStatuses.entries()) {
      if (!raw || typeof raw !== 'object') continue;
      const provider = raw as Record<string, unknown>;
      const id = String(provider.id ?? provider.name ?? `provider-${index}`);
      const label = String(provider.label ?? provider.name ?? id);
      const connected =
        provider.connected === true || provider.configured === true || provider.status === 'connected';
      fields.push({
        id: `providers.status.${id}`,
        sectionId: 'providers',
        label,
        kind: 'readonly',
        value: connected ? 'Ready' : humanize(String(provider.status ?? 'available')),
      });
    }

    fields.push({
      id: 'agent.reset',
      sectionId: 'agent',
      label: 'Reset agent behavior',
      description: 'Restore the desktop defaults for agent behavior and permissions.',
      kind: 'action',
      value: 'Reset',
    });

    if (mode?.mode) {
      fields.push({
        id: 'mode.mode',
        sectionId: 'agent',
        label: 'Interface mode',
        description: 'Desktop Koryphaios operating mode.',
        kind: 'select',
        value: mode.mode,
        options: ['beginner', 'advanced'],
      });
    }

    if (memory) {
      fields.push(
        ...flattenSectionSettings(memory, {
          idPrefix: 'memory',
          sectionId: 'memory',
          description: 'Project memory setting',
        }),
      );
      fields.push({
        id: 'memory.reset',
        sectionId: 'memory',
        label: 'Reset memory settings',
        description: 'Restore the desktop defaults for memory behavior.',
        kind: 'action',
        value: 'Reset',
      });
    }

    if (notes) {
      fields.push(
        ...flattenSectionSettings(notes, {
          idPrefix: 'notes',
          sectionId: 'notes',
          description: 'Project notes setting',
        }),
      );
    }
    if (notesPermissions) {
      fields.push(
        ...flattenSectionSettings(notesPermissions, {
          idPrefix: 'notesPermissions',
          sectionId: 'notes',
          description: 'Agent note permission',
          selectOptions: {
            preset: ['default', 'allow_all', 'ask_all', 'block_all', 'custom'],
            read_note: ['auto', 'ask', 'block'],
            search_notes: ['auto', 'ask', 'block'],
            list_notes: ['auto', 'ask', 'block'],
            recall_notes: ['auto', 'ask', 'block'],
            retrieve_note_context: ['auto', 'ask', 'block'],
            get_note_backlinks: ['auto', 'ask', 'block'],
            get_note_graph_summary: ['auto', 'ask', 'block'],
            get_note_properties: ['auto', 'ask', 'block'],
            query_note_base: ['auto', 'ask', 'block'],
            render_note: ['auto', 'ask', 'block'],
            record_work_note: ['auto', 'ask', 'block'],
            create_note: ['auto', 'ask', 'block'],
            set_note_property: ['auto', 'ask', 'block'],
            update_note: ['auto', 'ask', 'block'],
            delete_note: ['auto', 'ask', 'block'],
            link_notes: ['auto', 'ask', 'block'],
            unlink_notes: ['auto', 'ask', 'block'],
            propose_note_relationship: ['auto', 'ask', 'block'],
            review_note_relationship: ['auto', 'ask', 'block'],
          },
        }),
      );
      fields.push({
        id: 'notesPermissions.reset',
        sectionId: 'notes',
        label: 'Reset note permissions',
        description: 'Restore the default note-tool authority for agents.',
        kind: 'action',
        value: 'Reset',
      });
    }

    const archivedSessions = archived ?? [];
    if (!archivedSessions.length) {
      fields.push({
        id: 'archived.empty',
        sectionId: 'archived',
        label: 'Archived chats',
        kind: 'readonly',
        value: 'None',
      });
    } else {
      for (const session of archivedSessions) {
        fields.push({
          id: `archived.title.${session.id}`,
          sectionId: 'archived',
          label: session.title || 'Untitled chat',
          description: session.workingDirectory || 'Archived chat',
          kind: 'text',
          value: session.title || 'Untitled chat',
          actions: [
            { id: 'restore', label: 'Restore', tone: 'primary' },
            { id: 'delete', label: 'Delete', tone: 'danger' },
          ],
        });
      }
    }

    for (const server of mcpServers ?? []) {
      if (!server.name) continue;
      const status = server.connected
        ? `${server.toolCount ?? 0} tools`
        : server.lastError || 'Disconnected';
      const actions = [
        { id: 'test', label: 'Test' },
        { id: 'reload', label: 'Reload' },
        { id: 'remove', label: 'Remove', tone: 'danger' as const },
      ];
      fields.push({
        id: `mcp.server.${server.name}`,
        sectionId: 'mcp',
        label: server.name,
        description: server.oauth?.needsAuthorization
          ? `${humanize(server.transport || 'server')} ${status}. Authorization required on the host.`
          : `${humanize(server.transport || 'server')} ${status}`,
        kind: 'readonly',
        value: server.configured === false ? 'Runtime only' : 'Configured',
        actions,
      });
    }
    fields.push({
      id: 'mcp.add',
      sectionId: 'mcp',
      label: 'Add MCP server',
      description: 'Paste a JSON server definition using the same stdio/SSE schema as desktop Koryphaios, then Save.',
      kind: 'text',
      value: '',
    });

    fields.push({
      id: 'teams.host',
      sectionId: 'teams',
      label: 'Host this chat',
      description: activeSessionId
        ? 'Start a remotely managed collaboration session for the active chat.'
        : 'Select a chat before starting collaboration.',
      kind: 'action',
      value: 'Start hosting',
    });

    const appearanceValue: AppearanceSettings = appearance ?? {
      preset: 'kintsugi',
      accent: 'gold',
      secondaryAccent: 'gold',
      font: 'inter',
    };
    applyAppearanceSettings(appearanceValue);
    fields.push(
      ...flattenSectionSettings(appearanceValue, {
        idPrefix: 'appearance',
        sectionId: 'appearance',
        description: 'Desktop appearance setting',
        exclude: /^updatedAt$/,
        selectOptions: {
          preset: ['kintsugi', 'midnight', 'nord', 'dracula', 'catppuccin', 'gruvbox', 'tokyo', 'solarized', 'light', 'system'],
          accent: ['gold', 'indigo', 'cyan', 'emerald', 'amber', 'rose', 'violet', 'custom'],
          secondaryAccent: ['gold', 'indigo', 'cyan', 'emerald', 'amber', 'rose', 'violet', 'custom'],
          font: ['inter', 'geist', 'jetbrains', 'roboto', 'outfit', 'space-grotesk', 'dm-sans', 'plus-jakarta', 'source-code-pro', 'ibm-plex-mono', 'fira-code', 'berkeley-mono', 'source-serif', 'roboto-slab'],
        },
      }),
    );
    const primaryCustom = appearanceValue.customAccent ?? { main: '#D5B261', hover: '#F3DDB0' };
    const secondaryCustom = appearanceValue.customSecondaryAccent ?? { main: '#D5B261', hover: '#F3DDB0' };
    for (const [id, label, description, value] of [
      ['appearance.customAccent.main', 'Primary custom color', 'Main custom accent · #RRGGBB', primaryCustom.main],
      ['appearance.customAccent.hover', 'Primary custom hover', 'Hover custom accent · #RRGGBB', primaryCustom.hover],
      ['appearance.customSecondaryAccent.main', 'Secondary custom color', 'Main secondary accent · #RRGGBB', secondaryCustom.main],
      ['appearance.customSecondaryAccent.hover', 'Secondary custom hover', 'Hover secondary accent · #RRGGBB', secondaryCustom.hover],
    ] as const) {
      if (!fields.some((field) => field.id === id)) {
        fields.push({ id, sectionId: 'appearance', label, description, kind: 'text', value });
      }
    }
    fields.push({
      id: 'appearance.reset',
      sectionId: 'appearance',
      label: 'Restore defaults',
      description: 'Kintsugi, gold accents and Inter.',
      kind: 'action',
      value: 'Restore defaults',
    });

    if (desktopUi) {
      fields.push({
        id: 'welcome.suggestions.enabled',
        sectionId: 'welcome',
        label: 'Starting suggestions',
        description: 'Show starting-point cards in an empty desktop agent feed.',
        kind: 'toggle',
        value: desktopUi.welcome.enabled.suggestions,
      });
      for (const [id, prompt] of Object.entries(desktopUi.welcome.suggestionPrompts)) {
        fields.push({
          id: 'welcome.suggestion.' + id,
          sectionId: 'welcome',
          label: humanize(id),
          description: 'Starting suggestion prompt',
          kind: 'text',
          value: prompt,
        });
      }
      fields.push(
        {
          id: 'welcome.suggestions.reset',
          sectionId: 'welcome',
          label: 'Reset starting suggestions',
          kind: 'action',
          value: 'Reset content',
        },
        {
          id: 'welcome.walkthrough.replay',
          sectionId: 'welcome',
          label: 'Welcome walkthrough',
          description: 'Open the guided setup on the desktop host.',
          kind: 'action',
          value: 'Replay',
        },
      );

      for (const shortcut of desktopUi.shortcuts) {
        fields.push({
          id: 'shortcuts.binding.' + shortcut.id,
          sectionId: 'shortcuts',
          label: shortcut.action,
          description: shortcut.description,
          kind: 'text',
          value: shortcut.keys.join('+'),
        });
      }
      fields.push({
        id: 'shortcuts.reset',
        sectionId: 'shortcuts',
        label: 'Keyboard shortcuts',
        description: 'Restore the desktop key bindings.',
        kind: 'action',
        value: 'Reset to defaults',
      });
    }

    const voiceProviderList = voiceProviders ?? [];
    const inputProviders = voiceProviderList
      .filter((provider) => provider.capabilities?.includes('stt'))
      .map((provider) => provider.id)
      .filter((id): id is string => Boolean(id));
    const outputProviders = voiceProviderList
      .filter((provider) => provider.capabilities?.includes('tts'))
      .map((provider) => provider.id)
      .filter((id): id is string => Boolean(id));
    const sttModels = voiceProviderList
      .flatMap((provider) => provider.models ?? [])
      .filter((model) => !model.capability || model.capability === 'stt')
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id));
    const ttsModels = voiceProviderList
      .flatMap((provider) => provider.models ?? [])
      .filter((model) => !model.capability || model.capability === 'tts')
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id));
    const voices = voiceProviderList
      .flatMap((provider) => provider.voices ?? [])
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id));
    if (voice) {
      fields.push(
        ...flattenSectionSettings(voice, {
          idPrefix: 'voice',
          sectionId: 'voice',
          description: 'Desktop voice setting',
          exclude: /^localVoiceSetupVersion$/,
          selectOptions: {
            'input.provider': inputProviders,
            'input.modelId': sttModels,
            'output.provider': outputProviders,
            'output.modelId': ttsModels,
            'output.voiceId': voices,
          },
        }),
      );
    }

    const totals = usage?.totals;
    if (totals) {
      for (const [key, value] of Object.entries(totals)) {
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
        fields.push({
          id: `billing.total.${key}`,
          sectionId: 'billing',
          label: humanize(key),
          kind: 'readonly',
          value: String(value),
        });
      }
    }
    fields.push({
      id: 'billing.refresh',
      sectionId: 'billing',
      label: 'Refresh billing sources',
      description: 'Refresh provider balances and usage reconciliation on the desktop.',
      kind: 'action',
      value: 'Refresh',
    });

    if (spendResponse.config) {
      fields.push(
        ...flattenSectionSettings(spendResponse.config, {
          idPrefix: 'spend',
          sectionId: 'experimental',
          description: 'Runtime-enforced spend limit',
          selectOptions: { action: ['pause', 'warn', 'block', 'continue'] },
        }),
      );
    }
    for (const paused of spendStatus.pausedSessions ?? []) {
      const id = String(paused.sessionId ?? paused.id ?? '');
      if (!id) continue;
      fields.push({
        id: `spend.paused.${id}`,
        sectionId: 'experimental',
        label: `Paused chat ${id.slice(0, 8)}`,
        description: paused.reason || 'Paused by a spend limit.',
        kind: 'readonly',
        value: 'Paused',
        actions: [{ id: 'resume', label: 'Resume', tone: 'primary' }],
      });
    }

    fields.push({
      id: 'images.status',
      sectionId: 'images',
      label: 'Image providers',
      kind: 'readonly',
      value: configuredCapabilityCount(imageProviders),
    });
    for (const [index, provider] of (imageProviders ?? []).entries()) {
      fields.push({
        id: `images.provider.${provider.id ?? index}`,
        sectionId: 'images',
        label: provider.label || provider.id || `Provider ${index + 1}`,
        description: `${provider.models?.length ?? 0} model${provider.models?.length === 1 ? '' : 's'}`,
        kind: 'readonly',
        value: provider.configured ? 'Configured' : 'Not configured',
      });
    }

    fields.push({
      id: 'video.status',
      sectionId: 'video',
      label: 'Video providers',
      kind: 'readonly',
      value: configuredCapabilityCount(videoProviders),
    });
    for (const [index, provider] of (videoProviders ?? []).entries()) {
      fields.push({
        id: `video.provider.${provider.id ?? provider.provider ?? index}`,
        sectionId: 'video',
        label: provider.label || provider.id || provider.provider || `Provider ${index + 1}`,
        description: `${provider.models?.length ?? 0} model${provider.models?.length === 1 ? '' : 's'}`,
        kind: 'readonly',
        value: provider.configured ? 'Configured' : 'Available',
      });
    }

    extendedSettingsCache.set(cacheKey, { expiresAt: Date.now() + 15_000, fields });
    return fields;
  }

  async command(
    command: MobileCommand,
    activeSessionId?: string,
    activeProjectId?: string,
  ): Promise<CommandResult> {
    const payload = command.payload ?? {};
    const sessionId = String(payload.sessionId ?? activeSessionId ?? '');
    const projectId = String(payload.projectId ?? activeProjectId ?? '');
    const scopedHeaders: Record<string, string> = {};
    if (sessionId) scopedHeaders['x-koryphaios-session'] = sessionId;
    if (projectId) scopedHeaders['x-koryphaios-project'] = projectId;

    switch (command.name) {
      case 'session.select':
        return { accepted: true };

      case 'session.create': {
        const response = await this.request<ApiEnvelope<RemoteSession>>('/api/sessions/', {
          method: 'POST',
          body: JSON.stringify({
            title: String(payload.title ?? 'New chat'),
            workingDirectory: payload.projectId ? String(payload.projectId) : undefined,
          }),
        });
        const session = unwrap(response, 'Create chat');
        return { accepted: true, sessionId: session.id };
      }

      case 'project.select': {
        const projectPath = String(payload.projectId ?? '');
        if (!projectPath) throw new Error('Project path is required');
        await this.request('/api/workspace/select', {
          method: 'POST',
          body: JSON.stringify({ path: projectPath }),
        });
        const requestedSessionId = String(payload.sessionId ?? '');
        return { accepted: true, sessionId: requestedSessionId || undefined };
      }

      case 'workspace.open': {
        const root = String(payload.root ?? '').trim();
        if (!root) throw new Error('Workspace root is required');
        const response = await this.request<ApiEnvelope<WorkspaceNavigationState>>('/api/workspace/open', {
          method: 'POST',
          body: JSON.stringify({ root }),
        });
        return { accepted: true, sessionId: '', data: unwrap(response, 'Open workspace') };
      }

      case 'workspace.directory.create': {
        const parentPath = String(payload.parentPath ?? '').trim();
        const name = String(payload.name ?? '').trim();
        if (!parentPath || !name) throw new Error('Parent folder and name are required');
        const response = await this.request<ApiEnvelope<HostDirectoryCreated>>(
          '/api/workspace/directories',
          {
            method: 'POST',
            body: JSON.stringify({ parentPath, name }),
          },
        );
        return { accepted: true, data: unwrap(response, 'Create host folder') };
      }

      case 'workspace.deselect': {
        const response = await this.request<ApiEnvelope<WorkspaceNavigationState>>(
          '/api/workspace/deselect',
          { method: 'POST' },
        );
        return { accepted: true, sessionId: '', data: unwrap(response, 'Deselect project') };
      }

      case 'workspace.acknowledge_unavailable': {
        const response = await this.request<ApiEnvelope<WorkspaceNavigationState>>(
          '/api/workspace/acknowledge-unavailable',
          { method: 'POST' },
        );
        return { accepted: true, data: unwrap(response, 'Acknowledge unavailable workspace') };
      }

      case 'workspace.clear': {
        const response = await this.request<ApiEnvelope<WorkspaceNavigationState>>(
          '/api/workspace/state',
          { method: 'DELETE' },
        );
        return { accepted: true, sessionId: '', data: unwrap(response, 'Clear workspace') };
      }

      case 'device.rename': {
        const name = String(payload.name ?? '').trim();
        if (!name) throw new Error('Device name is required');
        const response = await this.request<ApiEnvelope<DeviceNetworkInspection>>('/api/devices/name', {
          method: 'PATCH',
          body: JSON.stringify({ name }),
        });
        return { accepted: true, data: response.data };
      }

      case 'device.invite': {
        const response = await this.request<ApiEnvelope<DeviceInvitation>>('/api/devices/pairing', {
          method: 'POST',
        });
        return { accepted: true, data: unwrap(response, 'Pairing code') };
      }

      case 'device.stop_invite': {
        await this.request('/api/devices/pairing', { method: 'DELETE' });
        return { accepted: true };
      }

      case 'device.pair': {
        const code = String(payload.code ?? '').trim();
        if (!code) throw new Error('Pairing code is required');
        const response = await this.request<ApiEnvelope<DevicePairResult>>('/api/devices/pair', {
          method: 'POST',
          body: JSON.stringify({ code }),
        }, 40_000);
        return { accepted: true, data: unwrap(response, 'Pair device') };
      }

      case 'device.decide': {
        const requestId = String(payload.requestId ?? '').trim();
        if (!requestId) throw new Error('Pairing request is required');
        const response = await this.request<ApiEnvelope<DeviceNetworkInspection>>('/api/devices/decision', {
          method: 'POST',
          body: JSON.stringify({ id: requestId, approved: payload.approved === true }),
        }, 40_000);
        return { accepted: true, data: response.data };
      }

      case 'device.unlink': {
        const deviceId = String(payload.deviceId ?? '').trim();
        if (!deviceId) throw new Error('Linked device is required');
        await this.request(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }, 40_000);
        return { accepted: true };
      }

      case 'device.grants': {
        const deviceId = String(payload.deviceId ?? '').trim();
        if (!deviceId) throw new Error('Linked device is required');
        const response = await this.request<ApiEnvelope<DeviceNetworkInspection>>(
          `/api/devices/${encodeURIComponent(deviceId)}/grants`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              allowAgents: payload.allowAgents === true,
              agentRouting: payload.agentRouting === true,
            }),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'session.send_message': {
        const content = String(payload.body ?? '').trim();
        const attachments = Array.isArray(payload.attachments)
          ? payload.attachments.flatMap((value): MessageAttachment[] => {
              if (!value || typeof value !== 'object') return [];
              const item = value as Partial<MessageAttachment>;
              const type = item.type === 'image' ? 'image' : item.type === 'file' ? 'file' : '';
              const data = typeof item.data === 'string' ? item.data : '';
              const name = typeof item.name === 'string' ? item.name.trim() : '';
              if (!type || !data || !name) return [];
              return [{
                type,
                data,
                name,
                ...(typeof item.mimeType === 'string' && item.mimeType ? { mimeType: item.mimeType } : {}),
              }];
            })
          : [];
        if (!sessionId || (!content && !attachments.length)) throw new Error('A chat and message are required');
        const model = String(payload.model ?? '').trim();
        const reasoningLevel = String(payload.reasoningLevel ?? '').trim();
        const fastMode = payload.fastMode === true;
        const imageInputMode =
          payload.imageInputMode === 'allow' ||
          payload.imageInputMode === 'omit' ||
          payload.imageInputMode === 'reject'
            ? payload.imageInputMode
            : 'reject';
        await this.request('/api/messages/', {
          method: 'POST',
          body: JSON.stringify({
            sessionId,
            content,
            ...(model ? { model } : {}),
            ...(reasoningLevel ? { reasoningLevel } : {}),
            ...(fastMode ? { fastMode: true } : {}),
            imageInputMode,
            ...(attachments.length ? { attachments } : {}),
          }),
        });
        return { accepted: true };
      }

      case 'voice.transcribe': {
        const audioBase64 = String(payload.audioBase64 ?? '').trim();
        if (!audioBase64) throw new Error('Recorded audio is required');
        const response = await this.request<ApiEnvelope<{
          text: string;
          language?: string;
          durationMs?: number;
          provider: string;
          modelId: string;
        }>>('/api/voice/transcribe', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            audioBase64,
            ...(typeof payload.mimeType === 'string' && payload.mimeType ? { mimeType: payload.mimeType } : {}),
            ...(typeof payload.language === 'string' && payload.language ? { language: payload.language } : {}),
          }),
        }, 130_000);
        return { accepted: true, data: unwrap(response, 'Transcription') };
      }

      case 'voice.synthesize': {
        const text = String(payload.text ?? '').trim();
        const provider = String(payload.provider ?? '').trim();
        const modelId = String(payload.modelId ?? '').trim();
        if (!text || !provider || !modelId) throw new Error('Speech text, provider, and model are required');
        const response = await this.request<ApiEnvelope<{
          audioBase64: string;
          mimeType: string;
          durationMs?: number;
          provider: string;
          modelId: string;
        }>>('/api/voice/synthesize', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            text,
            provider,
            modelId,
            ...(typeof payload.voiceId === 'string' && payload.voiceId ? { voiceId: payload.voiceId } : {}),
            ...(typeof payload.speed === 'number' && Number.isFinite(payload.speed) ? { speed: payload.speed } : {}),
          }),
        }, 130_000);
        return { accepted: true, data: unwrap(response, 'Speech synthesis') };
      }

      case 'session.rename': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const title = String(payload.title ?? '').trim();
        if (!targetSessionId || !title) throw new Error('A chat and name are required');
        await this.request(`/api/sessions/${encodeURIComponent(targetSessionId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ title }),
        });
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'session.archive': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        if (!targetSessionId) throw new Error('A chat is required');
        await this.request(`/api/sessions/${encodeURIComponent(targetSessionId)}/archive`, {
          method: 'POST',
        });
        return { accepted: true };
      }

      case 'session.delete': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        if (!targetSessionId) throw new Error('A chat is required');
        await this.request(`/api/sessions/${encodeURIComponent(targetSessionId)}`, {
          method: 'DELETE',
        });
        return { accepted: true };
      }

      case 'session.delete_all': {
        const response = await this.request<{ ok?: boolean; deleted?: number; operationId?: string }>(
          '/api/sessions',
          { method: 'DELETE' },
          60_000,
        );
        return { accepted: true, data: response };
      }

      case 'session.update_controls': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        if (!targetSessionId) throw new Error('A chat is required');
        const patch: Record<string, unknown> = {};
        if (payload.interactionMode === 'act' || payload.interactionMode === 'plan') {
          patch.interactionMode = payload.interactionMode;
        }
        if (payload.agentOverrides && typeof payload.agentOverrides === 'object') {
          patch.agentOverrides = payload.agentOverrides;
        }
        if (!Object.keys(patch).length) throw new Error('No chat controls were changed');
        await this.request(`/api/sessions/${encodeURIComponent(targetSessionId)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'session.compact': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const model = String(payload.model ?? '').trim();
        if (!targetSessionId || !model) throw new Error('A chat and model are required');
        const reasoningLevel = String(payload.reasoningLevel ?? '').trim();
        await this.request(`/api/sessions/${encodeURIComponent(targetSessionId)}/compact`, {
          method: 'POST',
          body: JSON.stringify({
            model,
            ...(reasoningLevel ? { reasoningLevel } : {}),
            automatic: false,
          }),
        }, 120_000);
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'context.visibility': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const archiveId = String(payload.archiveId ?? '').trim();
        if (!targetSessionId || !archiveId) throw new Error('A chat and context item are required');
        await this.request(
          `/api/sessions/${encodeURIComponent(targetSessionId)}/context/${encodeURIComponent(archiveId)}/visibility`,
          {
            method: 'POST',
            body: JSON.stringify({ hiddenFromAgent: payload.hiddenFromAgent === true }),
          },
        );
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'response_style.save': {
        const instructions = String(payload.instructions ?? '');
        const response = await this.request<ApiEnvelope<ResponseStyleInspection>>(
          '/api/agent/response-style',
          {
            method: 'PUT',
            headers: scopedHeaders,
            body: JSON.stringify({ instructions }),
          },
        );
        return { accepted: true, data: unwrap(response, 'Response style') };
      }

      case 'response_style.reset': {
        const response = await this.request<ApiEnvelope<ResponseStyleInspection>>(
          '/api/agent/response-style/reset',
          { method: 'POST', headers: scopedHeaders },
        );
        return { accepted: true, data: unwrap(response, 'Response style') };
      }

      case 'agent.settings.reset': {
        await this.request('/api/agent/settings/reset', { method: 'POST', headers: scopedHeaders });
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'agent.preferences.save': {
        const content = String(payload.content ?? '');
        const response = await this.request<ApiEnvelope<AgentPreferencesInspection>>(
          '/api/agent/preferences',
          {
            method: 'PUT',
            headers: scopedHeaders,
            body: JSON.stringify({ content }),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'agent.preferences.init': {
        const response = await this.request<ApiEnvelope<AgentPreferencesInspection>>(
          '/api/agent/preferences/init',
          { method: 'POST', headers: scopedHeaders },
        );
        return { accepted: true, data: response.data };
      }

      case 'skill.create': {
        const source = String(payload.source ?? 'personal');
        const name = String(payload.name ?? '').trim();
        const description = String(payload.description ?? '').trim();
        const instructions = String(payload.instructions ?? '').trim();
        if (!['personal', 'project'].includes(source) || !name || !description || !instructions) {
          throw new Error('Skill draft is incomplete');
        }
        const list = (key: string) =>
          Array.isArray(payload[key])
            ? (payload[key] as unknown[]).map(String).map((item) => item.trim()).filter(Boolean)
            : [];
        const response = await this.request<ApiEnvelope<SkillRevision>>('/api/agent/skills', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            source,
            name,
            description,
            instructions,
            domains: list('domains'),
            activation: list('activation'),
            shouldTrigger: list('shouldTrigger'),
            shouldNotTrigger: list('shouldNotTrigger'),
            evidence: list('evidence'),
            broader: list('broader'),
            facets: list('facets'),
            requires: list('requires'),
            conflicts: list('conflicts'),
            excludes: list('excludes'),
            targetMedia: list('targetMedia').length ? list('targetMedia') : ['any'],
            depth: Number.isFinite(Number(payload.depth)) ? Number(payload.depth) : 0,
            contextBudget: Number.isFinite(Number(payload.contextBudget))
              ? Number(payload.contextBudget)
              : 4000,
            actor: 'human',
          }),
        }, 30_000);
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: unwrap(response, 'Create skill') };
      }

      case 'skill.save_draft': {
        const name = String(payload.name ?? '').trim();
        const source = String(payload.source ?? '');
        const expectedHash = String(payload.expectedHash ?? '');
        const content = String(payload.content ?? '');
        if (!name || !['personal', 'project'].includes(source) || !expectedHash) {
          throw new Error('Skill draft identity is incomplete');
        }
        const document =
          payload.document && typeof payload.document === 'object' && !Array.isArray(payload.document)
            ? payload.document
            : undefined;
        const response = await this.request<ApiEnvelope<SkillRevision>>(
          `/api/agent/skills/${encodeURIComponent(name)}/draft`,
          {
            method: 'PUT',
            headers: scopedHeaders,
            body: JSON.stringify({
              source,
              expectedHash,
              actor: 'human',
              ...(document
                ? {
                    document,
                    sourceContent: content,
                    coreInstructions: String(payload.coreInstructions ?? ''),
                  }
                : { content }),
            }),
          },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: unwrap(response, 'Save skill draft') };
      }

      case 'skill.test': {
        const name = String(payload.name ?? '').trim();
        const source = String(payload.source ?? '');
        const state = String(payload.state ?? 'draft');
        const expectedHash = String(payload.expectedHash ?? '');
        if (!name || !['personal', 'project'].includes(source)) throw new Error('Skill is required');
        const response = await this.request<ApiEnvelope<Record<string, unknown>>>(
          `/api/agent/skills/${encodeURIComponent(name)}/test`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ source, state, ...(expectedHash ? { expectedHash } : {}) }),
          },
          30_000,
        );
        return { accepted: true, data: response.data };
      }

      case 'skill.activate': {
        const name = String(payload.name ?? '').trim();
        const source = String(payload.source ?? '');
        const expectedHash = String(payload.expectedHash ?? '');
        if (!name || !['personal', 'project'].includes(source)) throw new Error('Skill is required');
        const response = await this.request<ApiEnvelope<SkillRevision>>(
          `/api/agent/skills/${encodeURIComponent(name)}/activate`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({
              source,
              actor: 'human',
              ...(expectedHash ? { expectedHash } : {}),
            }),
          },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: unwrap(response, 'Activate skill') };
      }

      case 'skill.update_default': {
        const name = String(payload.name ?? '').trim();
        const choice = String(payload.choice ?? '');
        const expectedHash = String(payload.expectedHash ?? '');
        if (
          !name ||
          !['replace', 'merge', 'keep-local', 'merge-with-agent'].includes(choice) ||
          !expectedHash
        ) {
          throw new Error('Bundled skill update is incomplete');
        }
        const response = await this.request<ApiEnvelope<SkillRevision>>(
          `/api/agent/skills/${encodeURIComponent(name)}/update-default`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ choice, expectedHash }),
          },
          60_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: response.data };
      }

      case 'skill.convert': {
        const name = String(payload.name ?? '').trim();
        const source = String(payload.source ?? '');
        const state = String(payload.state ?? '');
        const expectedHash = String(payload.expectedHash ?? '');
        const document =
          payload.document && typeof payload.document === 'object' && !Array.isArray(payload.document)
            ? payload.document
            : null;
        if (
          !name ||
          !['personal', 'project'].includes(source) ||
          !['active', 'draft'].includes(state) ||
          !expectedHash ||
          !document
        ) {
          throw new Error('Skill conversion is incomplete');
        }
        const response = await this.request<ApiEnvelope<SkillConversionPreview>>(
          `/api/agent/skills/${encodeURIComponent(name)}/convert`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({
              source,
              state,
              expectedHash,
              document,
              dryRun: false,
            }),
          },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: unwrap(response, 'Convert skill') };
      }

      case 'message.delete': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const messageId = String(payload.messageId ?? '').trim();
        if (!targetSessionId || !messageId) throw new Error('A chat and message are required');
        await this.request(
          `/api/messages/${encodeURIComponent(targetSessionId)}/${encodeURIComponent(messageId)}`,
          { method: 'DELETE' },
        );
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'message.visibility': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const messageId = String(payload.messageId ?? '').trim();
        const visibility = payload.hidden === true ? 'hidden' : 'visible';
        if (!targetSessionId || !messageId) throw new Error('A chat and message are required');
        await this.request(
          `/api/sessions/${encodeURIComponent(targetSessionId)}/feed/visibility`,
          {
            method: 'PUT',
            body: JSON.stringify({
              targets: [`message:${messageId}`],
              visibility,
            }),
          },
        );
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'message.regenerate': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const messageId = String(payload.messageId ?? '').trim();
        const model = String(payload.model ?? '').trim();
        const reasoningLevel = String(payload.reasoningLevel ?? '').trim();
        if (!targetSessionId || !messageId) throw new Error('A chat and response are required');
        const response = await this.request<ApiEnvelope<Record<string, unknown>>>(
          '/api/messages/regenerate',
          {
            method: 'POST',
            body: JSON.stringify({
              sessionId: targetSessionId,
              messageId,
              ...(model ? { model } : {}),
              ...(reasoningLevel ? { reasoningLevel } : {}),
            }),
          },
          30_000,
        );
        return { accepted: true, sessionId: targetSessionId, data: response.data };
      }

      case 'message.select_variant': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const messageId = String(payload.messageId ?? '').trim();
        const expectedActiveMessageId = String(payload.expectedActiveMessageId ?? '').trim();
        const expectedProviderConversationRevision = Number(payload.expectedProviderConversationRevision);
        if (!targetSessionId || !messageId || !expectedActiveMessageId) {
          throw new Error('The response branch is missing its current conversation boundary');
        }
        if (!Number.isInteger(expectedProviderConversationRevision) || expectedProviderConversationRevision < 0) {
          throw new Error('The response branch is missing its provider revision');
        }
        await this.request('/api/messages/variant', {
          method: 'POST',
          body: JSON.stringify({
            sessionId: targetSessionId,
            messageId,
            expectedActiveMessageId,
            expectedProviderConversationRevision,
          }),
        });
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'native_command.run': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const nativeCommand = String(payload.command ?? '').trim();
        const model = String(payload.model ?? '').trim();
        if (!targetSessionId || !nativeCommand) throw new Error('A chat and command are required');
        await this.request('/api/native-commands/run', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            sessionId: targetSessionId,
            command: nativeCommand.startsWith('/') ? nativeCommand : `/${nativeCommand}`,
            ...(model ? { model } : {}),
          }),
        }, 30_000);
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'workflow.start': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const task = String(payload.task ?? '').trim();
        if (!targetSessionId || !task) throw new Error('A chat and workflow task are required');
        await this.request('/api/agent/workflows/start', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            sessionId: targetSessionId,
            task,
            ...(payload.workflowId ? { workflowId: String(payload.workflowId) } : {}),
            ...(payload.goalId ? { goalId: String(payload.goalId) } : {}),
          }),
        });
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'workflow.advance': {
        const runId = String(payload.runId ?? '');
        const evidence = String(payload.evidence ?? '').trim();
        if (!runId || !evidence) throw new Error('A workflow and evidence are required');
        await this.request(`/api/agent/workflows/${encodeURIComponent(runId)}/advance`, {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ evidence, block: payload.block === true }),
        });
        return { accepted: true };
      }

      case 'workflow.stop': {
        const runId = String(payload.runId ?? '');
        if (!runId) throw new Error('A workflow is required');
        await this.request(`/api/agent/workflows/${encodeURIComponent(runId)}/stop`, {
          method: 'POST',
          headers: scopedHeaders,
        });
        return { accepted: true };
      }

      case 'workflow.activate_draft': {
        const draftId = String(payload.draftId ?? '').trim();
        const scope = payload.scope === 'personal' ? 'personal' : 'project';
        if (!draftId) throw new Error('A workflow draft is required');
        const response = await this.request<ApiEnvelope<unknown>>(
          `/api/agent/workflows/drafts/${encodeURIComponent(draftId)}/activate`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ scope }),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'memory.save': {
        const scope = String(payload.scope ?? '');
        const content = String(payload.content ?? '');
        const expectedRevision =
          payload.expectedRevision === null || typeof payload.expectedRevision === 'string'
            ? payload.expectedRevision
            : undefined;
        let endpoint = '';
        if (scope === 'universal') endpoint = '/api/memory/universal';
        else if (scope === 'project') endpoint = '/api/memory/project';
        else if (scope === 'rules') endpoint = '/api/memory/rules';
        else if (scope === 'session') {
          const targetSessionId = String(payload.sessionId ?? sessionId);
          if (!targetSessionId) throw new Error('A chat is required');
          endpoint = `/api/memory/sessions/${encodeURIComponent(targetSessionId)}`;
        } else if (scope === 'document') {
          const documentKind = payload.documentKind === 'rules' ? 'rules' : 'memory';
          const name = String(payload.name ?? '').trim();
          if (!name) throw new Error('A memory document is required');
          endpoint = `/api/memory/documents/${documentKind}/${encodeURIComponent(name)}`;
        } else {
          throw new Error('Memory scope is required');
        }
        const response = await this.request<ApiEnvelope<MemoryDocument>>(endpoint, {
          method: 'PUT',
          headers: scopedHeaders,
          body: JSON.stringify({ content, expectedRevision }),
        });
        return { accepted: true, data: response.data };
      }

      case 'memory.init': {
        const scope = String(payload.scope ?? '');
        let endpoint = '';
        if (scope === 'universal') endpoint = '/api/memory/universal/init';
        else if (scope === 'project') endpoint = '/api/memory/project/init';
        else if (scope === 'rules') endpoint = '/api/memory/rules/init';
        else if (scope === 'session') {
          const targetSessionId = String(payload.sessionId ?? sessionId);
          if (!targetSessionId) throw new Error('A chat is required');
          endpoint = `/api/memory/sessions/${encodeURIComponent(targetSessionId)}/init`;
        } else {
          throw new Error('Memory scope is required');
        }
        const response = await this.request<ApiEnvelope<MemoryDocument>>(endpoint, {
          method: 'POST',
          headers: scopedHeaders,
        });
        return { accepted: true, data: response.data };
      }

      case 'memory.create_document': {
        const name = String(payload.name ?? '').trim();
        const documentKind = payload.documentKind === 'rules' ? 'rules' : 'memory';
        if (!name) throw new Error('A document name is required');
        const response = await this.request<ApiEnvelope<MemoryDocument>>('/api/memory/documents', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ name, kind: documentKind }),
        });
        return { accepted: true, data: response.data };
      }

      case 'memory.delete_session': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        if (!targetSessionId) throw new Error('A chat is required');
        await this.request(`/api/memory/sessions/${encodeURIComponent(targetSessionId)}`, {
          method: 'DELETE',
          headers: scopedHeaders,
        });
        return { accepted: true };
      }

      case 'note.create': {
        const title = String(payload.title ?? '').trim();
        if (!title) throw new Error('A note title is required');
        const response = await this.request<ApiEnvelope<RemoteNote>>('/api/notes/', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            title,
            content: String(payload.content ?? ''),
            ...(payload.folderPath ? { folderPath: String(payload.folderPath) } : {}),
            ...(Array.isArray(payload.tags) ? { tags: payload.tags.map(String) } : {}),
            pinned: payload.pinned === true,
            includeInContext: payload.includeInContext === true,
            format: payload.format === 'html' ? 'html' : 'markdown',
          }),
        });
        return { accepted: true, data: response.data };
      }

      case 'note.update': {
        const noteId = String(payload.noteId ?? '').trim();
        const expectedRevision = Number(payload.expectedRevision);
        if (!noteId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
          throw new Error('A note and current revision are required');
        }
        const body: Record<string, unknown> = { expectedRevision };
        for (const key of ['title', 'content', 'folderPath'] as const) {
          if (typeof payload[key] === 'string') body[key] = payload[key];
        }
        if (Array.isArray(payload.tags)) body.tags = payload.tags.map(String);
        if (typeof payload.pinned === 'boolean') body.pinned = payload.pinned;
        if (typeof payload.includeInContext === 'boolean') {
          body.includeInContext = payload.includeInContext;
        }
        if (payload.format === 'html' || payload.format === 'markdown') body.format = payload.format;
        if (payload.restoreDeletedSource === true) body.restoreDeletedSource = true;
        const response = await this.request<ApiEnvelope<RemoteNote>>(
          `/api/notes/${encodeURIComponent(noteId)}`,
          {
            method: 'PUT',
            headers: scopedHeaders,
            body: JSON.stringify(body),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'note.delete': {
        const noteId = String(payload.noteId ?? '').trim();
        const expectedRevision = Number(payload.expectedRevision);
        if (!noteId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
          throw new Error('A note and current revision are required');
        }
        const headers = { ...scopedHeaders, 'x-kory-note-revision': String(expectedRevision) };
        const response = await this.request<ApiEnvelope<RemoteNote>>(
          `/api/notes/${encodeURIComponent(noteId)}`,
          { method: 'DELETE', headers },
        );
        return { accepted: true, data: response.data };
      }

      case 'note.restore': {
        const noteId = String(payload.noteId ?? '').trim();
        const expectedRevision = Number(payload.expectedRevision);
        if (!noteId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
          throw new Error('A note and current revision are required');
        }
        const response = await this.request<ApiEnvelope<RemoteNote>>(
          `/api/notes/${encodeURIComponent(noteId)}/restore`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ expectedRevision }),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'note.restore_revision': {
        const noteId = String(payload.noteId ?? '').trim();
        const revision = Number(payload.revision);
        const expectedRevision = Number(payload.expectedRevision);
        if (
          !noteId ||
          !Number.isSafeInteger(revision) ||
          revision < 1 ||
          !Number.isSafeInteger(expectedRevision) ||
          expectedRevision < 1
        ) {
          throw new Error('A note and valid revisions are required');
        }
        const response = await this.request<ApiEnvelope<RemoteNote>>(
          `/api/notes/${encodeURIComponent(noteId)}/revisions/${revision}/restore`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ expectedRevision }),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'notes.base_create': {
        const baseName = String(payload.name ?? '').trim();
        const definition =
          payload.definition && typeof payload.definition === 'object' && !Array.isArray(payload.definition)
            ? payload.definition
            : null;
        if (!baseName || !definition) throw new Error('A Base name and definition are required');
        const response = await this.request<ApiEnvelope<NoteBase>>('/api/notes/bases', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ name: baseName, definition }),
        });
        return { accepted: true, data: response.data };
      }

      case 'notes.base_update': {
        const baseId = String(payload.baseId ?? '').trim();
        const expectedRevision = Number(payload.expectedRevision);
        if (!baseId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
          throw new Error('A Base and current revision are required');
        }
        const body: Record<string, unknown> = { expectedRevision };
        if (typeof payload.name === 'string') body.name = payload.name;
        if (payload.definition && typeof payload.definition === 'object' && !Array.isArray(payload.definition)) {
          body.definition = payload.definition;
        }
        const response = await this.request<ApiEnvelope<NoteBase>>(
          `/api/notes/bases/${encodeURIComponent(baseId)}`,
          {
            method: 'PUT',
            headers: scopedHeaders,
            body: JSON.stringify(body),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'notes.base_delete': {
        const baseId = String(payload.baseId ?? '').trim();
        const expectedRevision = Number(payload.expectedRevision);
        if (!baseId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
          throw new Error('A Base and current revision are required');
        }
        const response = await this.request<ApiEnvelope<NoteBase>>(
          `/api/notes/bases/${encodeURIComponent(baseId)}?expectedRevision=${expectedRevision}`,
          { method: 'DELETE', headers: scopedHeaders },
        );
        return { accepted: true, data: response.data };
      }

      case 'notes.base_restore': {
        const baseId = String(payload.baseId ?? '').trim();
        const expectedRevision = Number(payload.expectedRevision);
        if (!baseId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
          throw new Error('A Base and current revision are required');
        }
        const response = await this.request<ApiEnvelope<NoteBase>>(
          `/api/notes/bases/${encodeURIComponent(baseId)}/restore`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ expectedRevision }),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'notes.draft_discard': {
        const draftId = String(payload.draftId ?? '').trim();
        const expectedDraftRevision = Number(payload.expectedDraftRevision);
        if (!draftId || !Number.isSafeInteger(expectedDraftRevision) || expectedDraftRevision < 1) {
          throw new Error('A draft and current draft revision are required');
        }
        await this.request(`/api/notes/drafts/${encodeURIComponent(draftId)}/discard`, {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ expectedDraftRevision }),
        });
        return { accepted: true };
      }

      case 'notes.import_memory': {
        const response = await this.request<ApiEnvelope<unknown>>('/api/notes/import-memory', {
          method: 'POST',
          headers: scopedHeaders,
        }, 60_000);
        return { accepted: true, data: response.data };
      }

      case 'notes.import_file': {
        const data = String(payload.data ?? '');
        const name = String(payload.name ?? '').trim();
        const mimeType = String(payload.mimeType ?? 'application/octet-stream');
        if (!data || !name) throw new Error('A note file is required');
        const response = await this.requestForm<ApiEnvelope<RemoteNote>>(
          '/api/notes/import-file',
          [{ name: 'file', filename: name, mimeType, base64: data }],
          scopedHeaders,
          30_000,
        );
        return { accepted: true, data: response.data };
      }

      case 'notes.vault_preview': {
        const data = String(payload.data ?? '');
        const name = String(payload.name ?? 'koryphaios-notes-vault.zip').trim();
        const mimeType = String(payload.mimeType ?? 'application/octet-stream');
        if (!data) throw new Error('A Notes vault archive is required');
        const response = await this.requestForm<ApiEnvelope<VaultRestorePreview>>(
          '/api/notes/import-vault/preview',
          [{ name: 'file', filename: name, mimeType, base64: data }],
          scopedHeaders,
          60_000,
        );
        return { accepted: true, data: unwrap(response, 'Vault restore preview') };
      }

      case 'notes.vault_restore': {
        const data = String(payload.data ?? '');
        const name = String(payload.name ?? 'koryphaios-notes-vault.zip').trim();
        const mimeType = String(payload.mimeType ?? 'application/octet-stream');
        const archiveSha256 = String(payload.archiveSha256 ?? '').trim();
        if (!data || !archiveSha256) throw new Error('Preview the selected Notes vault archive before restoring it');
        const response = await this.requestForm<ApiEnvelope<VaultRestoreResult>>(
          '/api/notes/import-vault/restore',
          [
            { name: 'file', filename: name, mimeType, base64: data },
            { name: 'archiveSha256', value: archiveSha256 },
          ],
          scopedHeaders,
          90_000,
        );
        return { accepted: true, data: unwrap(response, 'Vault restore') };
      }

      case 'note.attachment_add': {
        const noteId = String(payload.noteId ?? '').trim();
        const data = String(payload.data ?? '');
        const name = String(payload.name ?? '').trim();
        const mimeType = String(payload.mimeType ?? 'application/octet-stream');
        if (!noteId || !data || !name) throw new Error('A note and attachment are required');
        const response = await this.requestForm<ApiEnvelope<unknown>>(
          `/api/notes/${encodeURIComponent(noteId)}/attachments`,
          [{ name: 'file', filename: name, mimeType, base64: data }],
          scopedHeaders,
          60_000,
        );
        return { accepted: true, data: response.data };
      }

      case 'note.attachment_remove': {
        const noteId = String(payload.noteId ?? '').trim();
        const attachmentId = String(payload.attachmentId ?? '').trim();
        if (!noteId || !attachmentId) throw new Error('A note and attachment are required');
        await this.request(
          `/api/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(attachmentId)}`,
          { method: 'DELETE', headers: scopedHeaders },
        );
        return { accepted: true };
      }

      case 'notes.chat_finding': {
        const sourceSessionId = String(payload.sessionId ?? sessionId).trim();
        const messageId = String(payload.messageId ?? '').trim();
        const title = String(payload.title ?? '').trim();
        const body = String(payload.body ?? '').trim();
        if (!sourceSessionId || !title || !body) throw new Error('A chat, title, and finding are required');
        const response = await this.request<ApiEnvelope<RemoteNote>>('/api/notes/chat-findings', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            title,
            body,
            source: {
              sessionId: sourceSessionId,
              ...(messageId ? { messageId } : {}),
            },
          }),
        });
        return { accepted: true, data: response.data };
      }

      case 'notes.relationship_create': {
        const fromId = String(payload.fromId ?? '').trim();
        const toId = String(payload.toId ?? '').trim();
        const type = String(payload.type ?? 'related_to');
        const evidence = String(payload.evidence ?? '').trim();
        const expectedSourceRevision = Number(payload.expectedSourceRevision);
        const expectedTargetRevision = Number(payload.expectedTargetRevision);
        if (
          !fromId ||
          !toId ||
          !evidence ||
          !['related_to', 'supports', 'contradicts', 'depends_on', 'supersedes'].includes(type) ||
          !Number.isSafeInteger(expectedSourceRevision) ||
          expectedSourceRevision < 1 ||
          !Number.isSafeInteger(expectedTargetRevision) ||
          expectedTargetRevision < 1
        ) {
          throw new Error('Relationship details and current note revisions are required');
        }
        const response = await this.request<ApiEnvelope<NoteRelationship> & { success?: boolean }>(
          '/api/notes/relationships',
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({
              fromId,
              toId,
              type,
              evidence,
              expectedSourceRevision,
              expectedTargetRevision,
              ...(Number.isFinite(Number(payload.weight)) ? { weight: Number(payload.weight) } : {}),
            }),
          },
        );
        return { accepted: response.success !== false, data: response.data };
      }

      case 'notes.relationship_review': {
        const fromId = String(payload.fromId ?? '').trim();
        const toId = String(payload.toId ?? '').trim();
        const status = payload.status === 'accepted' ? 'accepted' : payload.status === 'rejected' ? 'rejected' : '';
        const expectedRevision = Number(payload.expectedRevision);
        if (!fromId || !toId || !status || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
          throw new Error('A relationship, decision, and current revision are required');
        }
        const response = await this.request<ApiEnvelope<NoteRelationship> & { success?: boolean }>(
          `/api/notes/relationships/${encodeURIComponent(fromId)}/${encodeURIComponent(toId)}`,
          {
            method: 'PATCH',
            headers: scopedHeaders,
            body: JSON.stringify({ status, expectedRevision }),
          },
        );
        return { accepted: response.success !== false, data: response.data };
      }

      case 'notes.relationship_remove': {
        const fromId = String(payload.fromId ?? '').trim();
        const toId = String(payload.toId ?? '').trim();
        const expectedRelationshipRevision = Number(payload.expectedRelationshipRevision);
        if (
          !fromId ||
          !toId ||
          !Number.isSafeInteger(expectedRelationshipRevision) ||
          expectedRelationshipRevision < 1
        ) {
          throw new Error('A relationship and current revision are required');
        }
        await this.request(
          `/api/notes/relationships/${encodeURIComponent(fromId)}/${encodeURIComponent(toId)}`,
          {
            method: 'DELETE',
            headers: scopedHeaders,
            body: JSON.stringify({ expectedRelationshipRevision }),
          },
        );
        return { accepted: true };
      }

      case 'notes.relationship_refresh': {
        const fromId = String(payload.fromId ?? '').trim();
        const toId = String(payload.toId ?? '').trim();
        const type = String(payload.type ?? 'related_to');
        const evidence = String(payload.evidence ?? '').trim();
        const expectedRevision = Number(payload.expectedRevision);
        const expectedSourceRevision = Number(payload.expectedSourceRevision);
        const expectedTargetRevision = Number(payload.expectedTargetRevision);
        if (
          !fromId ||
          !toId ||
          !evidence ||
          !['related_to', 'supports', 'contradicts', 'depends_on', 'supersedes'].includes(type) ||
          !Number.isSafeInteger(expectedRevision) ||
          expectedRevision < 1 ||
          !Number.isSafeInteger(expectedSourceRevision) ||
          expectedSourceRevision < 1 ||
          !Number.isSafeInteger(expectedTargetRevision) ||
          expectedTargetRevision < 1
        ) {
          throw new Error('Current relationship and endpoint revisions are required');
        }
        const response = await this.request<ApiEnvelope<NoteRelationship> & { success?: boolean }>(
          `/api/notes/relationships/${encodeURIComponent(fromId)}/${encodeURIComponent(toId)}/refresh`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({
              expectedRevision,
              type,
              evidence,
              expectedSourceRevision,
              expectedTargetRevision,
              ...(Number.isFinite(Number(payload.weight)) ? { weight: Number(payload.weight) } : {}),
            }),
          },
        );
        return { accepted: response.success !== false, data: response.data };
      }

      case 'notes.properties_patch': {
        const noteId = String(payload.noteId ?? '').trim();
        const expectedRevision = Number(payload.expectedRevision);
        const patches = Array.isArray(payload.patches) ? payload.patches : [];
        if (!noteId || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !patches.length) {
          throw new Error('A note, current revision, and property changes are required');
        }
        const response = await this.request<
          ApiEnvelope<{ note: RemoteNote; properties: NotePropertiesSnapshot }>
        >(
          `/api/notes/${encodeURIComponent(noteId)}/properties`,
          {
            method: 'PATCH',
            headers: scopedHeaders,
            body: JSON.stringify({ expectedRevision, patches }),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'notes.properties_reindex': {
        const response = await this.request<ApiEnvelope<unknown>>('/api/notes/properties/reindex', {
          method: 'POST',
          headers: scopedHeaders,
        }, 30_000);
        return { accepted: true, data: response.data };
      }

      case 'notes.semantic_index_rebuild': {
        const limit = Math.max(1, Math.min(128, Number(payload.limit ?? 32)));
        const response = await this.request<ApiEnvelope<NoteSemanticIndexRebuildResult> & { success?: boolean }>(
          '/api/notes/semantic-index/rebuild',
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({
              optIn: true,
              limit,
              ...(payload.reset === true ? { reset: true } : {}),
            }),
          },
          60_000,
        );
        return { accepted: response.success !== false, data: response.data };
      }

      case 'notes.sync': {
        const response = await this.request<ApiEnvelope<unknown>>('/api/notes/sync-project', {
          method: 'POST',
          headers: scopedHeaders,
        }, 60_000);
        return { accepted: true, data: response.data };
      }

      case 'collab.start': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        if (!targetSessionId) throw new Error('A chat is required');
        const response = await this.request<ApiEnvelope<CollaborationHost>>('/api/collab/host/start', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            sessionId: targetSessionId,
            ...(payload.hostName ? { hostName: String(payload.hostName) } : {}),
            ...(Array.isArray(payload.workspacePaths)
              ? { workspacePaths: payload.workspacePaths.map(String) }
              : {}),
          }),
        }, 30_000);
        return { accepted: true, data: response.data };
      }

      case 'collab.end': {
        const hostId = String(payload.hostId ?? '').trim();
        if (!hostId) throw new Error('Team session is required');
        await this.request(`/api/collab/${encodeURIComponent(hostId)}/end`, {
          method: 'POST',
          headers: scopedHeaders,
        });
        return { accepted: true };
      }

      case 'collab.policy': {
        const hostId = String(payload.hostId ?? '').trim();
        if (!hostId || !payload.policy || typeof payload.policy !== 'object') {
          throw new Error('Team session and policy are required');
        }
        const response = await this.request<ApiEnvelope<unknown>>(
          `/api/collab/${encodeURIComponent(hostId)}/policy`,
          {
            method: 'PATCH',
            headers: scopedHeaders,
            body: JSON.stringify(payload.policy),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'collab.prompt_decision': {
        const hostId = String(payload.hostId ?? '').trim();
        const promptId = String(payload.promptId ?? '').trim();
        if (!hostId || !promptId) throw new Error('Pending prompt is required');
        const response = await this.request<ApiEnvelope<unknown>>(
          `/api/collab/${encodeURIComponent(hostId)}/approve`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ promptId, approved: payload.approved === true }),
          },
          30_000,
        );
        return { accepted: true, data: response.data };
      }

      case 'collab.join_decision': {
        const hostId = String(payload.hostId ?? '').trim();
        const guestId = String(payload.guestId ?? '').trim();
        if (!hostId || !guestId) throw new Error('Pending guest is required');
        const response = await this.request<ApiEnvelope<unknown>>(
          `/api/collab/${encodeURIComponent(hostId)}/join-decision`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({
              guestId,
              approved: payload.approved === true,
              ...(payload.tierId ? { tierId: String(payload.tierId) } : {}),
            }),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'collab.assign_tier': {
        const hostId = String(payload.hostId ?? '').trim();
        const guestId = String(payload.guestId ?? '').trim();
        const tierId = String(payload.tierId ?? '').trim();
        if (!hostId || !guestId || !tierId) throw new Error('Participant and access tier are required');
        await this.request(`/api/collab/${encodeURIComponent(hostId)}/assign-tier`, {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ guestId, tierId }),
        });
        return { accepted: true };
      }

      case 'collab.invite': {
        const hostId = String(payload.hostId ?? '').trim();
        const tierId = String(payload.tierId ?? '').trim();
        if (!hostId || !tierId) throw new Error('Team session and access tier are required');
        const response = await this.request<ApiEnvelope<{ tierId: string; url: string }>>(
          `/api/collab/${encodeURIComponent(hostId)}/invite`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ tierId }),
          },
        );
        return { accepted: true, data: response.data };
      }

      case 'collab.join': {
        const joinCode = String(payload.joinCode ?? '').trim().toUpperCase();
        const name = String(payload.name ?? '').trim() || 'Koryphaios Mobile';
        if (!/^[A-HJ-NP-Z2-9]{8}$/.test(joinCode)) {
          throw new Error('Enter the eight-character join code');
        }
        const response = await this.request<ApiEnvelope<Record<string, unknown>>>(
          '/api/collab/join',
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({
              joinCode,
              userId: `mobile-${Date.now().toString(36)}`,
              name,
            }),
          },
          30_000,
        );
        return { accepted: true, data: unwrap(response, 'Join team session') };
      }

      case 'model_sharing.save': {
        const providers = Array.isArray(payload.providers) ? payload.providers.map(String) : [];
        const models =
          payload.models && typeof payload.models === 'object' && !Array.isArray(payload.models)
            ? payload.models
            : {};
        await this.request('/api/collab/providers/shared', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ providers, models }),
        });
        return { accepted: true };
      }

      case 'model_sharing.start': {
        const response = await this.request<ApiEnvelope<Record<string, unknown>>>(
          '/api/collab/providers/sharing/start',
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ hostName: String(payload.hostName ?? '').trim() || 'Host' }),
          },
          30_000,
        );
        return { accepted: true, data: unwrap(response, 'Start model sharing') };
      }

      case 'model_sharing.stop': {
        await this.request('/api/collab/providers/sharing/stop', {
          method: 'POST',
          headers: scopedHeaders,
        });
        return { accepted: true };
      }

      case 'model_sharing.connect': {
        const joinCode = String(payload.joinCode ?? '').trim();
        if (!joinCode) throw new Error('A model sharing code is required');
        const response = await this.request<ApiEnvelope<Record<string, unknown>>>(
          '/api/collab/providers/connect',
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({
              joinCode,
              name: String(payload.name ?? '').trim() || 'Koryphaios Mobile',
            }),
          },
          30_000,
        );
        return { accepted: true, data: unwrap(response, 'Connect to shared models') };
      }

      case 'model_sharing.disconnect': {
        await this.request('/api/collab/providers/disconnect', {
          method: 'POST',
          headers: scopedHeaders,
        });
        return { accepted: true };
      }

      case 'model_sharing.sandbox': {
        const policy =
          payload.policy && typeof payload.policy === 'object' && !Array.isArray(payload.policy)
            ? payload.policy as RemoteSandboxPolicy
            : null;
        if (!policy) throw new Error('Sandbox policy is required');
        await this.request('/api/collab/providers/sandbox', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ policy }),
        });
        return { accepted: true };
      }

      case 'mcp.save': {
        const currentName = String(payload.currentName ?? '').trim();
        const input =
          payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)
            ? payload.input as Record<string, unknown>
            : null;
        const name = String(input?.name ?? '').trim();
        const type = String(input?.type ?? '');
        if (!input || !name || !['stdio', 'sse'].includes(type)) {
          throw new Error('MCP server definition is incomplete');
        }
        await this.request(
          currentName
            ? `/api/v1/mcp-servers/${encodeURIComponent(currentName)}`
            : '/api/v1/mcp-servers',
          {
            method: currentName ? 'PUT' : 'POST',
            body: JSON.stringify(input),
          },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'mcp.test':
      case 'mcp.reload':
      case 'mcp.remove': {
        const mcpAction = command.name;
        const serverName = String(payload.name ?? '').trim();
        if (!serverName) throw new Error('MCP server is required');
        const endpoint = `/api/v1/mcp-servers/${encodeURIComponent(serverName)}`;
        if (mcpAction === 'mcp.remove') {
          await this.request(endpoint, { method: 'DELETE' }, 30_000);
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        const response = await this.request<ApiEnvelope<unknown>>(
          `${endpoint}/${mcpAction === 'mcp.test' ? 'test' : 'reload'}`,
          { method: 'POST' },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: response.data };
      }

      case 'mcp.oauth_start': {
        const serverName = String(payload.name ?? '').trim();
        if (!serverName) throw new Error('MCP server is required');
        const body: Record<string, string> = {};
        if (typeof payload.clientId === 'string' && payload.clientId.trim()) {
          body.clientId = payload.clientId.trim();
        }
        if (typeof payload.clientSecret === 'string' && payload.clientSecret.trim()) {
          body.clientSecret = payload.clientSecret.trim();
        }
        const response = await this.request<
          ApiEnvelope<{
            authorizationUrl: string;
            authorizationHost: string;
            scopes: string[];
            resourceName?: string;
            expiresInSeconds: number;
          }> & { code?: string }
        >(
          `/api/v1/mcp-servers/${encodeURIComponent(serverName)}/oauth/start`,
          {
            method: 'POST',
            ...(Object.keys(body).length ? { body: JSON.stringify(body) } : {}),
          },
          30_000,
        );
        return { accepted: response.ok !== false, data: response.data ?? response };
      }

      case 'mcp.oauth_complete': {
        const serverName = String(payload.name ?? '').trim();
        if (!serverName) throw new Error('MCP server is required');
        const response = await this.request<ApiEnvelope<unknown>>(
          `/api/v1/mcp-servers/${encodeURIComponent(serverName)}/oauth/complete`,
          { method: 'POST' },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: response.ok !== false, data: response.data };
      }

      case 'mcp.oauth_cancel': {
        const serverName = String(payload.name ?? '').trim();
        if (!serverName) throw new Error('MCP server is required');
        await this.request(
          `/api/v1/mcp-servers/${encodeURIComponent(serverName)}/oauth/cancel`,
          { method: 'POST' },
        );
        return { accepted: true };
      }

      case 'mcp.oauth_disconnect': {
        const serverName = String(payload.name ?? '').trim();
        if (!serverName) throw new Error('MCP server is required');
        await this.request(
          `/api/v1/mcp-servers/${encodeURIComponent(serverName)}/oauth`,
          { method: 'DELETE' },
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'media.generate_image': {
        const prompt = String(payload.prompt ?? '').trim();
        if (!prompt) throw new Error('An image prompt is required');
        const body: Record<string, unknown> = { prompt };
        if (typeof payload.jobId === 'string' && payload.jobId.trim()) {
          body.jobId = payload.jobId.trim();
        }
        for (const key of ['provider', 'model', 'effect', 'size', 'quality', 'background', 'outputFormat'] as const) {
          if (typeof payload[key] === 'string' && payload[key]) body[key] = payload[key];
        }
        const response = await this.request<ApiEnvelope<unknown>>('/api/images/generate', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify(body),
        }, 120_000);
        return { accepted: true, data: response.data };
      }

      case 'media.edit_image': {
        const prompt = String(payload.prompt ?? '').trim();
        const imageBase64 = String(payload.imageBase64 ?? '').trim();
        if (!prompt || !imageBase64) throw new Error('An image and edit prompt are required');
        const body: Record<string, unknown> = { prompt, imageBase64 };
        if (typeof payload.jobId === 'string' && payload.jobId.trim()) {
          body.jobId = payload.jobId.trim();
        }
        for (const key of ['provider', 'model', 'effect', 'size', 'quality', 'background', 'outputFormat'] as const) {
          if (typeof payload[key] === 'string' && payload[key]) body[key] = payload[key];
        }
        const response = await this.request<ApiEnvelope<unknown>>('/api/images/edit', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify(body),
        }, 120_000);
        return { accepted: true, data: response.data };
      }

      case 'media.generate_video': {
        const prompt = String(payload.prompt ?? '').trim();
        if (!prompt) throw new Error('A video prompt is required');
        const body: Record<string, unknown> = { prompt };
        if (typeof payload.jobId === 'string' && payload.jobId.trim()) {
          body.jobId = payload.jobId.trim();
        }
        for (const key of ['provider', 'model', 'duration', 'aspectRatio', 'resolution', 'negativePrompt'] as const) {
          if (typeof payload[key] === 'string' && payload[key]) body[key] = payload[key];
        }
        if (typeof payload.sound === 'boolean') body.sound = payload.sound;
        if (Number.isInteger(payload.seed)) body.seed = payload.seed;
        const response = await this.request<ApiEnvelope<unknown>>('/api/video/generate', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify(body),
        }, 180_000);
        return { accepted: true, data: response.data };
      }

      case 'media.cancel': {
        const kind = payload.kind === 'video' ? 'video' : 'images';
        const jobId = String(payload.jobId ?? '').trim();
        if (!jobId) throw new Error('A media job is required');
        const response = await this.request<ApiEnvelope<unknown>>(
          `/api/${kind}/jobs/${encodeURIComponent(jobId)}/cancel`,
          { method: 'POST', headers: scopedHeaders },
        );
        return { accepted: true, data: response.data };
      }

      case 'media.delete_history': {
        const kind = payload.kind === 'video' ? 'video' : 'images';
        const historyId = String(payload.historyId ?? '').trim();
        if (!historyId) throw new Error('A history item is required');
        await this.request(`/api/${kind}/history/${encodeURIComponent(historyId)}`, {
          method: 'DELETE',
          headers: scopedHeaders,
        });
        return { accepted: true };
      }

      case 'timetravel.apply': {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        const hash = String(payload.hash ?? '');
        const expectedCurrentHash = String(payload.expectedCurrentHash ?? '');
        if (!targetSessionId || !hash || !expectedCurrentHash) {
          throw new Error('A chat and recorded state are required');
        }
        await this.request(`/api/sessions/${encodeURIComponent(targetSessionId)}/rewind`, {
          method: 'POST',
          body: JSON.stringify({ hash, expectedCurrentHash, confirmed: true }),
        }, 60_000);
        return { accepted: true, sessionId: targetSessionId };
      }

      case 'computer.update': {
        if (!payload.settings || typeof payload.settings !== 'object') {
          throw new Error('Computer-use settings are required');
        }
        await this.request('/api/agent/settings', {
          method: 'PUT',
          headers: scopedHeaders,
          body: JSON.stringify({ computerUse: payload.settings as ComputerUseSettings }),
        });
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'computer.stop': {
        await this.request('/api/v1/computer-use/stop', { method: 'POST', headers: scopedHeaders });
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'process.start': {
        const commandText = String(payload.command ?? '').trim();
        if (!sessionId || !commandText) throw new Error('A chat and command are required');
        await this.request('/api/processes', {
          method: 'POST',
          body: JSON.stringify({
            name: String(payload.name ?? '').trim() || 'Mobile command',
            command: commandText,
            sessionId,
            cwd: payload.cwd ? String(payload.cwd) : undefined,
            restartPolicy: payload.restartPolicy ?? 'never',
          }),
        });
        return { accepted: true };
      }

      case 'process.control': {
        const processId = String(payload.processId ?? '');
        const action = String(payload.action ?? '');
        if (!processId) throw new Error('Process is required');
        if (action === 'stop') {
          await this.request(
            `/api/processes/${encodeURIComponent(processId)}?signal=SIGTERM`,
            { method: 'DELETE' },
          );
          return { accepted: true };
        }
        if (action === 'restart') {
          await this.request(`/api/processes/${encodeURIComponent(processId)}/restart`, {
            method: 'POST',
          });
          return { accepted: true };
        }
        if (action === 'input') {
          const input = String(payload.input ?? '');
          if (!input) throw new Error('Process input is required');
          await this.request(`/api/processes/${encodeURIComponent(processId)}/input`, {
            method: 'POST',
            body: JSON.stringify({ input }),
          });
          return { accepted: true };
        }
        throw new Error(`Unsupported process action: ${action}`);
      }

      case 'process.cleanup': {
        const daysToKeep = Number(payload.daysToKeep ?? 7);
        if (!Number.isFinite(daysToKeep) || daysToKeep < 0) {
          throw new Error('Cleanup age must be zero or more days');
        }
        const response = await this.request<{ ok?: boolean; deleted?: number; count?: number }>(
          '/api/processes/cleanup',
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ daysToKeep }),
          },
        );
        return {
          accepted: true,
          data: { deleted: Number(response.deleted ?? response.count ?? 0) },
        };
      }

      case 'goal.create': {
        const objective = String(payload.objective ?? '').trim();
        const scope = String(payload.scope ?? 'session');
        if (!objective) throw new Error('Goal objective is required');
        if (!['workspace', 'project', 'session'].includes(scope)) throw new Error('Invalid goal scope');
        const response = await this.request<{ id?: unknown; data?: { id?: unknown } }>('/api/goals', {
          method: 'POST',
          body: JSON.stringify({
            objective,
            scope,
            ...(scope === 'project' ? { projectPath: projectId } : {}),
            ...(scope === 'session' ? { sessionId } : {}),
            planningDepth: payload.planningDepth ?? 'adaptive',
          }),
        });
        // The authoritative goal ID lets the screen distinguish this write
        // from an older goal with the same objective after reconnection.
        const created = response?.data ?? response;
        return { accepted: true, ...(typeof created?.id === 'string' && created.id.trim()
          ? { data: { id: created.id } }
          : {}) };
      }

      case 'goal.control': {
        const goalId = String(payload.goalId ?? '');
        const action = String(payload.action ?? '');
        if (!goalId) throw new Error('Goal is required');
        if (action === 'drive') {
          const provider = String(payload.provider ?? '').trim();
          const model = String(payload.model ?? '').trim();
          if (!sessionId || !provider || !model) {
            throw new Error('Driving a goal requires the active chat, provider, and model');
          }
          await this.request(`/api/goals/${encodeURIComponent(goalId)}/drive`, {
            method: 'POST',
            body: JSON.stringify({
              sessionId,
              provider,
              model,
              reasoningLevel: payload.reasoningLevel,
              instructions: payload.instructions,
              remotePlanApproved: payload.remotePlanApproved,
            }),
          });
          return { accepted: true };
        }
        if (['pause', 'resume', 'stop'].includes(action)) {
          await this.request(`/api/goals/${encodeURIComponent(goalId)}/${action}`, {
            method: 'POST',
          });
          return { accepted: true };
        }
        throw new Error(`Unsupported goal action: ${action}`);
      }

      case 'goal.update': {
        const goalId = String(payload.goalId ?? '');
        if (!goalId) throw new Error('Goal is required');
        const changes = payload.changes;
        if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
          throw new Error('Goal changes are required');
        }
        await this.request(`/api/goals/${encodeURIComponent(goalId)}`, {
          method: 'PATCH',
          body: JSON.stringify(changes),
        });
        return { accepted: true };
      }

      case 'goal.checklist.update': {
        const goalId = String(payload.goalId ?? '');
        const items = payload.items;
        if (!goalId || !Array.isArray(items)) throw new Error('Goal checklist is incomplete');
        await this.request(`/api/goals/${encodeURIComponent(goalId)}/checklist`, {
          method: 'PATCH',
          body: JSON.stringify({ items }),
        });
        return { accepted: true };
      }

      case 'goal.delete': {
        const goalId = String(payload.goalId ?? '');
        if (!goalId) throw new Error('Goal is required');
        await this.request(`/api/goals/${encodeURIComponent(goalId)}`, { method: 'DELETE' });
        return { accepted: true };
      }

      case 'checklist.create': {
        const title = String(payload.title ?? '').trim();
        const scope = String(payload.scope ?? 'session');
        if (!title) throw new Error('Checklist title is required');
        const response = await this.request<{ id?: unknown; data?: { id?: unknown } }>('/api/checklists', {
          method: 'POST',
          body: JSON.stringify({
            title,
            scope,
            ...(scope === 'project' ? { projectPath: projectId } : {}),
            ...(scope === 'session' ? { sessionId } : {}),
          }),
        });
        const created = response?.data ?? response;
        return { accepted: true, ...(typeof created?.id === 'string' && created.id.trim()
          ? { data: { id: created.id } }
          : {}) };
      }

      case 'checklist.add_items': {
        const checklistId = String(payload.checklistId ?? '');
        const items = Array.isArray(payload.items) ? payload.items.map(String) : [];
        if (!checklistId || !items.some((item) => item.trim())) {
          throw new Error('Checklist item is required');
        }
        await this.request(`/api/checklists/${encodeURIComponent(checklistId)}/items`, {
          method: 'POST',
          body: JSON.stringify({ items, sessionId: sessionId || undefined }),
        });
        return { accepted: true };
      }

      case 'checklist.replace_items': {
        const checklistId = String(payload.checklistId ?? '');
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (!checklistId) throw new Error('Checklist is required');
        await this.request(`/api/checklists/${encodeURIComponent(checklistId)}/items`, {
          method: 'PATCH',
          body: JSON.stringify({ items }),
        });
        return { accepted: true };
      }

      case 'checklist.item_status': {
        const checklistId = String(payload.checklistId ?? '');
        const itemId = String(payload.itemId ?? '');
        const status = String(payload.status ?? '');
        if (!checklistId || !itemId || !['pending', 'done', 'skipped'].includes(status)) {
          throw new Error('Checklist item update is incomplete');
        }
        await this.request(
          `/api/checklists/${encodeURIComponent(checklistId)}/items/${encodeURIComponent(itemId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ status, sessionId: sessionId || undefined }),
          },
        );
        return { accepted: true };
      }

      case 'checklist.update': {
        const checklistId = String(payload.checklistId ?? '');
        if (!checklistId) throw new Error('Checklist is required');
        const body: Record<string, unknown> = {};
        if (payload.title !== undefined) body.title = String(payload.title);
        if (payload.archived !== undefined) body.archived = Boolean(payload.archived);
        if (!Object.keys(body).length) throw new Error('Checklist update is empty');
        await this.request(`/api/checklists/${encodeURIComponent(checklistId)}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        return { accepted: true };
      }

      case 'checklist.delete': {
        const checklistId = String(payload.checklistId ?? '');
        if (!checklistId) throw new Error('Checklist is required');
        await this.request(`/api/checklists/${encodeURIComponent(checklistId)}`, {
          method: 'DELETE',
        });
        return { accepted: true };
      }

      case 'git.refresh': {
        gitPollingEligibility.delete(gitScopeKey(this.target.baseUrl, sessionId, projectId));
        return { accepted: true };
      }

      case 'git.action': {
        const action = String(payload.action ?? '');
        if (!sessionId) throw new Error('Open a chat before changing Git state');
        const file = String(payload.file ?? '');
        if (action === 'stage' || action === 'unstage') {
          if (!file) throw new Error('Git file is required');
          await this.request('/api/git/stage', {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ file, unstage: action === 'unstage' }),
          });
          return { accepted: true };
        }
        if (action === 'restore') {
          if (!file) throw new Error('Git file is required');
          await this.request('/api/git/restore', {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ file }),
          });
          return { accepted: true };
        }
        if (action === 'commit') {
          const message = String(payload.message ?? '').trim();
          if (!message) throw new Error('Commit message is required');
          await this.request('/api/git/commit', {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ message }),
          });
          return { accepted: true };
        }
        if (action === 'checkout' || action === 'create_branch') {
          const branch = String(payload.branch ?? '').trim();
          if (!branch) throw new Error('Branch name is required');
          await this.request('/api/git/checkout', {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ branch, create: action === 'create_branch' }),
          });
          return { accepted: true };
        }
        if (action === 'merge') {
          const branch = String(payload.branch ?? '').trim();
          if (!branch) throw new Error('Branch name is required');
          await this.request('/api/git/merge', {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ branch }),
          });
          return { accepted: true };
        }
        if (action === 'push' || action === 'pull') {
          await this.request(`/api/git/${action}`, { method: 'POST', headers: scopedHeaders }, 30_000);
          return { accepted: true };
        }
        if (action === 'remote') {
          const url = String(payload.url ?? '').trim();
          if (!url) throw new Error('Remote URL is required');
          await this.request('/api/git/remote', {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ url }),
          });
          return { accepted: true };
        }
        if (action === 'resolve_worktree' || action === 'discard_worktree') {
          const taskId = String(payload.taskId ?? '');
          if (!taskId) throw new Error('Worktree resolution is required');
          const path = action === 'resolve_worktree' ? 'resolve' : 'discard';
          await this.request(`/api/git/worktrees/${path}`, {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ taskId }),
          }, 30_000);
          return { accepted: true };
        }
        throw new Error(`Unsupported Git action: ${action}`);
      }

      case 'git.chat_switch': {
        if (!sessionId) throw new Error('Open a chat before changing its Git revision');
        const target =
          payload.target && typeof payload.target === 'object' && !Array.isArray(payload.target)
            ? payload.target as ChatGitTarget
            : null;
        const expectedHead = String(payload.expectedHead ?? '').trim();
        const expectedBranch =
          payload.expectedBranch === null ? null : String(payload.expectedBranch ?? '').trim();
        if (!target || !expectedHead) throw new Error('Chat Git selection is incomplete');
        const response = await this.request<ApiEnvelope<ChatGitState>>('/api/git/chat/switch', {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ target, expectedHead, expectedBranch }),
        }, 60_000);
        return { accepted: true, data: unwrap(response, 'Switch chat Git revision') };
      }

      case 'agent.message': {
        const agentId = String(payload.agentId ?? '');
        const content = String(payload.body ?? '').trim();
        const model = String(payload.model ?? '').trim();
        const reasoningLevel = String(payload.reasoningLevel ?? '').trim();
        if (!sessionId || !agentId || !content) throw new Error('Agent message is incomplete');
        if (agentId === 'kory-manager') {
          await this.request('/api/messages/', {
            method: 'POST',
            body: JSON.stringify({
              sessionId,
              content,
              ...(model ? { model } : {}),
              ...(reasoningLevel ? { reasoningLevel } : {}),
            }),
          });
        } else {
          await this.request(`/api/agent/${encodeURIComponent(agentId)}/message`, {
            method: 'POST',
            body: JSON.stringify({
              sessionId,
              content,
              ...(model ? { model } : {}),
              ...(reasoningLevel ? { reasoningLevel } : {}),
            }),
          });
        }
        return { accepted: true };
      }

      case 'agent.control': {
        const agentId = String(payload.agentId ?? '');
        const action = String(payload.action ?? '');
        if (action !== 'stop') {
          throw new Error('Koryphaios currently exposes Stop for active agents');
        }
        if (!sessionId || !agentId) throw new Error('Agent control is incomplete');
        const endpoint =
          agentId === 'kory-manager'
            ? `/api/sessions/${encodeURIComponent(sessionId)}/cancel`
            : `/api/agent/${encodeURIComponent(agentId)}/cancel`;
        await this.request(endpoint, { method: 'POST' });
        return { accepted: true };
      }

      case 'agent.message_decide': {
        const messageId = String(payload.messageId ?? '').trim();
        if (!messageId) throw new Error('Agent message is required');
        const response = await this.request<ApiEnvelope<{ message?: AgentMessage }>>(
          `/api/v1/agent-messages/${encodeURIComponent(messageId)}/approve`,
          {
            method: 'POST',
            headers: scopedHeaders,
            body: JSON.stringify({ approved: payload.approved === true }),
          },
        );
        return { accepted: true, data: response.data?.message };
      }

      case 'provider.refresh': {
        const provider = String(payload.provider ?? '').trim();
        if (!provider) throw new Error('Provider is required');
        const response = await this.request<Record<string, unknown>>(
          `/api/providers/${encodeURIComponent(provider)}/refresh`,
          {
            method: 'POST',
            body: JSON.stringify({ runtimeCheck: payload.runtimeCheck === true }),
          },
          payload.runtimeCheck === true ? 60_000 : 30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: response };
      }

      case 'provider.disconnect': {
        const provider = String(payload.provider ?? '').trim();
        if (!provider) throw new Error('Provider is required');
        await this.request(`/api/providers/${encodeURIComponent(provider)}`, { method: 'DELETE' });
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'provider.credentials.set': {
        const provider = String(payload.provider ?? '').trim();
        if (!provider) throw new Error('Provider is required');
        const body: Record<string, unknown> = {};
        for (const key of ['apiKey', 'authToken', 'baseUrl', 'deployment', 'awsRegion', 'awsSessionToken']) {
          const value = String(payload[key] ?? '').trim();
          if (value) body[key] = value;
        }
        if (Array.isArray(payload.selectedModels)) body.selectedModels = payload.selectedModels.map(String);
        if (typeof payload.hideModelSelector === 'boolean') {
          body.hideModelSelector = payload.hideModelSelector;
        }
        if (payload.fullCheck === true) body.fullCheck = true;
        if (!Object.keys(body).length) throw new Error('Provider update is empty');
        const response = await this.request<Record<string, unknown>>(
          `/api/providers/${encodeURIComponent(provider)}`,
          { method: 'PUT', body: JSON.stringify(body) },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: response };
      }

      case 'provider.custom.add': {
        const label = String(payload.label ?? '').trim();
        const baseUrl = String(payload.baseUrl ?? '').trim();
        if (!label || !baseUrl) throw new Error('Provider name and endpoint are required');
        const models = Array.isArray(payload.models)
          ? payload.models.map(String).map((model) => model.trim()).filter(Boolean)
          : String(payload.models ?? '').split(',').map((model) => model.trim()).filter(Boolean);
        const headers =
          payload.headers && typeof payload.headers === 'object' && !Array.isArray(payload.headers)
            ? Object.fromEntries(
                Object.entries(payload.headers as Record<string, unknown>)
                  .map(([name, value]) => [name.trim(), String(value ?? '').trim()] as const)
                  .filter(([name, value]) => Boolean(name && value)),
              )
            : undefined;
        const adapter = String(payload.adapter ?? '').trim();
        const body = {
          label,
          baseUrl,
          apiKey: String(payload.apiKey ?? '').trim() || undefined,
          authToken: String(payload.authToken ?? '').trim() || undefined,
          models: models.length ? models : undefined,
          headers: headers && Object.keys(headers).length ? headers : undefined,
          adapter: adapter || undefined,
          allowUnverified: payload.allowUnverified === true,
        };
        const response = await this.request<Record<string, unknown>>(
          '/api/providers/custom',
          { method: 'POST', body: JSON.stringify(body) },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: response };
      }

      case 'provider.custom.delete': {
        const provider = String(payload.provider ?? '').trim();
        if (!provider) throw new Error('Custom provider is required');
        await this.request(`/api/providers/custom/${encodeURIComponent(provider)}`, {
          method: 'DELETE',
        });
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'provider.custom.icon.set': {
        const provider = String(payload.provider ?? '').trim();
        const base64 = String(payload.base64 ?? '').trim();
        const shape = payload.shape === 'circle' ? 'circle' : 'rounded-square';
        if (!provider || !base64) throw new Error('Custom provider icon is required');
        await this.request(`/api/providers/custom/${encodeURIComponent(provider)}/icon`, {
          method: 'PUT',
          body: JSON.stringify({ base64, shape }),
        }, 30_000);
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'provider.custom.icon.remove': {
        const provider = String(payload.provider ?? '').trim();
        if (!provider) throw new Error('Custom provider is required');
        await this.request(`/api/providers/custom/${encodeURIComponent(provider)}/icon`, {
          method: 'DELETE',
        });
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'provider.account.add': {
        const provider = String(payload.provider ?? '').trim();
        if (!provider) throw new Error('Provider is required');
        const body = {
          label: String(payload.label ?? '').trim() || undefined,
          apiKey: String(payload.apiKey ?? '').trim() || undefined,
          authToken: String(payload.authToken ?? '').trim() || undefined,
          baseUrl: String(payload.baseUrl ?? '').trim() || undefined,
          activate: payload.activate === true,
        };
        if (!body.apiKey && !body.authToken && !body.baseUrl) {
          throw new Error('Enter at least one account credential');
        }
        const response = await this.request<Record<string, unknown>>(
          `/api/providers/${encodeURIComponent(provider)}/accounts`,
          { method: 'POST', body: JSON.stringify(body) },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: response };
      }

      case 'provider.account.activate': {
        const provider = String(payload.provider ?? '').trim();
        const accountId = String(payload.accountId ?? '').trim();
        if (!provider || !accountId) throw new Error('Provider account is required');
        const response = await this.request<Record<string, unknown>>(
          `/api/providers/${encodeURIComponent(provider)}/accounts/${encodeURIComponent(accountId)}/activate`,
          { method: 'POST' },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: response };
      }

      case 'provider.account.delete': {
        const provider = String(payload.provider ?? '').trim();
        const accountId = String(payload.accountId ?? '').trim();
        if (!provider || !accountId) throw new Error('Provider account is required');
        await this.request(
          `/api/providers/${encodeURIComponent(provider)}/accounts/${encodeURIComponent(accountId)}`,
          { method: 'DELETE' },
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'provider.account.rename': {
        const provider = String(payload.provider ?? '').trim();
        const accountId = String(payload.accountId ?? '').trim();
        const label = String(payload.label ?? '').trim();
        if (!provider || !accountId || !label) throw new Error('Account name is required');
        await this.request(
          `/api/providers/${encodeURIComponent(provider)}/accounts/${encodeURIComponent(accountId)}`,
          { method: 'PATCH', body: JSON.stringify({ label }) },
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'provider.fallback.set': {
        const provider = String(payload.provider ?? '').trim();
        const order = Array.isArray(payload.order) ? payload.order.map(String) : [];
        if (!provider) throw new Error('Provider is required');
        await this.request(`/api/providers/${encodeURIComponent(provider)}/fallback-order`, {
          method: 'PUT',
          body: JSON.stringify({ order, enabled: payload.enabled === true }),
        });
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'provider.auth.start': {
        const provider = String(payload.provider ?? '').trim();
        if (!provider) throw new Error('Provider is required');
        const response = await this.request<ApiEnvelope<ProviderAuthData> & ProviderAuthData>(
          `/api/providers/${encodeURIComponent(provider)}/auth/start`,
          { method: 'POST' },
          30_000,
        );
        const data = response.data ?? response;
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data };
      }

      case 'provider.auth.complete': {
        const provider = String(payload.provider ?? '').trim();
        if (!provider) throw new Error('Provider is required');
        const response = await this.request<ApiEnvelope<ProviderAuthData> & ProviderAuthData & { pending?: boolean }>(
          `/api/providers/${encodeURIComponent(provider)}/auth/complete`,
          { method: 'POST' },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: response.ok !== false, data: response.data ?? response };
      }

      case 'provider.auth.poll': {
        const provider = String(payload.provider ?? '').trim();
        const deviceCode = String(payload.deviceCode ?? '').trim();
        if (!provider || !deviceCode) throw new Error('Provider sign-in is incomplete');
        if (!['copilot', 'kimicode'].includes(provider)) {
          throw new Error('This provider does not expose mobile device-code polling');
        }
        const response = await this.request<ApiEnvelope<ProviderAuthData>>(
          `/api/providers/${provider === 'copilot' ? 'copilot' : 'kimicode'}/auth/poll`,
          { method: 'POST', body: JSON.stringify({ deviceCode }) },
          30_000,
        );
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true, data: response.data ?? response };
      }

      case 'setting.update': {
        const settingId = String(payload.settingId ?? '');
        const value = payload.value;
        if (settingId.startsWith('agent.')) {
          const pathParts = settingId.slice('agent.'.length).split('.').filter(Boolean);
          await this.request('/api/agent/settings', {
            method: 'PUT',
            body: JSON.stringify(nestedPatch(pathParts, value)),
          });
        } else if (settingId === 'mode.mode') {
          await this.request('/api/mode', {
            method: 'PUT',
            body: JSON.stringify({ mode: value }),
          });
        } else if (settingId.startsWith('memory.')) {
          const pathParts = settingId.slice('memory.'.length).split('.').filter(Boolean);
          await this.request('/api/memory/settings', {
            method: 'PUT',
            body: JSON.stringify(nestedPatch(pathParts, value)),
          });
        } else if (settingId.startsWith('notesPermissions.')) {
          const pathParts = settingId.slice('notesPermissions.'.length).split('.').filter(Boolean);
          await this.request('/api/notes/settings/agent-permissions', {
            method: 'PUT',
            body: JSON.stringify(nestedPatch(pathParts, value)),
          });
        } else if (settingId.startsWith('notes.')) {
          const pathParts = settingId.slice('notes.'.length).split('.').filter(Boolean);
          await this.request('/api/notes/settings', {
            method: 'PUT',
            body: JSON.stringify(nestedPatch(pathParts, value)),
          });
        } else if (settingId.startsWith('appearance.')) {
          const pathParts = settingId.slice('appearance.'.length).split('.').filter(Boolean);
          const currentResponse = await this.request<ApiEnvelope<AppearanceSettings | null>>('/api/appearance');
          const current: AppearanceSettings = currentResponse.data ?? {
            preset: 'kintsugi',
            accent: 'gold',
            secondaryAccent: 'gold',
            font: 'inter',
          };
          const customPath = pathParts[0] === 'customAccent' || pathParts[0] === 'customSecondaryAccent';
          if (customPath && (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.trim()))) {
            throw new Error('Custom colors must use #RRGGBB.');
          }
          const hydratedCurrent: AppearanceSettings = {
            ...current,
            ...(pathParts[0] === 'customAccent'
              ? { customAccent: current.customAccent ?? { main: '#D5B261', hover: '#F3DDB0' } }
              : {}),
            ...(pathParts[0] === 'customSecondaryAccent'
              ? { customSecondaryAccent: current.customSecondaryAccent ?? { main: '#D5B261', hover: '#F3DDB0' } }
              : {}),
          };
          const next = mergeNestedValue(
            hydratedCurrent as unknown as Record<string, unknown>,
            pathParts,
            typeof value === 'string' && customPath ? value.trim().toUpperCase() : value,
          ) as unknown as AppearanceSettings;
          if (pathParts[0] === 'customAccent') next.accent = 'custom';
          if (pathParts[0] === 'customSecondaryAccent') next.secondaryAccent = 'custom';
          await this.request('/api/appearance', {
            method: 'PUT',
            body: JSON.stringify(next),
          });
          applyAppearanceSettings(next);
        } else if (settingId.startsWith('voice.')) {
          const pathParts = settingId.slice('voice.'.length).split('.').filter(Boolean);
          const currentResponse = await this.request<ApiEnvelope<VoiceSettings>>('/api/voice/settings');
          const current = unwrap(currentResponse, 'Voice settings');
          const next = mergeNestedValue(current as unknown as Record<string, unknown>, pathParts, value);
          await this.request('/api/voice/settings', {
            method: 'PUT',
            body: JSON.stringify(next),
          });
        } else if (
          settingId === 'welcome.suggestions.enabled' ||
          settingId.startsWith('welcome.suggestion.')
        ) {
          const response = await this.request<ApiEnvelope<DesktopUiSettings>>('/api/desktop-ui');
          const current = unwrap(response, 'Desktop UI settings');
          const welcome = {
            enabled: { ...current.welcome.enabled },
            suggestionPrompts: { ...current.welcome.suggestionPrompts },
          };
          if (settingId === 'welcome.suggestions.enabled') {
            welcome.enabled.suggestions = value === true;
          } else {
            const id = settingId.slice('welcome.suggestion.'.length);
            if (!id) throw new Error('Suggestion is required');
            welcome.suggestionPrompts[id] = String(value ?? '');
          }
          await this.request('/api/desktop-ui/welcome', {
            method: 'PUT',
            body: JSON.stringify(welcome),
          });
        } else if (settingId.startsWith('shortcuts.binding.')) {
          const shortcutId = settingId.slice('shortcuts.binding.'.length);
          const raw = String(value ?? '').trim();
          const keys = raw
            .split('+')
            .map((key) => key.trim())
            .filter(Boolean);
          if (!shortcutId || !keys.length || keys.length > 5) {
            throw new Error('Use a key binding such as Mod+Shift+K');
          }
          const response = await this.request<ApiEnvelope<DesktopUiSettings>>('/api/desktop-ui');
          const current = unwrap(response, 'Desktop UI settings');
          const shortcuts = current.shortcuts.map((shortcut) =>
            shortcut.id === shortcutId ? { ...shortcut, keys } : shortcut,
          );
          if (!shortcuts.some((shortcut) => shortcut.id === shortcutId)) {
            throw new Error('Shortcut is unavailable');
          }
          await this.request('/api/desktop-ui/shortcuts', {
            method: 'PUT',
            body: JSON.stringify(shortcuts),
          });
        } else if (settingId.startsWith('spend.') && !settingId.startsWith('spend.paused.')) {
          const pathParts = settingId.slice('spend.'.length).split('.').filter(Boolean);
          await this.request('/api/spend-caps/config', {
            method: 'PUT',
            body: JSON.stringify(nestedPatch(pathParts, value)),
          });
        } else if (settingId.startsWith('archived.title.')) {
          const archivedId = settingId.slice('archived.title.'.length);
          const title = String(value ?? '').trim();
          if (!archivedId || !title) throw new Error('Archived chat name is required');
          await this.request(`/api/sessions/${encodeURIComponent(archivedId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ title }),
          });
        } else if (settingId === 'mcp.add') {
          const source = String(value ?? '').trim();
          if (!source) throw new Error('Paste an MCP server JSON definition first');
          let definition: unknown;
          try {
            definition = JSON.parse(source);
          } catch {
            throw new Error('MCP server definition must be valid JSON');
          }
          if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
            throw new Error('MCP server definition must be a JSON object');
          }
          await this.request('/api/v1/mcp-servers', {
            method: 'POST',
            body: JSON.stringify(definition),
          }, 30_000);
        } else {
          throw new Error('This setting is not remotely editable');
        }
        invalidateExtendedSettings(this.target.baseUrl);
        return { accepted: true };
      }

      case 'setting.action': {
        const settingId = String(payload.settingId ?? '');
        const actionId = String(payload.actionId ?? '');
        if (settingId.startsWith('skills.revision|')) {
          const [, source, state, encodedName] = settingId.split('|');
          const name = decodeURIComponent(encodedName ?? '');
          if (!name || !['personal', 'project'].includes(source) || !['active', 'draft'].includes(state)) {
            throw new Error('Skill action is incomplete');
          }
          const endpoint = `/api/agent/skills/${encodeURIComponent(name)}`;
          if (actionId === 'test') {
            await this.request(`${endpoint}/test`, {
              method: 'POST',
              headers: scopedHeaders,
              body: JSON.stringify({ source, state }),
            }, 30_000);
          } else if (actionId === 'activate' && state === 'draft') {
            await this.request(`${endpoint}/activate`, {
              method: 'POST',
              headers: scopedHeaders,
              body: JSON.stringify({ source, actor: 'human' }),
            }, 30_000);
          } else {
            throw new Error(`Unsupported skill action: ${actionId}`);
          }
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'providers.refresh') {
          await this.request('/api/providers/status?refreshModels=1', {}, 60_000);
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'agent.reset') {
          await this.request('/api/agent/settings/reset', { method: 'POST', headers: scopedHeaders });
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'memory.reset') {
          await this.request('/api/memory/settings/reset', { method: 'POST' });
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'notesPermissions.reset') {
          await this.request('/api/notes/settings/agent-permissions/reset', { method: 'POST' });
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'appearance.reset') {
          const next: AppearanceSettings = {
            preset: 'kintsugi',
            accent: 'gold',
            secondaryAccent: 'gold',
            font: 'inter',
          };
          await this.request('/api/appearance', {
            method: 'PUT',
            body: JSON.stringify(next),
          });
          applyAppearanceSettings(next);
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'welcome.suggestions.reset') {
          await this.request('/api/desktop-ui/welcome/reset', { method: 'POST' });
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'welcome.walkthrough.replay') {
          await this.request('/api/desktop-ui/onboarding/replay', { method: 'POST' });
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'shortcuts.reset') {
          await this.request('/api/desktop-ui/shortcuts/reset', { method: 'POST' });
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId.startsWith('archived.title.')) {
          const archivedId = settingId.slice('archived.title.'.length);
          if (actionId === 'restore') {
            await this.request(`/api/sessions/${encodeURIComponent(archivedId)}/restore`, {
              method: 'POST',
            });
          } else if (actionId === 'delete') {
            await this.request(`/api/sessions/${encodeURIComponent(archivedId)}`, {
              method: 'DELETE',
            });
          } else {
            throw new Error(`Unsupported archived-chat action: ${actionId}`);
          }
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId.startsWith('mcp.server.')) {
          const serverName = settingId.slice('mcp.server.'.length);
          if (!serverName) throw new Error('MCP server is required');
          const endpoint = `/api/v1/mcp-servers/${encodeURIComponent(serverName)}`;
          if (actionId === 'test') {
            await this.request(`${endpoint}/test`, { method: 'POST' }, 30_000);
          } else if (actionId === 'reload') {
            await this.request(`${endpoint}/reload`, { method: 'POST' }, 30_000);
          } else if (actionId === 'remove') {
            await this.request(endpoint, { method: 'DELETE' }, 30_000);
          } else {
            throw new Error(`Unsupported MCP action: ${actionId}`);
          }
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'billing.refresh') {
          await this.request('/api/billing/credits?refresh=1', {}, 20_000);
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId.startsWith('spend.paused.') && actionId === 'resume') {
          const pausedId = settingId.slice('spend.paused.'.length);
          await this.request(`/api/spend-caps/sessions/${encodeURIComponent(pausedId)}/resume`, {
            method: 'POST',
          });
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        if (settingId === 'teams.host') {
          if (!sessionId) throw new Error('Select a chat before starting team access');
          await this.request('/api/collab/host/start', {
            method: 'POST',
            body: JSON.stringify({ sessionId }),
          }, 30_000);
          invalidateExtendedSettings(this.target.baseUrl);
          return { accepted: true };
        }
        throw new Error('This action is not available remotely yet');
      }

      default:
        throw new Error(`Unsupported remote command: ${command.name}`);
    }
  }

  async inspect<T = unknown>(
    name: string,
    payload: Record<string, unknown> = {},
    activeSessionId?: string,
    activeProjectId?: string,
  ): Promise<T> {
    const sessionId = String(payload.sessionId ?? activeSessionId ?? '');
    const projectId = String(payload.projectId ?? activeProjectId ?? '');
    const scopedHeaders: Record<string, string> = {};
    if (sessionId) scopedHeaders['x-koryphaios-session'] = sessionId;
    if (projectId) scopedHeaders['x-koryphaios-project'] = projectId;

    if (name === 'devices.inspect') {
      const response = await this.request<ApiEnvelope<DeviceNetworkInspection>>('/api/devices/');
      return unwrap(response, 'Linked devices') as T;
    }

    if (name === 'workspace.inspect') {
      const response = await this.request<ApiEnvelope<WorkspaceNavigationState>>(
        '/api/workspace/state',
      );
      return unwrap(response, 'Workspace') as T;
    }

    if (name === 'workspace.files') {
      const query = String(payload.query ?? '').trim();
      const response = await this.request<ApiEnvelope<string[]>>(
        `/api/workspace/files${query ? `?q=${encodeURIComponent(query)}` : ''}`,
        { headers: scopedHeaders },
        30_000,
      );
      return {
        files: response.data ?? [],
        query,
      } satisfies WorkspaceFilesInspection as T;
    }

    if (name === 'workspace.directories') {
      const path = String(payload.path ?? '').trim();
      const response = await this.request<ApiEnvelope<HostDirectoryInspection>>(
        `/api/workspace/directories${path ? `?path=${encodeURIComponent(path)}` : ''}`,
      );
      return unwrap(response, 'Host folders') as T;
    }

    if (name === 'agent.thread') {
      const targetSessionId = String(payload.sessionId ?? sessionId).trim();
      const agentId = String(payload.agentId ?? '').trim();
      if (!targetSessionId || !agentId) throw new Error('A chat and agent are required');
      const response = await this.request<ApiEnvelope<AgentThreadEntry[]>>(
        `/api/agent/${encodeURIComponent(agentId)}/thread?sessionId=${encodeURIComponent(targetSessionId)}`,
        { headers: scopedHeaders },
      );
      return (response.data ?? []) as T;
    }

    if (name === 'agent.messages') {
      const targetSessionId = String(payload.sessionId ?? sessionId).trim();
      if (!targetSessionId) throw new Error('A chat is required');
      const response = await this.request<ApiEnvelope<{ messages?: AgentMessage[] }>>(
        `/api/v1/agent-messages?sessionId=${encodeURIComponent(targetSessionId)}`,
        { headers: scopedHeaders },
      );
      return (response.data?.messages ?? []) as T;
    }

    if (name === 'agent.preferences.inspect') {
      const response = await this.request<ApiEnvelope<AgentPreferencesInspection>>(
        '/api/agent/preferences',
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Agent preferences') as T;
    }

    if (name === 'response_style.inspect') {
      const response = await this.request<ApiEnvelope<ResponseStyleInspection>>(
        '/api/agent/response-style',
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Response style') as T;
    }

    if (name === 'model_sharing.inspect') {
      const [sharedResponse, sharingResponse, remoteResponse, sandboxResponse] = await Promise.all([
        this.request<ApiEnvelope<Pick<ModelSharingInspection, 'shared' | 'sharedModels' | 'candidates'>>>(
          '/api/collab/providers/shared',
          { headers: scopedHeaders },
        ),
        this.request<ApiEnvelope<ModelSharingInspection['sharing']>>(
          '/api/collab/providers/sharing',
          { headers: scopedHeaders },
        ),
        this.request<ApiEnvelope<ModelSharingInspection['remote']>>(
          '/api/collab/providers/remote-status',
          { headers: scopedHeaders },
        ),
        this.request<ApiEnvelope<ModelSharingInspection['sandbox']>>(
          '/api/collab/providers/sandbox',
          { headers: scopedHeaders },
        ),
      ]);
      return {
        shared: sharedResponse.data?.shared ?? [],
        sharedModels: sharedResponse.data?.sharedModels ?? {},
        candidates: sharedResponse.data?.candidates ?? [],
        sharing: sharingResponse.data ?? { active: false },
        remote: remoteResponse.data ?? null,
        sandbox: sandboxResponse.data ?? null,
      } satisfies ModelSharingInspection as T;
    }

    if (name === 'context.model_preview') {
      const targetSessionId = String(payload.sessionId ?? sessionId);
      const model = String(payload.model ?? '').trim();
      const provider = String(payload.provider ?? '').trim();
      const contextWindow = Number(payload.contextWindow);
      if (!targetSessionId || !model || !provider) {
        throw new Error('A chat, provider and model are required');
      }
      const response = await this.request<{
        ok?: boolean;
        usage?: {
          provider?: string;
          model?: string;
          used?: number;
          contextWindow?: number;
          contextKnown?: boolean;
          contextSource?: 'live' | 'catalog' | 'alias';
          usageKnown?: boolean;
          cachedInputTokens?: number;
          breakdown?: ContextBreakdown;
        };
        error?: string;
      }>(
        `/api/sessions/${encodeURIComponent(targetSessionId)}/context/model-preview`,
        {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            model,
            provider,
            ...(Number.isFinite(contextWindow) && contextWindow > 0 ? { contextWindow } : {}),
          }),
        },
      );
      if (!response.usage) throw new Error(response.error || 'Context preview unavailable');
      return response.usage as T;
    }

    if (name === 'skills.inspect') {
      const [skillsResponse, healthResponse, bundledResponse] = await Promise.all([
        this.request<ApiEnvelope<SkillRevision[]>>('/api/agent/skills', {
          headers: scopedHeaders,
        }),
        this.request<ApiEnvelope<SkillWorkspaceInspection['health']>>('/api/agent/skills/health', {
          headers: scopedHeaders,
        }).catch(() => ({ ok: true, data: undefined })),
        this.request<ApiEnvelope<{ count?: number }>>('/api/agent/skills/bundled-updates/count', {
          headers: scopedHeaders,
        }).catch(() => ({ ok: true, data: { count: 0 } })),
      ]);
      return {
        skills: skillsResponse.data ?? [],
        health: healthResponse.data,
        bundledUpdateCount: Math.max(0, Number(bundledResponse.data?.count ?? 0)),
      } satisfies SkillWorkspaceInspection as T;
    }

    if (name === 'skills.evaluation') {
      const skillName = String(payload.name ?? '').trim();
      const source = String(payload.source ?? '');
      const state = String(payload.state ?? '');
      const baselineHash = String(payload.baselineHash ?? '').trim();
      if (
        !skillName ||
        !['personal', 'project'].includes(source) ||
        !['active', 'draft'].includes(state)
      ) {
        throw new Error('Skill evaluation request is incomplete');
      }
      const params = new URLSearchParams({ source, state });
      if (baselineHash) params.set('baselineHash', baselineHash);
      const response = await this.request<ApiEnvelope<SkillEvaluationCard>>(
        '/api/agent/skills/' +
          encodeURIComponent(skillName) +
          '/evaluation-card?' +
          params.toString(),
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Skill evaluation') as T;
    }

    if (name === 'skills.qualifications') {
      const response = await this.request<ApiEnvelope<HarnessQualificationRecord[]>>(
        '/api/agent/skills/qualifications',
        { headers: scopedHeaders },
      );
      return (response.data ?? []) as T;
    }

    if (name === 'skills.compare') {
      const skillName = String(payload.name ?? '').trim();
      const source = String(payload.source ?? '');
      if (!skillName || !['personal', 'project'].includes(source)) throw new Error('Skill is required');
      const response = await this.request<ApiEnvelope<SkillRevisionComparison>>(
        `/api/agent/skills/${encodeURIComponent(skillName)}/compare?source=${encodeURIComponent(source)}`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Skill comparison') as T;
    }

    if (name === 'skills.compare_bundled') {
      const skillName = String(payload.name ?? '').trim();
      if (!skillName) throw new Error('Skill is required');
      const response = await this.request<ApiEnvelope<BundledSkillComparison>>(
        `/api/agent/skills/${encodeURIComponent(skillName)}/compare-bundled`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Bundled skill comparison') as T;
    }

    if (name === 'skills.resolve') {
      const prompt = String(payload.prompt ?? '').trim();
      if (!prompt) throw new Error('Routing test prompt is required');
      const collisionChoices =
        payload.collisionChoices &&
        typeof payload.collisionChoices === 'object' &&
        !Array.isArray(payload.collisionChoices)
          ? payload.collisionChoices
          : {};
      const response = await this.request<ApiEnvelope<SkillResolutionPreview>>(
        '/api/agent/skills/resolve',
        {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ prompt, options: { collisionChoices } }),
        },
        30_000,
      );
      return unwrap(response, 'Skill routing test') as T;
    }

    if (name === 'skills.convert_preview') {
      const skillName = String(payload.name ?? '').trim();
      const source = String(payload.source ?? '');
      const state = String(payload.state ?? '');
      const expectedHash = String(payload.expectedHash ?? '');
      const document =
        payload.document && typeof payload.document === 'object' && !Array.isArray(payload.document)
          ? payload.document
          : null;
      if (
        !skillName ||
        !['personal', 'project'].includes(source) ||
        !['active', 'draft'].includes(state) ||
        !expectedHash ||
        !document
      ) {
        throw new Error('Skill conversion preview is incomplete');
      }
      const response = await this.request<ApiEnvelope<SkillConversionPreview>>(
        `/api/agent/skills/${encodeURIComponent(skillName)}/convert`,
        {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            source,
            state,
            expectedHash,
            document,
            dryRun: true,
          }),
        },
        30_000,
      );
      return unwrap(response, 'Skill conversion preview') as T;
    }

    if (name === 'native_commands.inspect') {
      const provider = String(payload.provider ?? '').trim();
      if (!provider) throw new Error('Provider is required');
      const response = await this.request<ApiEnvelope<NativeCommandInspection>>(
        `/api/native-commands?provider=${encodeURIComponent(provider)}`,
        { headers: scopedHeaders },
      );
      return (response.data ?? { provider, label: null, commands: [] }) as T;
    }

    if (name === 'process.inspect') {
      const processId = String(payload.processId ?? '');
      if (!processId) throw new Error('Process is required');
      const encoded = encodeURIComponent(processId);
      const [processResponse, logsResponse, eventsResponse] = await Promise.all([
        this.request<{ ok?: boolean; process?: Record<string, unknown> }>(`/api/processes/${encoded}`),
        this.request<{ ok?: boolean; logs?: ProcessInspection['logs'] }>(
          `/api/processes/${encoded}/logs?lines=${encodeURIComponent(String(payload.lines ?? 200))}`,
        ),
        this.request<{ ok?: boolean; events?: ProcessInspection['events'] }>(
          `/api/processes/${encoded}/events?limit=50`,
        ),
      ]);
      return {
        processId,
        process: processResponse.process,
        logs: logsResponse.logs ?? { stdout: '', stderr: '' },
        events: eventsResponse.events ?? [],
      } as T;
    }

    if (name === 'git.inspect_file') {
      const file = String(payload.file ?? '');
      const staged = Boolean(payload.staged);
      if (!file) throw new Error('Git file is required');
      const query = `file=${encodeURIComponent(file)}&staged=${staged ? 'true' : 'false'}`;
      const diffResponse = await this.request<ApiEnvelope<{ diff?: string }>>(`/api/git/diff?${query}`, {
        headers: scopedHeaders,
      });
      const diff = diffResponse.data?.diff ?? '';
      let content: string | null | undefined;
      if (!diff) {
        const fileResponse = await this.request<ApiEnvelope<{ content?: string | null }>>(
          `/api/git/file?path=${encodeURIComponent(file)}`,
          { headers: scopedHeaders },
        );
        content = fileResponse.data?.content;
      }
      return { file, staged, diff: diff || undefined, content } satisfies GitInspection as T;
    }

    if (name === 'git.chat') {
      if (!sessionId) throw new Error('Open a chat before inspecting its Git revision');
      const response = await this.request<ApiEnvelope<ChatGitState>>('/api/git/chat', {
        headers: scopedHeaders,
      }, 60_000);
      return unwrap(response, 'Chat Git') as T;
    }

    if (name === 'git.chat_commit') {
      if (!sessionId) throw new Error('Open a chat before inspecting commit history');
      const ref = String(payload.ref ?? '').trim();
      const source = payload.source === true ? 'source' : 'chat';
      if (!ref) throw new Error('A commit is required');
      const response = await this.request<ApiEnvelope<ChatGitDetails>>(
        `/api/git/chat/commit?ref=${encodeURIComponent(ref)}&source=${source}`,
        { headers: scopedHeaders },
        60_000,
      );
      return unwrap(response, 'Commit details') as T;
    }

    if (name === 'git.chat_prs') {
      if (!sessionId) throw new Error('Open a chat before loading pull requests');
      const response = await this.request<ApiEnvelope<ChatPullRequest[]>>(
        '/api/git/chat/pull-requests',
        { headers: scopedHeaders },
        60_000,
      );
      return (response.data ?? []) as T;
    }

    if (name === 'git.chat_pr') {
      if (!sessionId) throw new Error('Open a chat before loading a pull request');
      const number = Number(payload.number);
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('A pull request number is required');
      const response = await this.request<ApiEnvelope<ChatPullRequest>>(
        `/api/git/chat/pull-requests/${number}`,
        { headers: scopedHeaders },
        60_000,
      );
      return unwrap(response, 'Pull request') as T;
    }

    if (name === 'providers.inspect') {
      const [statusResponse, cliResponse, detectResponse] = await Promise.all([
        this.request<ApiEnvelope<RemoteProviderStatus[]>>('/api/providers/status'),
        this.request<ApiEnvelope<ProviderAccount[]> & { selectionRequired?: string[] }>(
          '/api/providers/cli-accounts',
        ).catch(() => ({ data: [] as ProviderAccount[], selectionRequired: [] })),
        this.request<ApiEnvelope<Record<string, unknown>[]>>('/api/providers/detect').catch(
          () => ({ data: [] as Record<string, unknown>[] }),
        ),
      ]);
      const statuses = statusResponse.data ?? [];
      const providers = await Promise.all(
        statuses
          .filter((status): status is RemoteProviderStatus & { name: string } => Boolean(status.name))
          .map(async (status): Promise<ProviderRemoteStatus> => {
            const name = status.name;
            const accountResponse = await this.request<
              ApiEnvelope<ProviderAccount[]> & {
                fallbackOrder?: string[];
                fallbackEnabled?: boolean;
              }
            >(`/api/providers/${encodeURIComponent(name)}/accounts`).catch(() => ({
              data: [] as ProviderAccount[],
              fallbackOrder: [],
              fallbackEnabled: false,
            }));
            const awsCredentialScan = name === 'bedrock'
              ? await this.request<ApiEnvelope<ProviderRemoteStatus['awsCredentialScan']>>(
                  `/api/providers/${encodeURIComponent(name)}/credentials/scan`,
                ).then((response) => response.data).catch(() => undefined)
              : undefined;
            const authMode =
              typeof status.authMode === 'string' ? status.authMode : status.authMode?.id ?? 'api_key';
            return {
              name,
              label: status.label || humanize(name),
              enabled: status.enabled === true,
              authenticated: status.authenticated === true,
              adapterAvailable: status.adapterAvailable === true,
              credentialDetected: status.credentialDetected === true,
              connectionState: (
                status.connectionState ?? (status.authenticated ? 'verified' : 'not_configured')
              ) as ProviderRemoteStatus['connectionState'],
              verificationError: status.verificationError,
              authSource: status.authSource,
              authMode,
              supportsApiKey: status.supportsApiKey === true,
              supportsAuthToken: status.supportsAuthToken === true,
              requiresBaseUrl: status.requiresBaseUrl === true,
              requiresDeployment: status.requiresDeployment === true,
              baseUrlPlaceholder: status.baseUrlPlaceholder,
              models: status.models ?? [],
              selectedModels: status.selectedModels ?? [],
              allAvailableModels: (status.allAvailableModels ?? []).map((model) => ({
                id: model.id,
                name: model.name,
              })),
              description: status.description,
              deployment: status.deployment,
              custom: status.custom === true || name.startsWith('custom-'),
              accounts: accountResponse.data ?? [],
              fallbackOrder: accountResponse.fallbackOrder ?? [],
              fallbackEnabled: accountResponse.fallbackEnabled === true,
              awsCredentialScan,
            };
          }),
      );
      return {
        providers,
        detected: detectResponse.data ?? [],
        cliAccounts: cliResponse.data ?? [],
        selectionRequired: cliResponse.selectionRequired ?? [],
      } satisfies ProvidersInspection as T;
    }

    if (name === 'workflows.inspect') {
      if (!sessionId) throw new Error('Select a chat before opening workflows');
      const response = await this.request<ApiEnvelope<WorkflowsInspection>>(
        `/api/agent/workflows?sessionId=${encodeURIComponent(sessionId)}`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Workflows') as T;
    }

    if (name === 'memory.inspect') {
      const readMemory = async (
        endpoint: string,
        scope: MemoryDocument['scope'],
      ): Promise<MemoryDocument | null> => {
        try {
          const response = await this.request<ApiEnvelope<Omit<MemoryDocument, 'scope'>>>(endpoint, {
            headers: scopedHeaders,
          });
          return response.data ? { ...response.data, scope } : null;
        } catch {
          return null;
        }
      };
      const [universal, project, rules, session, documentsResponse, settingsResponse, externalProvidersResponse] = await Promise.all([
        readMemory('/api/memory/universal', 'universal'),
        readMemory('/api/memory/project', 'project'),
        readMemory('/api/memory/rules', 'rules'),
        sessionId
          ? readMemory(`/api/memory/sessions/${encodeURIComponent(sessionId)}`, 'session')
          : Promise.resolve(null),
        this.request<
          ApiEnvelope<(Omit<MemoryDocument, 'scope'> & { kind?: 'memory' | 'rules'; name?: string })[]>
        >('/api/memory/documents', { headers: scopedHeaders }).catch(() => ({ data: [] })),
        this.request<ApiEnvelope<MemoryInspection['settings']>>('/api/memory/settings', {
          headers: scopedHeaders,
        }).catch(() => ({ data: undefined })),
        this.request<ApiEnvelope<MemoryInspection['externalProviders']>>(
          '/api/memory/external/providers',
          { headers: scopedHeaders },
        ).catch(() => ({ data: [] as MemoryInspection['externalProviders'] })),
      ]);
      const custom = (documentsResponse.data ?? []).map((document) => ({
        ...document,
        scope: 'document' as const,
        documentKind: document.kind === 'rules' ? 'rules' as const : 'memory' as const,
      }));
      return {
        documents: [universal, project, session, rules, ...custom].filter(
          (document): document is MemoryDocument => Boolean(document),
        ),
        settings: settingsResponse.data,
        externalProviders: externalProvidersResponse.data ?? [],
      } satisfies MemoryInspection as T;
    }

    if (name === 'memory.read') {
      const scope = String(payload.scope ?? '');
      let endpoint = '';
      if (scope === 'universal') endpoint = '/api/memory/universal';
      else if (scope === 'project') endpoint = '/api/memory/project';
      else if (scope === 'rules') endpoint = '/api/memory/rules';
      else if (scope === 'session') {
        const targetSessionId = String(payload.sessionId ?? sessionId);
        if (!targetSessionId) throw new Error('A chat is required');
        endpoint = `/api/memory/sessions/${encodeURIComponent(targetSessionId)}`;
      } else if (scope === 'document') {
        const documentKind = payload.documentKind === 'rules' ? 'rules' : 'memory';
        const nameValue = String(payload.name ?? '').trim();
        if (!nameValue) throw new Error('A memory document is required');
        endpoint = `/api/memory/documents/${documentKind}/${encodeURIComponent(nameValue)}`;
      } else {
        throw new Error('Memory scope is required');
      }
      const response = await this.request<ApiEnvelope<Omit<MemoryDocument, 'scope'>>>(endpoint, {
        headers: scopedHeaders,
      });
      const document = unwrap(response, 'Memory document');
      return {
        ...document,
        scope: scope as MemoryDocument['scope'],
        ...(scope === 'document'
          ? {
              documentKind: payload.documentKind === 'rules' ? 'rules' as const : 'memory' as const,
              name: String(payload.name ?? ''),
            }
          : {}),
      } as T;
    }

    if (name === 'notes.inspect') {
      const search = String(payload.search ?? '').trim();
      const endpoint = search
        ? `/api/notes/search?q=${encodeURIComponent(search)}`
        : '/api/notes/';
      const response = await this.request<ApiEnvelope<RemoteNote[]>>(endpoint, {
        headers: scopedHeaders,
      });
      return { notes: response.data ?? [] } satisfies NotesInspection as T;
    }

    if (name === 'notes.read') {
      const noteId = String(payload.noteId ?? '').trim();
      if (!noteId) throw new Error('A note is required');
      const response = await this.request<ApiEnvelope<RemoteNote>>(
        `/api/notes/${encodeURIComponent(noteId)}`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Note') as T;
    }

    if (name === 'notes.folders') {
      const response = await this.request<ApiEnvelope<NoteFolderNode[] | NoteFolderNode>>(
        '/api/notes/folders',
        { headers: scopedHeaders },
      );
      return (response.data ?? []) as T;
    }

    if (name === 'notes.trash') {
      const response = await this.request<ApiEnvelope<RemoteNote[]>>('/api/notes/trash', {
        headers: scopedHeaders,
      });
      return (response.data ?? []) as T;
    }

    if (name === 'notes.revisions') {
      const noteId = String(payload.noteId ?? '').trim();
      if (!noteId) throw new Error('A note is required');
      const response = await this.request<ApiEnvelope<NoteRevisionSummary[]>>(
        `/api/notes/${encodeURIComponent(noteId)}/revisions`,
        { headers: scopedHeaders },
      );
      return (response.data ?? []) as T;
    }

    if (name === 'notes.revision') {
      const noteId = String(payload.noteId ?? '').trim();
      const revision = Number(payload.revision);
      if (!noteId || !Number.isSafeInteger(revision) || revision < 1) {
        throw new Error('A note and valid revision are required');
      }
      const response = await this.request<ApiEnvelope<RemoteNote>>(
        `/api/notes/${encodeURIComponent(noteId)}/revisions/${revision}`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Note revision') as T;
    }

    if (name === 'notes.appearances') {
      const noteId = String(payload.noteId ?? '').trim();
      if (!noteId) throw new Error('A note is required');
      const response = await this.request<ApiEnvelope<NoteAppearances>>(
        `/api/notes/${encodeURIComponent(noteId)}/appearances`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Note appearances') as T;
    }

    if (name === 'notes.graph') {
      const response = await this.request<ApiEnvelope<NoteGraphData>>('/api/notes/graph', {
        headers: scopedHeaders,
      });
      return unwrap(response, 'Notes graph') as T;
    }

    if (name === 'notes.bases') {
      const response = await this.request<ApiEnvelope<NoteBase[]>>(
        '/api/notes/bases?includeTrashed=true',
        { headers: scopedHeaders },
      );
      return (response.data ?? []) as T;
    }

    if (name === 'notes.base_query') {
      const baseId = String(payload.baseId ?? '').trim();
      if (!baseId) throw new Error('A Base is required');
      const response = await this.request<ApiEnvelope<NoteBaseQueryResult>>(
        `/api/notes/bases/${encodeURIComponent(baseId)}/query`,
        {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            limit: Number(payload.limit ?? 100),
            offset: Number(payload.offset ?? 0),
          }),
        },
      );
      return unwrap(response, 'Base query') as T;
    }

    if (name === 'notes.drafts') {
      const response = await this.request<ApiEnvelope<NoteDraftSummary[]> & { success?: boolean }>('/api/notes/drafts', {
        headers: scopedHeaders,
      });
      // Missing or malformed list data cannot establish that a recovery draft
      // was removed on the host. Fail closed in both direct and linked modes.
      if (response.success !== true || !Array.isArray(response.data)) {
        throw new Error('The desktop returned an invalid Notes draft list; draft removal is unconfirmed.');
      }
      return response.data as T;
    }

    if (name === 'notes.draft') {
      const draftId = String(payload.draftId ?? '').trim();
      if (!draftId) throw new Error('A recovery draft is required');
      const response = await this.request<ApiEnvelope<NoteDraft>>(
        `/api/notes/drafts/${encodeURIComponent(draftId)}`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Recovery draft') as T;
    }

    if (name === 'note.export') {
      const noteId = String(payload.noteId ?? '').trim();
      if (!noteId) throw new Error('A note is required');
      return await this.requestText(
        `/api/notes/${encodeURIComponent(noteId)}/export`,
        { headers: scopedHeaders },
        20_000,
      ) as T;
    }

    if (name === 'notes.vault_export') {
      return await this.requestBinary('/api/notes/export', { headers: scopedHeaders }, 60_000) as T;
    }

    if (name === 'note.attachment_download') {
      const attachmentId = String(payload.attachmentId ?? '').trim();
      if (!attachmentId) throw new Error('An attachment is required');
      return await this.requestBinary(
        `/api/notes/attachments/${encodeURIComponent(attachmentId)}`,
        { headers: scopedHeaders },
        30_000,
      ) as T;
    }

    if (name === 'notes.settings') {
      const response = await this.request<ApiEnvelope<NotesSettings>>('/api/notes/settings', {
        headers: scopedHeaders,
      });
      return unwrap(response, 'Notes settings') as T;
    }

    if (name === 'notes.relationships') {
      const params = new URLSearchParams();
      const noteId = String(payload.noteId ?? '').trim();
      const status = String(payload.status ?? '').trim();
      if (noteId) params.set('noteId', noteId);
      if (['proposed', 'accepted', 'rejected'].includes(status)) params.set('status', status);
      params.set('limit', String(Math.max(1, Math.min(200, Number(payload.limit ?? 100)))));
      params.set('offset', String(Math.max(0, Number(payload.offset ?? 0))));
      const response = await this.request<
        ApiEnvelope<NoteRelationship[]> & { success?: boolean }
      >(`/api/notes/relationships?${params.toString()}`, {
        headers: scopedHeaders,
      });
      if (response.success !== true || !Array.isArray(response.data)) {
        throw new Error('The desktop returned an invalid Notes relationship list; review is unconfirmed.');
      }
      return response.data as T;
    }

    if (name === 'notes.property_schemas') {
      const response = await this.request<ApiEnvelope<NotePropertySchema[]>>(
        '/api/notes/properties/schemas',
        { headers: scopedHeaders },
      );
      return (response.data ?? []) as T;
    }

    if (name === 'notes.properties') {
      const noteId = String(payload.noteId ?? '').trim();
      if (!noteId) throw new Error('A note is required');
      const response = await this.request<ApiEnvelope<NotePropertiesSnapshot>>(
        `/api/notes/${encodeURIComponent(noteId)}/properties`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Note properties') as T;
    }

    if (name === 'notes.context_query') {
      const query = String(payload.query ?? '').trim();
      if (!query) throw new Error('A Notes retrieval query is required');
      const response = await this.request<ApiEnvelope<NoteContextActivation> & { success?: boolean }>(
        '/api/notes/context',
        {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({
            query,
            semantic: payload.semantic === true,
            maxHops: Math.max(0, Math.min(2, Number(payload.maxHops ?? 1))),
            maxChars: Math.max(256, Math.min(16_000, Number(payload.maxChars ?? 6000))),
            limit: Math.max(1, Math.min(12, Number(payload.limit ?? 6))),
            excerptChars: Math.max(128, Math.min(2000, Number(payload.excerptChars ?? 1000))),
          }),
        },
        60_000,
      );
      return unwrap(response, 'Notes context query') as T;
    }

    if (name === 'notes.semantic_index') {
      const response = await this.request<ApiEnvelope<NoteSemanticIndexStatus> & { success?: boolean }>(
        '/api/notes/semantic-index',
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Notes semantic index') as T;
    }

    if (name === 'collab.inspect') {
      if (!sessionId) {
        return { host: null, prompts: [], joins: [], participants: [] } satisfies CollaborationInspection as T;
      }
      const activeResponse = await this.request<ApiEnvelope<CollaborationHost | null>>(
        `/api/collab/active?baseSessionId=${encodeURIComponent(sessionId)}`,
        { headers: scopedHeaders },
        30_000,
      );
      const host = activeResponse.data ?? null;
      if (!host) {
        return { host: null, prompts: [], joins: [], participants: [] } satisfies CollaborationInspection as T;
      }
      const pendingResponse = await this.request<
        ApiEnvelope<Pick<CollaborationInspection, 'prompts' | 'joins' | 'participants'>>
      >(`/api/collab/${encodeURIComponent(host.id)}/pending`, {
        headers: scopedHeaders,
      }).catch(() => ({ data: { prompts: [], joins: [], participants: [] } }));
      return {
        host,
        prompts: pendingResponse.data?.prompts ?? [],
        joins: pendingResponse.data?.joins ?? [],
        participants: pendingResponse.data?.participants ?? [],
      } satisfies CollaborationInspection as T;
    }

    if (name === 'mcp.inspect') {
      const [serversResponse, featuredResponse] = await Promise.all([
        this.request<ApiEnvelope<McpServerStatus[]>>('/api/v1/mcp-servers', {
          headers: scopedHeaders,
        }),
        this.request<ApiEnvelope<McpRegistryEntry[]>>('/api/v1/mcp-registry/featured', {
          headers: scopedHeaders,
        }).catch(() => ({ data: [] as McpRegistryEntry[] })),
      ]);
      return {
        servers: serversResponse.data ?? [],
        featured: featuredResponse.data ?? [],
      } satisfies McpInspection as T;
    }

    if (name === 'mcp.search') {
      const query = String(payload.query ?? '').trim();
      const cursor = String(payload.cursor ?? '').trim();
      if (!query) return { results: [], nextCursor: null } as T;
      const params = new URLSearchParams({ q: query, limit: '20' });
      if (cursor) params.set('cursor', cursor);
      const response = await this.request<
        ApiEnvelope<{ results: McpRegistryEntry[]; nextCursor: string | null }>
      >(`/api/v1/mcp-registry/search?${params.toString()}`, {
        headers: scopedHeaders,
      }, 30_000);
      return (response.data ?? { results: [], nextCursor: null }) as T;
    }

    if (name === 'mcp.env_keys') {
      const serverName = String(payload.name ?? '').trim();
      if (!serverName) throw new Error('MCP server is required');
      const response = await this.request<
        ApiEnvelope<{ keys: string[]; valuesMasked: true }>
      >(`/api/v1/mcp-servers/${encodeURIComponent(serverName)}/env`, {
        headers: scopedHeaders,
      });
      return (response.data ?? { keys: [], valuesMasked: true }) as T;
    }

    if (name === 'media.inspect') {
      const [imageProviders, videoProviders, imageHistory, videoHistory] = await Promise.all([
        this.request<ApiEnvelope<MediaProvider[]>>('/api/images/providers', { headers: scopedHeaders })
          .catch(() => ({ data: [] as MediaProvider[] })),
        this.request<ApiEnvelope<MediaProvider[]>>('/api/video/providers', { headers: scopedHeaders })
          .catch(() => ({ data: [] as MediaProvider[] })),
        this.request<ApiEnvelope<MediaHistoryItem[]>>('/api/images/history?limit=24', {
          headers: scopedHeaders,
        }).catch(() => ({ data: [] as MediaHistoryItem[] })),
        this.request<ApiEnvelope<MediaHistoryItem[]>>('/api/video/history?limit=24', {
          headers: scopedHeaders,
        }).catch(() => ({ data: [] as MediaHistoryItem[] })),
      ]);
      return {
        imageProviders: imageProviders.data ?? [],
        videoProviders: videoProviders.data ?? [],
        imageHistory: imageHistory.data ?? [],
        videoHistory: videoHistory.data ?? [],
      } satisfies MediaInspection as T;
    }

    if (name === 'media.history') {
      const historyId = String(payload.id ?? '').trim();
      const kind = payload.kind === 'video' ? 'video' : 'images';
      if (!historyId) throw new Error('A media history item is required');
      const response = await this.request<ApiEnvelope<MediaHistoryItem>>(
        `/api/${kind}/history/${encodeURIComponent(historyId)}`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Media history') as T;
    }

    if (name === 'billing.inspect') {
      const excludedProviders = Array.isArray(payload.excludedProviders)
        ? payload.excludedProviders.map((provider) => String(provider).trim().toLowerCase()).filter(Boolean)
        : [];
      const billingParams = new URLSearchParams();
      for (const provider of excludedProviders) billingParams.append('excludeProvider', provider);
      const billingQuery = billingParams.toString();
      const querySuffix = billingQuery ? `&${billingQuery}` : '';
      const billingSuffix = billingQuery ? `?${billingQuery}` : '';
      const [usageResponse, dailyResponse, sessionsResponse, creditsResponse] = await Promise.all([
        this.request<ApiEnvelope<BillingInspection['usage']>>(`/api/usage?limit=25${querySuffix}`, { headers: scopedHeaders }),
        this.request<ApiEnvelope<BillingInspection['daily']>>(`/api/usage/daily?days=30${querySuffix}`, { headers: scopedHeaders })
          .catch(() => ({ data: [] as BillingInspection['daily'] })),
        this.request<{ ok?: boolean; sessions?: BillingInspection['sessions'] }>(`/api/billing/session-costs${billingSuffix}`, {
          headers: scopedHeaders,
        }),
        this.request<BillingInspection['credits'] & { ok?: boolean }>(
          `/api/billing/credits${billingQuery ? `?${billingQuery}` : ''}`,
          { headers: scopedHeaders },
          20_000,
        ),
      ]);
      return {
        usage: usageResponse.data ?? { entries: [], totals: { totalCount: 0, byKind: {} } },
        daily: dailyResponse.data ?? [],
        sessions: sessionsResponse.sessions ?? {},
        credits: {
          totalSpendUsd: creditsResponse.totalSpendUsd ?? 0,
          totalSpendCents: creditsResponse.totalSpendCents ?? 0,
          hasKnownSpend: creditsResponse.hasKnownSpend ?? false,
          pricingIncomplete: creditsResponse.pricingIncomplete ?? false,
          remainingCents: creditsResponse.remainingCents ?? null,
          balanceProviders: creditsResponse.balanceProviders ?? [],
          availableBillingProviders: creditsResponse.availableBillingProviders ?? [],
          refreshing: creditsResponse.refreshing,
        },
      } satisfies BillingInspection as T;
    }

    if (name === 'billing.session') {
      const targetSessionId = String(payload.sessionId ?? sessionId).trim();
      if (!targetSessionId) throw new Error('A chat is required');
      const excludedProviders = Array.isArray(payload.excludedProviders)
        ? payload.excludedProviders.map((provider) => String(provider).trim().toLowerCase()).filter(Boolean)
        : [];
      const billingParams = new URLSearchParams();
      for (const provider of excludedProviders) billingParams.append('excludeProvider', provider);
      const billingQuery = billingParams.toString();
      const response = await this.request<{ ok?: boolean; summary?: BillingSessionCostSummary | null }>(
        `/api/billing/session/${encodeURIComponent(targetSessionId)}${billingQuery ? `?${billingQuery}` : ''}`,
        { headers: scopedHeaders },
      );
      return (response.summary ?? null) as T;
    }

    if (name === 'billing.usage_export') {
      const excludedProviders = Array.isArray(payload.excludedProviders)
        ? payload.excludedProviders.map((provider) => String(provider).trim().toLowerCase()).filter(Boolean)
        : [];
      const billingParams = new URLSearchParams();
      for (const provider of excludedProviders) billingParams.append('excludeProvider', provider);
      const billingQuery = billingParams.toString();
      return await this.requestText(
        `/api/usage/export${billingQuery ? `?${billingQuery}` : ''}`,
        { headers: scopedHeaders },
        20_000,
      ) as T;
    }

    if (name === 'timetravel.inspect') {
      if (!sessionId) throw new Error('Select a chat before opening Time Travel');
      const response = await this.request<ApiEnvelope<TimeTravelState>>(
        `/api/sessions/${encodeURIComponent(sessionId)}/timetravel`,
        { headers: scopedHeaders },
      );
      return unwrap(response, 'Time Travel') as T;
    }

    if (name === 'timetravel.preview') {
      if (!sessionId) throw new Error('Select a chat before previewing a rewind');
      const hash = String(payload.hash ?? '');
      if (!hash) throw new Error('Recorded state is required');
      const response = await this.request<ApiEnvelope<RewindPreview>>(
        `/api/sessions/${encodeURIComponent(sessionId)}/rewind/preview`,
        {
          method: 'POST',
          headers: scopedHeaders,
          body: JSON.stringify({ hash }),
        },
        30_000,
      );
      if (!response.data) throw new Error(response.message || response.error || 'Rewind preview unavailable');
      return response.data as T;
    }

    if (name === 'computer.inspect') {
      const includeApps = payload.discover === true;
      const [settingsResponse, statusResponse, appsResponse] = await Promise.all([
        this.request<ApiEnvelope<Record<string, unknown>>>('/api/agent/settings', {
          headers: scopedHeaders,
        }),
        this.request<ApiEnvelope<ComputerUseInspection['status']>>('/api/v1/computer-use/status', {
          headers: scopedHeaders,
        }).catch(() => ({ data: null })),
        includeApps
          ? this.request<ApiEnvelope<{ targets?: ComputerUseInspection['targets'] }>>(
              '/api/v1/computer-use/apps',
              { headers: scopedHeaders },
              30_000,
            ).catch(() => ({ data: { targets: [] } }))
          : Promise.resolve({ data: undefined }),
      ]);
      const settings = settingsResponse.data?.computerUse;
      if (!settings || typeof settings !== 'object') throw new Error('Computer-use settings unavailable');
      return {
        settings: settings as ComputerUseSettings,
        status: statusResponse.data ?? null,
        ...(includeApps ? { targets: appsResponse.data?.targets ?? [] } : {}),
      } satisfies ComputerUseInspection as T;
    }

    throw new Error(`Unsupported remote inspection: ${name}`);
  }

  async revoke(): Promise<void> {
    await this.request('/api/auth/session', { method: 'DELETE' });
  }

  private async request<T = unknown>(
    endpoint: string,
    init: RequestInit = {},
    timeoutMs = 8000,
  ): Promise<T> {
    if (this.transport) return decodeTransportJson<T>(
      await this.transport.request(endpoint, init, timeoutMs),
      requiresAcknowledgement(init.method),
    );
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${stripBearer(this.target.token)}`);
    if (init.body) headers.set('content-type', 'application/json');
    return fetchJson<T>(`${this.target.baseUrl}${endpoint}`, { ...init, headers }, timeoutMs);
  }

  private async requestForm<T = unknown>(
    endpoint: string,
    parts: RemoteTransportFormPart[],
    extraHeaders: Record<string, string> = {},
    timeoutMs = 8000,
  ): Promise<T> {
    if (this.transport) {
      if (!this.transport.requestForm) throw new Error('This remote connection cannot upload files.');
      return decodeTransportJson<T>(
        await this.transport.requestForm(endpoint, parts, extraHeaders, timeoutMs),
        true,
      );
    }
    const form = new FormData();
    for (const part of parts) {
      if ('value' in part) form.append(part.name, part.value);
      else form.append(part.name, blobFromBase64(part.base64, part.mimeType), part.filename);
    }
    const headers = new Headers(extraHeaders);
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${stripBearer(this.target.token)}`);
    return fetchJson<T>(
      `${this.target.baseUrl}${endpoint}`,
      { method: 'POST', headers, body: form },
      timeoutMs,
    );
  }

  private async requestBinary(
    endpoint: string,
    init: RequestInit = {},
    timeoutMs = 8000,
  ): Promise<RemoteBinaryFile> {
    if (this.transport) {
      const response = await this.transport.request(endpoint, init, timeoutMs);
      if (response.status < 200 || response.status >= 300) decodeTransportJson(response);
      const body = response.body ?? '';
      const bytes = response.bodyEncoding === 'base64'
        ? Uint8Array.from(atob(body), (character) => character.charCodeAt(0))
        : new TextEncoder().encode(body);
      const disposition = response.contentDisposition ?? '';
      const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
      return { bytes, filename: filenameMatch?.[1] || 'download', mimeType: response.contentType?.split(';')[0] || 'application/octet-stream' };
    }
    const headers = new Headers(init.headers);
    headers.set('accept', '*/*');
    headers.set('authorization', `Bearer ${stripBearer(this.target.token)}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.target.baseUrl}${endpoint}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        decodeTransportJson({ status: response.status, body: await response.text().catch(() => '') });
      }
      const disposition = response.headers.get('content-disposition') ?? '';
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        bytes,
        filename: filenameMatch?.[1] || 'download',
        mimeType: response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestText(
    endpoint: string,
    init: RequestInit = {},
    timeoutMs = 8000,
  ): Promise<string> {
    if (this.transport) {
      const response = await this.transport.request(endpoint, init, timeoutMs);
      if (response.status < 200 || response.status >= 300) decodeTransportJson(response);
      return response.body ?? '';
    }
    const headers = new Headers(init.headers);
    headers.set('accept', 'text/plain, text/csv, */*');
    headers.set('authorization', `Bearer ${stripBearer(this.target.token)}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.target.baseUrl}${endpoint}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        decodeTransportJson({ status: response.status, body });
      }
      return body;
    } finally {
      clearTimeout(timeout);
    }
  }
}
