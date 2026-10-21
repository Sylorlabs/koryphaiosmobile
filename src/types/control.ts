export type AgentStatus = 'running' | 'idle' | 'paused' | 'blocked' | 'completed' | 'error';
export type MachineStatus = 'online' | 'connecting' | 'offline';

export type Agent = {
  id: string;
  name: string;
  role: string;
  provider: string;
  model: string;
  status: AgentStatus;
  parentId?: string;
  currentTask?: string;
  progress?: number;
  unread?: number;
  contextUsed?: number;
  contextLimit?: number;
};

export type AgentThreadEntry = {
  id: string;
  role: 'manager' | 'user' | 'assistant';
  content: string;
  createdAt: number;
};

export type Machine = {
  id: string;
  name: string;
  platform: string;
  status: MachineStatus;
  latencyMs?: number;
  lastSeen?: string;
  executionLabel: string;
};

export type DeviceIdentity = {
  id: string;
  name: string;
  os: string;
  kind: 'desktop' | 'mobile';
};

export type LinkedDevice = DeviceIdentity & {
  online: boolean;
  linkedAt: number;
  allowAgents: boolean;
  agentRouting: boolean;
};

export type DevicePairRequest = {
  id: string;
  identity: DeviceIdentity;
  check: string;
  expiresAt: number;
};

export type DeviceNetworkInspection = {
  local: DeviceIdentity | null;
  osName: string;
  connected: boolean;
  relayUrl: string | null;
  error: string | null;
  peers: LinkedDevice[];
  requests: DevicePairRequest[];
  pendingPairIds: string[];
};

export type DeviceInvitation = {
  code: string;
  qrUrl: string;
  expiresAt: number;
};

export type DevicePairResult = {
  identity: DeviceIdentity;
  check: string;
};

export type Project = {
  id: string;
  name: string;
  path: string;
  branch?: string;
};

export type WorkspaceNavigationState = {
  workspaceRoot: string | null;
  selectedProject: string | null;
  projects: {
    path: string;
    name: string;
    modifiedAt?: number;
  }[];
  revision?: string;
  unavailableWorkspace: string | null;
  unavailableProject: string | null;
  seq?: number;
};

export type WorkspaceFilesInspection = {
  files: string[];
  query: string;
};

export type HostDirectoryEntry = {
  name: string;
  path: string;
};

export type HostDirectoryInspection = {
  path: string;
  parent: string | null;
  roots: HostDirectoryEntry[];
  directories: HostDirectoryEntry[];
};

export type HostDirectoryCreated = {
  path: string;
  name: string;
};

export type AgentPreferencesInspection = {
  exists: boolean;
  content: string;
  path: string;
};

export type ResponseStyleInspection = {
  name: string;
  path: string;
  instructions: string;
  isDefault: boolean;
  valid: boolean;
  errors: string[];
};

export type SkillDocumentSpec = {
  kind: 'markdown' | 'text' | 'html' | 'custom';
  extension: string;
  renderer: 'markdown' | 'plain' | 'html';
  mediaType: string;
};

export type SkillRevision = {
  name: string;
  description: string;
  source: 'personal' | 'project';
  state: 'active' | 'draft';
  path?: string;
  storageVersion?: 1 | 2;
  document?: SkillDocumentSpec;
  sourceContent?: string;
  coreInstructions?: string;
  content?: string;
  instructions?: string;
  hash: string;
  metadata?: {
    version?: string;
    domains?: string[];
    targetMedia?: string[];
    shouldTrigger?: string[];
    shouldNotTrigger?: string[];
    evidence?: string[];
    contextBudget?: number;
    broader?: string[];
    facets?: string[];
    depth?: number;
    requires?: string[];
    conflicts?: string[];
    activation?: string[];
    excludes?: string[];
  };
  validation?: {
    valid?: boolean;
    errors?: string[];
    warnings?: string[];
  };
  bundledUpdateAvailable?: boolean;
};

export type SkillWorkspaceInspection = {
  skills: SkillRevision[];
  health?: SkillHealthSnapshot;
  bundledUpdateCount: number;
};

export type SkillHealthRecord = {
  name: string;
  source: 'personal' | 'project';
  state: 'active' | 'draft';
  hash: string;
  version: string;
  steward: {
    agentId?: string;
    displayLabel?: string;
    provider?: string;
    model?: string;
    status?: string;
    lastCompletedAt?: string | null;
    lastOutcome?: string | null;
  } | null;
  lastBenchmarkAt: string | null;
  routingPrecision: number | null;
  routingRecall: number | null;
  qualityDelta: number | null;
  openRegressions: number;
  usageCount: number;
  lastUsedAt: string | null;
  conflicts: string[];
  dependencies: string[];
  promotionState: 'unmeasured' | 'insufficient-evidence' | 'blocked' | 'ready';
};

export type SkillHealthSnapshot = {
  generatedAt?: string;
  records?: SkillHealthRecord[];
  summary?: {
    revisions?: number;
    active?: number;
    stewarded?: number;
    ready?: number;
    blocked?: number;
    openRegressions?: number;
  };
};

export type HarnessQualificationRecord = {
  provider: string;
  model: string;
  harnessVersion: string;
  skill: string;
  role: 'worker' | 'critic';
  medium?: string;
  sampleSize: number;
  successes: number;
  quality: number;
  verification: number;
  updatedAt: string;
  evidence: string[];
};

export type SkillPromotionGate = {
  status: 'unmeasured' | 'insufficient-evidence' | 'blocked' | 'ready';
  candidateRuns: number;
  baselineRuns: number;
  distinctHarnesses: number;
  distinctProviders: number;
  distinctModels: number;
  humanBlindReviews: number;
  provenancedBlindReviews: number;
  passRate: number | null;
  quality: number | null;
  verification: number | null;
  routingPrecision: number | null;
  routingRecall: number | null;
  infrastructureFailures: number;
  regressionCases: number;
  openRegressions: number;
  reasons: string[];
};

export type SkillEvaluationCard = {
  skill: string;
  revisionHash: string;
  cases: unknown[];
  gate: SkillPromotionGate;
  runs: unknown[];
};

export type SkillRevisionComparison = {
  activeHash: string;
  draftHash: string;
  changed: boolean;
  active: string;
  draft: string;
  activeDocument?: SkillDocumentSpec;
  draftDocument?: SkillDocumentSpec;
};

export type BundledSkillComparison = {
  localHash: string;
  bundledHash: string;
  changed: boolean;
  local: string;
  bundled: string;
  localDocument?: SkillDocumentSpec;
  bundledDocument?: SkillDocumentSpec;
};

export type SkillConversionPreview = {
  sourceDocument: SkillDocumentSpec;
  targetDocument: SkillDocumentSpec;
  sourceContent: string;
  convertedContent: string;
  coreInstructions: string;
  warnings: string[];
  lossy: boolean;
  draft?: SkillRevision;
};

export type SkillResolutionPreview = {
  planningOnly?: boolean;
  planningLimit?: string;
  selected?: {
    skill: SkillRevision;
    reason: string;
    representation?: 'full' | 'compact' | 'minimal';
    contextCost?: number;
  }[];
  collisions?: { name: string; personalHash: string; projectHash: string }[];
  selectionConflicts?: { left: string; right: string }[];
  hierarchyErrors?: string[];
  omittedByBudget?: string[];
  rejectedCandidates?: { name: string; reason: string }[];
  rejectedCandidateCount?: number;
  blocked?: boolean;
  contextBudget?: number;
  totalContextCost?: number;
};

export type Session = {
  id: string;
  title: string;
  projectId: string;
  updatedAt: string;
  unread?: number;
  gitWorkspace?: {
    path?: string;
    branch?: string;
    baseCommit?: string;
    repositoryPath?: string;
    isolation?: string;
  };
  interactionMode?: 'act' | 'plan';
  agentOverrides?: {
    permissionMode?: 'yolo' | 'guarded' | 'edits' | 'ask' | 'plan' | 'custom';
    agentExecutionMode?: 'auto' | 'single' | 'multi';
    criticGateEnabled?: boolean;
  };
};

export type ContextBreakdown = {
  system: number;
  memory: number;
  skills: number;
  tools: number;
  chat: number;
  output: number;
};

export type ContextArchiveEntry = {
  id: string;
  ts: number;
  kind: string;
  label: string;
  content: string;
  toolInput?: unknown;
  originalByteCount?: number;
  contentSha256?: string;
  truncated?: boolean;
  redacted?: boolean;
  isError?: boolean;
  prunedForAgent: boolean;
};

export type WorkflowStage = {
  id: string;
  label: string;
  description: string;
  requiresEvidence: boolean;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  autoStartSafe: boolean;
  stages: WorkflowStage[];
};

export type WorkflowDraft = WorkflowDefinition & {
  goalId: string;
  goalItemId: string;
  status: 'draft' | 'activated';
  activatedScope?: 'project' | 'personal';
  createdAt: number;
  updatedAt: number;
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  sessionId: string;
  task: string;
  status: 'running' | 'blocked' | 'completed' | 'stopped';
  stageIndex: number;
  evidence: { stageId: string; value: string; createdAt: number }[];
  blocker?: string;
};

export type WorkflowsInspection = {
  definitions: WorkflowDefinition[];
  drafts: WorkflowDraft[];
  runs: WorkflowRun[];
};

export type MemoryDocument = {
  path: string;
  content: string;
  exists: boolean;
  lastModified: number | null;
  size: number;
  revision: string | null;
  scope: 'universal' | 'project' | 'session' | 'rules' | 'document';
  documentKind?: 'memory' | 'rules';
  name?: string;
};

export type MemoryInspection = {
  documents: MemoryDocument[];
  settings?: {
    externalMemoryEnabled?: boolean;
    externalMemoryProvider?: string;
    externalMemoryScope?: string;
    externalMemoryInContext?: boolean;
    [key: string]: unknown;
  };
  externalProviders: {
    provider: string;
    supported: boolean;
    connected: boolean;
    selected: boolean;
    scope: string;
    scopeRequired: boolean;
  }[];
};

export type RemoteNote = {
  id: string;
  title: string;
  content: string;
  folderPath: string;
  tags: string[];
  pinned: boolean;
  includeInContext: boolean;
  createdAt: string | number;
  updatedAt: string | number;
  revision: number;
  sourcePath?: string;
  format?: 'markdown' | 'html';
  outlinks?: string[];
  backlinks?: string[];
  attachments?: NoteAttachment[];
};

export type NoteAttachment = {
  id: string;
  noteId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string | number;
};

export type NotesInspection = {
  notes: RemoteNote[];
};

export type NoteFolderNode = {
  path: string;
  name: string;
  children: NoteFolderNode[];
  noteCount: number;
};

export type NoteRevisionSummary = {
  revision: number;
  title?: string;
  updatedAt?: string | number;
  createdAt?: string | number;
  [key: string]: unknown;
};

export type NoteGraphData = {
  nodes: {
    id: string;
    title: string;
    folderPath: string;
    tags: string[];
    linkCount: number;
    includeInContext: boolean;
    unresolved?: boolean;
  }[];
  edges: { from: string; to: string; unresolved?: boolean }[];
  shown?: number;
  truncated?: boolean;
  total?: number;
  linksTruncated?: boolean;
};

export type NoteAppearances = {
  noteId: string;
  title: string;
  revision: number;
  backlinks: { id?: string; noteId?: string; title?: string; [key: string]: unknown }[];
  relationships: {
    fromId: string;
    toId: string;
    fromTitle: string;
    toTitle: string;
    type: string;
    status: string;
    stale: boolean;
    revision: number;
    direction: 'outgoing' | 'incoming';
    counterpartyId: string;
    counterpartyTitle: string;
  }[];
  canvases: { noteId: string; title: string; cardId: string; cardText: string }[];
  bases: { baseId: string; name: string; revision: number }[];
  counts: { backlinks: number; relationships: number; canvases: number; bases: number };
  truncated: boolean;
};

export type NoteBaseDefinition = {
  version: 1;
  filter?: Record<string, unknown>;
  sort: Record<string, unknown>[];
  groupBy?: Record<string, unknown>;
  view: {
    kind: 'table' | 'list' | 'card';
    fields: Record<string, unknown>[];
  };
};

export type NoteBase = {
  id: string;
  name: string;
  definition: NoteBaseDefinition;
  revision: number;
  trashedAt?: string | number;
  createdAt: string | number;
  updatedAt: string | number;
};

export type NoteBaseQueryResult = {
  rows: {
    id: string;
    title: string;
    folderPath: string;
    tags: string[];
    pinned: boolean;
    includeInContext: boolean;
    format: 'markdown' | 'html';
    createdAt: string | number;
    updatedAt: string | number;
    properties: Record<string, unknown>;
    groupValue?: string | number | boolean | null;
  }[];
  limit: number;
  offset: number;
  hasMore: boolean;
  invalidDocumentCount: number;
};

export type NoteDraftSummary = {
  id: string;
  noteId: string;
  baseRevision: number;
  draftRevision: number;
  baseTitle: string;
  title: string;
  contentBytes: number;
  createdAt: string | number;
  updatedAt: string | number;
  state: 'recoverable' | 'conflict' | 'trashed' | 'orphaned';
  currentRevision?: number;
};

export type NoteDraft = NoteDraftSummary & {
  content: string;
  folderPath: string;
  tags: string[];
  pinned: boolean;
  includeInContext: boolean;
  format: 'markdown' | 'html';
};

export type VaultRestorePreview = {
  format: 'koryphaios-notes-vault';
  archiveVersion: 1 | 2;
  projectName: string;
  archiveSha256: string;
  notes: number;
  revisions: number;
  attachments: number;
  links: number;
  relationships: number;
  bases: number;
  drafts: number;
  noOpNotes: number;
  conflicts: { kind: string; archiveId?: string; path?: string; message: string }[];
  canRestore: boolean;
  mode: 'safe-merge';
};

export type VaultRestoreResult = VaultRestorePreview & {
  restoredNotes: number;
  restoredRevisions: number;
  restoredAttachments: number;
  restoredLinks: number;
  restoredRelationships: number;
  restoredBases: number;
  restoredDrafts: number;
};

export type RemoteBinaryFile = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
};

export type NoteRelationship = {
  fromId: string;
  toId: string;
  type: 'related_to' | 'supports' | 'contradicts' | 'depends_on' | 'supersedes';
  evidence: string;
  weight?: number;
  status: 'proposed' | 'accepted' | 'rejected';
  revision: number;
  sourceRevision?: number;
  targetRevision?: number;
  stale?: boolean;
  fromTitle?: string;
  toTitle?: string;
  [key: string]: unknown;
};

export type NotePropertySchema = {
  key: string;
  displayName: string;
  kind: 'text' | 'number' | 'checkbox' | 'date' | 'datetime' | 'list' | 'tags';
  revision: number;
  usageCount: number;
  invalidCount: number;
  createdAt: string | number;
  updatedAt: string | number;
};

export type NotePropertiesSnapshot = {
  noteId: string;
  revision: number;
  status: 'valid' | 'invalid' | 'unsupported';
  hasFrontmatter?: boolean;
  properties: {
    key: string;
    type: NotePropertySchema['kind'];
    value: unknown;
  }[];
  warnings: {
    key?: string;
    code?: string;
    message?: string;
    [key: string]: unknown;
  }[];
};

export type NoteSemanticIndexStatus = {
  available: boolean;
  enabled: boolean;
  mode: string;
  eligibleNotes: number;
  indexedNotes: number;
  staleNotes: number;
  coverage: number;
  cursor: string;
  providerIdentity: string | null;
  representationChars: number;
  countsAvailable?: boolean;
  coverageBasis?: string;
  search?: {
    exhaustive: boolean;
    scannedVectors: number;
    maxVectors: number;
    reason: string;
  };
};

export type NoteContextActivation = {
  query: string;
  connections?: NoteContextActivation['results'][number]['path'];
  results: {
    id: string;
    title: string;
    revision: number;
    excerpt: string;
    truncated: boolean;
    score: number;
    sources: string[];
    seedId: string;
    explanation: string;
    path: {
      fromId: string;
      toId: string;
      direction: string;
      kind: string;
      type?: string;
      status?: string;
      provenance: string;
      evidence?: string;
      fromRevision: number;
      toRevision: number;
      relationshipRevision?: number;
      stale: boolean;
    }[];
  }[];
  conflicts: {
    noteId: string;
    reason: string;
    expectedRevision: number;
    currentRevision?: number;
    relatedNoteId?: string;
  }[];
  retrieval: {
    semantic: string;
    index: string;
    exhaustive: boolean;
    coverage?: NoteSemanticIndexStatus;
  };
  truncation: { truncated: boolean; reasons: string[] };
  budget: { limits: Record<string, number>; used: Record<string, number> };
};

export type NoteSemanticIndexRebuildResult = {
  status: NoteSemanticIndexStatus;
  processed: number;
  indexed: number;
  skipped: number;
  canceled: boolean;
  hasMore: boolean;
};

export type NotesSettings = {
  enabled: boolean;
  autoIncludeInContext: boolean;
  maxContextTokensEnabled: boolean;
  maxContextTokens: number;
  autosaveEnabled: boolean;
  autosaveDelayMs: number;
  noteSizeLimitEnabled: boolean;
  maxNoteBytes: number;
  attachmentSizeLimitEnabled: boolean;
  maxAttachmentBytes: number;
  maxAttachmentsPerNote: number;
  graphPhysics: {
    gravity: number;
    linkDistance: number;
    chargeStrength: number;
  };
  defaultFolderPath: string;
};

export type McpOAuthStatus = {
  authorized: boolean;
  scope?: string;
  expiresAt?: number;
  expired: boolean;
  refreshable: boolean;
  resource?: string;
  needsAuthorization: boolean;
};

export type McpAuthRequirement = {
  kind: 'none' | 'env' | 'oauth' | 'manual' | 'headers' | 'unknown';
  label: string;
  detail: string;
};

export type McpServerStatus = {
  name: string;
  transport: 'stdio' | 'sse';
  connected: boolean;
  toolCount: number;
  protocolVersion?: string;
  lastError?: string | null;
  configured: boolean;
  oauth?: McpOAuthStatus;
  auth?: McpAuthRequirement;
};

export type McpRegistryEntry = {
  id: string;
  name: string;
  title: string;
  description: string;
  version: string;
  websiteUrl: string | null;
  repositoryUrl: string | null;
  transport: 'stdio' | 'sse';
  command: string | null;
  args: string[];
  envVars: {
    name: string;
    description: string;
    isRequired: boolean;
    isSecret: boolean;
    defaultValue: string | null;
  }[];
  url: string | null;
  headerVars: {
    name: string;
    description: string;
    isSecret: boolean;
  }[];
  category?: string;
  auth?: McpAuthRequirement;
};

export type McpInspection = {
  servers: McpServerStatus[];
  featured: McpRegistryEntry[];
};

export type ChatGitRef = {
  ref: string;
  name: string;
  kind: 'branch' | 'remote' | 'tag';
  hash: string;
};

export type ChatGitCommit = {
  hash: string;
  subject: string;
  author: string;
  date: string;
};

export type ChatPullRequest = {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  author: string;
  baseBranch: string;
  headBranch: string;
  headCommit: string;
  repository: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
};

export type ChatGitTarget =
  | {
      kind: 'branch' | 'commit';
      ref: string;
      branch?: string;
      expectedHash?: string;
      source?: boolean;
    }
  | {
      kind: 'pull-request';
      number: number;
      branch: string;
      expectedHash?: string;
    };

export type ChatGitDetails = {
  hash: string;
  subject: string;
  message: string;
  author: string;
  date: string;
  stat: string;
};

export type ChatGitState = {
  sessionId: string;
  isolated: true;
  isRepo: boolean;
  repositoryPath: string;
  branch: string | null;
  head: string | null;
  dirty: boolean;
  refs: ChatGitRef[];
  commits: ChatGitCommit[];
  changedFiles: number;
  operationInProgress: boolean;
  githubRepository: string | null;
  sourceRefs: ChatGitRef[];
  sourceCommits: ChatGitCommit[];
  selection?: {
    kind: ChatGitTarget['kind'];
    ref: string;
    branch: string;
    commit: string;
    selectedAt: number;
    pullRequest?: ChatPullRequest;
  };
};

export type CollaborationTierPermissions = {
  viewChat: boolean;
  viewSystemMessages: boolean;
  viewDiffs: boolean;
  viewAgentStatus: boolean;
  viewParticipants: boolean;
  submitPrompts: boolean;
  autoExecutePrompts: boolean;
  useTools: boolean;
  fullSystemAccess: boolean;
  useRemoteProviders?: boolean;
  readPaths: string[];
  writePaths: string[];
  commandAllowlist: string[];
  commandBlocklist: string[];
};

export type CollaborationAccessTier = {
  id: string;
  name: string;
  description: string;
  builtin: 'viewer' | 'collaborator' | 'yolo' | 'models' | null;
  color: string;
  allowedModels: string[];
  reasoningByModel: Record<string, string[]>;
  permissions: CollaborationTierPermissions;
};

export type CollaborationPolicy = {
  allowedModels?: string[];
  allowPrompts?: boolean;
  requirePromptApproval?: boolean;
  showDiffs?: boolean;
  showAgentStatus?: boolean;
  showParticipants?: boolean;
  joinMode?: 'approval' | 'auto';
  defaultTierId?: string;
  accessTiers?: CollaborationAccessTier[];
  modelCatalog?: { id: string; label: string; provider: string; reasoningLevels: string[] }[];
  sessionName?: string;
  hostName?: string;
  workspacePaths?: string[];
  [key: string]: unknown;
};

export type CollaborationHost = {
  id: string;
  baseSessionId: string;
  ownerId: string;
  status: string;
  joinCode: string;
  tunnelUrl: string;
  inviteLinks: Record<string, string>;
  relayEnabled: boolean;
  policy: CollaborationPolicy;
};

export type CollaborationPendingPrompt = {
  promptId?: string;
  id?: string;
  content?: string;
  name?: string;
  guestName?: string;
  [key: string]: unknown;
};

export type CollaborationPendingJoin = {
  guestId: string;
  name?: string;
  tierId?: string;
  [key: string]: unknown;
};

export type CollaborationParticipant = {
  guestId?: string;
  userId?: string;
  name?: string;
  tierId?: string;
  [key: string]: unknown;
};

export type CollaborationInspection = {
  host: CollaborationHost | null;
  prompts: CollaborationPendingPrompt[];
  joins: CollaborationPendingJoin[];
  participants: CollaborationParticipant[];
};

export type ProviderShareRisk = 'ok' | 'caution' | 'prohibited';

export type ModelShareCandidate = {
  provider: string;
  label: string;
  modelCount: number;
  available: boolean;
  sharingBlockedReason?: string;
  agentic: boolean;
  risk: ProviderShareRisk;
  reason: string;
  models: { id: string; name: string }[];
};

export type RemoteSandboxPolicy = {
  preset: 'balanced' | 'hardened' | 'readonly' | 'trusted' | 'custom';
  filesystemIsolation: boolean;
  allowNetwork: boolean;
  allowShell: boolean;
  allowEdits: boolean;
  allowWebSearch: boolean;
  commandBlocklist: string[];
  maxRuntimeSeconds: number;
};

export type ModelSharingInspection = {
  shared: string[];
  sharedModels: Record<string, string[]>;
  candidates: ModelShareCandidate[];
  sharing: {
    active: boolean;
    inviteUrl?: string | null;
    joinCode?: string | null;
    hostName?: string | null;
  };
  remote: {
    connected: boolean;
    hostName?: string | null;
    catalog?: Record<string, unknown> | null;
  } | null;
  sandbox: {
    policy: RemoteSandboxPolicy;
    capabilities?: {
      osIsolation?: boolean;
      mechanism?: string;
      platform?: string;
    };
  } | null;
};

export type MediaModel = {
  id: string;
  label?: string;
  sizes?: string[];
  qualities?: string[];
  formats?: string[];
  background?: string[];
  edits?: boolean;
  durations?: string[];
  aspectRatios?: string[];
};

export type MediaProvider = {
  id?: string;
  provider?: string;
  label?: string;
  configured?: boolean;
  models?: MediaModel[];
};

export type MediaHistoryItem = {
  id: string;
  prompt?: string;
  provider?: string;
  model?: string;
  createdAt?: number | string;
  completedAt?: number | string;
  status?: string;
  outputPath?: string;
  url?: string;
  [key: string]: unknown;
};

export type MediaInspection = {
  imageProviders: MediaProvider[];
  videoProviders: MediaProvider[];
  imageHistory: MediaHistoryItem[];
  videoHistory: MediaHistoryItem[];
};

export type ApiUsageEntry = {
  id: string;
  ts: number;
  kind: 'image' | 'video' | 'tts' | 'stt' | 'embedding';
  provider: string;
  model: string;
  estimatedCostUsd?: number;
  units?: { measure: string; amount: number };
  detail?: string;
  sessionId?: string;
  runId?: string;
};

export type ApiUsageTotals = {
  totalCount: number;
  byKind: Record<string, number>;
  estimatedCostUsd?: number;
};

export type ApiUsageDailyBucket = {
  day: string;
  byKind: Record<string, number>;
  estimatedCostUsd?: number;
};

export type BillingProviderCostSummary = {
  name: string;
  spendUsd: number | null;
  spendCents: number | null;
  tokensIn: number;
  tokensOut: number;
  hasKnownCost: boolean;
  pricingIncomplete: boolean;
  subscription: boolean;
  apiEquivalentUsd?: number | null;
  apiEquivalentPricingIncomplete?: boolean;
  models: {
    model: string;
    spendUsd: number | null;
    spendCents: number | null;
    tokensIn: number;
    tokensOut: number;
    hasKnownCost: boolean;
    pricingIncomplete: boolean;
    subscription: boolean;
    apiEquivalentUsd?: number | null;
    apiEquivalentPricingIncomplete?: boolean;
    apiProvider?: string;
  }[];
};

export type BillingSessionCostSummary = {
  spendUsd: number;
  spendCents: number;
  hasKnownCost: boolean;
  pricingIncomplete: boolean;
  hasMeteredUsage: boolean;
  hasSubscriptionUsage: boolean;
  providers?: BillingProviderCostSummary[];
};

export type BillingInspection = {
  usage: { entries: ApiUsageEntry[]; totals: ApiUsageTotals };
  daily: ApiUsageDailyBucket[];
  sessions: Record<string, Omit<BillingSessionCostSummary, 'providers'>>;
  credits: {
    totalSpendUsd: number;
    totalSpendCents: number;
    hasKnownSpend: boolean;
    pricingIncomplete: boolean;
    remainingCents: number | null;
    balanceProviders: string[];
    availableBillingProviders: string[];
    refreshing?: boolean;
  };
};

export type TimeTravelEntry = {
  hash: string;
  description: string;
  timestamp: number;
  model?: string;
  cost?: number;
  recoverable: boolean;
  messageId?: string;
  checkpointType?: string;
  sequence?: number;
  summary?: string;
  toolCallCount?: number;
  commandCount?: number;
  fileEditCount?: number;
  hasRichMetadata?: boolean;
};

export type TimeTravelState = {
  currentHash: string;
  timeline: TimeTravelEntry[];
  canUndo: boolean;
  canRedo: boolean;
  stats: { totalStates: number; totalCost: number; modelsUsed: string[] };
};

export type RewindPreview = {
  canTravel: boolean;
  currentHash: string;
  targetHash: string;
  description: string;
  evidence?: { timestamp?: number; [key: string]: unknown };
  diff?: string;
  filesChanged?: string[];
  conversationEffect?: 'code-only' | 'rewind' | string;
  message?: string;
};

export type ComputerCapability =
  | 'discover'
  | 'observe'
  | 'interact'
  | 'manageWindows'
  | 'clipboardRead'
  | 'clipboardWrite'
  | 'transfer'
  | 'sensitive';
export type ComputerPermission = 'allow' | 'ask' | 'block';
export type ComputerTier = 'plan' | 'ask' | 'edits' | 'guarded' | 'yolo' | 'custom';
export type ComputerRole = 'manager' | 'worker' | 'critic';
export type ComputerAppPermission = {
  appId: string;
  label: string;
  capabilities: Partial<Record<ComputerCapability, ComputerPermission>>;
};
export type ComputerUseSettings = {
  enabled: boolean;
  byTier: Record<ComputerTier, Record<ComputerCapability, ComputerPermission>>;
  byRole: Record<ComputerRole, Record<ComputerCapability, ComputerPermission>>;
  apps: ComputerAppPermission[];
};
export type ComputerTarget = {
  appId: string;
  windowId: string;
  title: string;
  pid: number;
};
export type ComputerUseInspection = {
  settings: ComputerUseSettings;
  status: {
    platform: string;
    available: boolean;
    capabilities: ComputerCapability[];
    limitations: string[];
    enabled?: boolean;
    pending?: number;
  } | null;
  targets?: ComputerTarget[];
};

export type FeedEntry = {
  id: string;
  kind: 'user' | 'assistant' | 'tool' | 'status';
  author: string;
  body: string;
  createdAt: string;
  /** Ephemeral streamed output cannot be edited or hidden until persisted. */
  isStreaming?: boolean;
  agentId?: string;
  meta?: string;
  messageId?: string;
  model?: string;
  provider?: string;
  variantGroupId?: string;
  activeVariantId?: string | null;
  variantIdentityAuthoritative?: boolean;
  activeMessageId?: string | null;
  conversationRevision?: number | null;
  providerConversationRevision?: number | null;
  userHidden?: boolean;
  attachments?: MessageAttachment[];
  responseVariants?: {
    id: string;
    body: string;
    model?: string;
    provider?: string;
    index: number;
    isActive: boolean;
  }[];
};

export type MessageAttachment = {
  type: 'image' | 'file';
  data: string;
  name: string;
  mimeType?: string;
  size?: number;
};

export type ModelCatalogEntry = {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  selection: string;
  reasoningLevels: string[];
  supportsFastMode?: boolean;
  supportsAttachments?: boolean;
  vision?: boolean;
  remoteAgentic?: boolean;
  remoteHostName?: string;
  contextWindow?: number;
  contextVerified?: boolean;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  status: 'success' | 'running' | 'warning' | 'error' | 'info';
  agentId?: string;
  processId?: string;
  processSessionId?: string;
  processStatus?: string;
  commandReplayable?: boolean;
};

export type GoalScope = 'workspace' | 'project' | 'session';
export type GoalStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'cancelled';
export type GoalItemStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'skipped';

export type RemoteGoal = {
  id: string;
  objective: string;
  scope: GoalScope;
  projectPath?: string;
  sessionId?: string;
  priority: number;
  sortOrder: number;
  status: GoalStatus;
  checklist: {
    id: string;
    title: string;
    status: GoalItemStatus;
    order: number;
    dependsOn: string[];
    evidence?: unknown[];
  }[];
  linkedSessionIds: string[];
  blocker?: string;
  execution?: {
    sessionId: string;
    provider: string;
    model: string;
    reasoningLevel?: string;
    instructions?: string;
  };
  createdAt: number;
  updatedAt: number;
};

export type ChecklistItemStatus = 'pending' | 'done' | 'skipped';
export type RemoteChecklist = {
  id: string;
  title: string;
  scope: GoalScope;
  projectPath?: string;
  sessionId?: string;
  items: {
    id: string;
    title: string;
    status: ChecklistItemStatus;
    order: number;
  }[];
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type GitFileStatus = {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'staged';
  staged: boolean;
  originalPath?: string;
  additions?: number;
  deletions?: number;
};

export type WorktreeInfo = {
  id: string;
  taskName: string;
  branchName: string;
  path: string;
  createdAt: number;
  agentId?: string;
  destinationBranch: string;
};

export type PendingWorktreeResolution = {
  taskId: string;
  taskName: string;
  branchName: string;
  destinationBranch: string;
  conflicts: { path: string }[];
  reason: 'conflict' | 'incomplete';
  recordedAt: number;
};

export type GitState = {
  isRepo: boolean;
  writeReady: boolean;
  status: GitFileStatus[];
  branch: string;
  ahead: number;
  behind: number;
  remote?: string | null;
  conflicts: string[];
  branches: string[];
  worktrees: {
    active: WorktreeInfo[];
    availableSlots: number;
    maxAllowed: number;
    pendingResolutions: PendingWorktreeResolution[];
  };
};

export type ProcessInspection = {
  processId: string;
  process?: Record<string, unknown>;
  logs: {
    stdout: string;
    stderr: string;
    stdoutLineCount?: number;
    stderrLineCount?: number;
  };
  events: {
    id: number | string;
    eventType: string;
    eventData?: Record<string, unknown>;
    timestamp: number;
  }[];
};

export type GitInspection = {
  file: string;
  staged: boolean;
  diff?: string;
  content?: string | null;
};

export type RemoteQuestion = {
  sessionId: string;
  questionId?: string;
  question: string;
  options: string[];
  allowOther: boolean;
  allowKeepChatting?: boolean;
};

export type RemoteChangeSummary = {
  path: string;
  linesAdded: number;
  linesDeleted: number;
  operation: 'create' | 'edit' | 'delete';
};

export type RemoteChangeReview = {
  sessionId: string;
  reviewId?: string;
  reviewRevision?: string;
  changes: RemoteChangeSummary[];
};

export type NativeCommandDefinition = {
  command: string;
  aliases?: string[];
  description: string;
  category: string;
  argsHint?: string;
};

export type NativeCommandInspection = {
  provider: string | null;
  label: string | null;
  commands: NativeCommandDefinition[];
};

export type NativeCommandOutput = {
  sessionId: string;
  messageId: string;
  provider: string;
  providerLabel: string;
  command: string;
  rawCommand: string;
  text: string;
  isError: boolean;
  complete: boolean;
  updatedAt: number;
};

export type RemoteRunPhase =
  | 'idle'
  | 'analyzing'
  | 'thinking'
  | 'streaming'
  | 'tool_calling'
  | 'compacting'
  | 'waiting_terminal'
  | 'waiting_user'
  | 'done'
  | 'error'
  | 'cancelled';

export type RemoteRunStatus = 'idle' | 'active' | 'waiting' | 'terminal';

export type RemoteRunSnapshot = {
  sessionId: string;
  runId: string | null;
  revision: number;
  phase: RemoteRunPhase;
  status: RemoteRunStatus;
  waitingReason: string;
  continuationId: string | null;
  activeAgentIds: string[];
  startedAt: number | null;
  updatedAt: number;
  finishedAt: number | null;
  terminalReason: string | null;
};

export type RemoteEventState = {
  connection: 'disconnected' | 'connecting' | 'connected' | 'error';
  questions: Record<string, RemoteQuestion>;
  reviews: Record<string, RemoteChangeReview>;
  nativeCommands: Record<string, NativeCommandOutput[]>;
  runs: Record<string, RemoteRunSnapshot>;
  /** Transient ordered output; the authoritative transcript is ControlSnapshot.feed. */
  streams?: Record<string, Record<string, RemoteAgentStream>>;
};

export type RemoteAgentStream = {
  content: string;
  model: string;
  complete: boolean;
  truncated: boolean;
  startedAt: number;
  updatedAt: number;
};

export type SettingSection = {
  id: string;
  label: string;
  description: string;
};

export type SettingAction = {
  id: string;
  label: string;
  tone?: 'default' | 'primary' | 'danger';
};

export type SettingField = {
  id: string;
  sectionId: string;
  label: string;
  description?: string;
  kind:
    | 'toggle'
    | 'select'
    | 'text'
    | 'number'
    | 'number-auto'
    | 'list'
    | 'json'
    | 'action'
    | 'readonly';
  value?: boolean | string | number | null;
  options?: string[];
  actions?: SettingAction[];
};

export type ControlSnapshot = {
  version: 1;
  machine: Machine;
  projects: Project[];
  activeProjectId: string;
  sessions: Session[];
  activeSessionId: string;
  agents: Agent[];
  feed: FeedEntry[];
  activity: ActivityItem[];
  goals: RemoteGoal[];
  checklists: RemoteChecklist[];
  git: GitState;
  settingsSections: SettingSection[];
  settings: SettingField[];
  modelCatalog: ModelCatalogEntry[];
  context: {
    used: number;
    limit: number;
    cached: number;
    contextKnown?: boolean;
    estimated?: boolean;
    provider?: string;
    model?: string;
    breakdown?: ContextBreakdown;
    archive: ContextArchiveEntry[];
  };
  capabilities: string[];
};

export type MobileCommand = {
  id: string;
  name: string;
  payload?: Record<string, unknown>;
};

export type CommandResult = {
  accepted: boolean;
  sessionId?: string;
  data?: unknown;
};

export type ProviderAccount = {
  id: string;
  provider: string;
  label: string;
  createdAt?: number;
  updatedAt?: number;
  hasApiKey?: boolean;
  hasAuthToken?: boolean;
  hasBaseUrl?: boolean;
  source?: 'saved' | 'cli-autodetect';
  email?: string | null;
  plan?: string | null;
  health?: 'ready' | 'expired' | 'unknown';
  profileDir?: string;
};

export type ProviderRemoteStatus = {
  name: string;
  label: string;
  enabled: boolean;
  authenticated: boolean;
  adapterAvailable: boolean;
  credentialDetected: boolean;
  connectionState:
    | 'not_configured'
    | 'detected'
    | 'verified'
    | 'failed'
    | 'unknown'
    | 'unavailable';
  verificationError?: string;
  authSource?: string;
  authMode: string;
  supportsApiKey: boolean;
  supportsAuthToken: boolean;
  requiresBaseUrl: boolean;
  requiresDeployment?: boolean;
  baseUrlPlaceholder?: string;
  models: string[];
  selectedModels: string[];
  allAvailableModels: { id?: string; name?: string }[];
  description?: string;
  deployment?: string;
  custom?: boolean;
  accounts: ProviderAccount[];
  fallbackOrder: string[];
  fallbackEnabled: boolean;
  awsCredentialScan?: {
    detected: boolean;
    sources: {
      kind: 'env' | 'shared_credentials_file' | 'config_file';
      profile?: string;
      region?: string;
      sso?: boolean;
    }[];
    description: string;
  };
};

export type ProvidersInspection = {
  providers: ProviderRemoteStatus[];
  detected: Record<string, unknown>[];
  cliAccounts: ProviderAccount[];
  selectionRequired: string[];
};

export type ProviderAuthData = {
  status?: string;
  url?: string;
  message?: string;
  deviceAuthId?: string;
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  verificationUriComplete?: string;
  interval?: number;
  expiresIn?: number;
  provider?: string;
  error?: string;
  errorDescription?: string;
};

export type AgentMessageStatus =
  | 'queued'
  | 'pending_approval'
  | 'delivered'
  | 'answered'
  | 'declined'
  | 'failed';

export type AgentMessage = {
  id: string;
  threadId: string;
  fromSessionId: string;
  fromAgentId: string;
  fromRole: 'manager' | 'worker';
  fromLabel: string;
  toSessionId: string;
  toAgentId?: string;
  toRole: 'manager' | 'worker';
  toLabel: string;
  crossProject: boolean;
  isRelayRequest: boolean;
  subject: string;
  body: string;
  replyToMessageId?: string;
  status: AgentMessageStatus;
  statusReason?: string;
  reply?: string;
  createdAt: number;
  deliveredAt?: number;
  answeredAt?: number;
};

export type PairingTarget = {
  baseUrl: string;
  token: string;
  machineId: string;
  machineName: string;
};

export type PairResponse = {
  token: string;
  machine: Machine;
};
