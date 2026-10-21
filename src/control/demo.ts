import type { ControlSnapshot, MobileCommand, SettingField, SettingSection } from '../types/control';

export const demoSections: SettingSection[] = [
  { id: 'providers', label: 'Providers', description: 'Models, credentials and provider defaults' },
  { id: 'agent', label: 'Agent', description: 'Manager behavior, permissions and execution' },
  { id: 'skills', label: 'Skills', description: 'Installed skills and project skill controls' },
  { id: 'mcp', label: 'MCP', description: 'Tool servers and agent integrations' },
  { id: 'memory', label: 'Memory', description: 'Persistent memory and retrieval settings' },
  { id: 'audio', label: 'Voice', description: 'Voice input, output and audio models' },
  { id: 'images', label: 'Images', description: 'Image generation and image input' },
  { id: 'video', label: 'Video', description: 'Video generation providers and defaults' },
  { id: 'appearance', label: 'Appearance', description: 'Theme, density and presentation' },
  { id: 'billing', label: 'Usage', description: 'Usage, budgets and provider balances' },
  { id: 'teams', label: 'Teams', description: 'Collaboration, access and shared sessions' },
  { id: 'notes', label: 'Notes', description: 'Notes workspace and context injection' },
  { id: 'archived', label: 'Archived chats', description: 'Archived sessions and recovery' },
  { id: 'experimental', label: 'Experimental', description: 'Preview capabilities and diagnostics' },
];

export const demoSettings: SettingField[] = [
  {
    id: 'providers.default',
    sectionId: 'providers',
    label: 'Default model',
    description: 'Used for new manager sessions unless a project overrides it.',
    kind: 'select',
    value: 'GPT-5.6 Sol',
    options: ['GPT-5.6 Sol', 'Claude Opus', 'Gemini 3 Pro'],
  },
  {
    id: 'providers.refresh',
    sectionId: 'providers',
    label: 'Refresh provider models',
    description: 'Recheck connected provider catalogs on the remote machine.',
    kind: 'action',
    value: 'Refresh',
  },
  {
    id: 'agent.autorun',
    sectionId: 'agent',
    label: 'Continue independent work',
    description: 'Allow Koryphaios to continue through routine steps without stopping.',
    kind: 'toggle',
    value: true,
  },
  {
    id: 'agent.permissionPreset',
    sectionId: 'agent',
    label: 'Permission preset',
    description: 'Default tool authority for newly spawned agents.',
    kind: 'select',
    value: 'Review risky actions',
    options: ['Review risky actions', 'Ask often', 'Allow all'],
  },
  {
    id: 'skills.projectEnabled',
    sectionId: 'skills',
    label: 'Project skills',
    description: 'Expose project-specific skills to manager and subagents.',
    kind: 'toggle',
    value: true,
  },
  {
    id: 'mcp.remoteTools',
    sectionId: 'mcp',
    label: 'Remote MCP tools',
    description: 'Allow paired mobile sessions to invoke the same approved MCP tools.',
    kind: 'toggle',
    value: true,
  },
  {
    id: 'memory.enabled',
    sectionId: 'memory',
    label: 'Memory',
    description: 'Use persistent memory when building manager context.',
    kind: 'toggle',
    value: true,
  },
  {
    id: 'audio.enabled',
    sectionId: 'audio',
    label: 'Voice controls',
    description: 'Enable voice capture and spoken responses on supported devices.',
    kind: 'toggle',
    value: true,
  },
  {
    id: 'images.enabled',
    sectionId: 'images',
    label: 'Image tools',
    description: 'Allow image attachments and generation from mobile sessions.',
    kind: 'toggle',
    value: true,
  },
  {
    id: 'video.enabled',
    sectionId: 'video',
    label: 'Video tools',
    description: 'Expose configured video generation providers.',
    kind: 'toggle',
    value: false,
  },
  {
    id: 'appearance.theme',
    sectionId: 'appearance',
    label: 'Theme',
    description: 'Match the Koryphaios desktop theme.',
    kind: 'select',
    value: 'Kory dark',
    options: ['Kory dark', 'Light'],
  },
  {
    id: 'billing.showContext',
    sectionId: 'billing',
    label: 'Show context usage',
    description: 'Keep context occupancy visible in active sessions.',
    kind: 'toggle',
    value: true,
  },
  {
    id: 'teams.mobileJoin',
    sectionId: 'teams',
    label: 'Allow team sessions',
    description: 'Join team workspaces from this paired mobile device.',
    kind: 'toggle',
    value: true,
  },
  {
    id: 'notes.enabled',
    sectionId: 'notes',
    label: 'Notes',
    description: 'Keep the project notes workspace available to agents.',
    kind: 'toggle',
    value: true,
  },
  {
    id: 'archived.open',
    sectionId: 'archived',
    label: 'Browse archived chats',
    description: 'Open archived sessions stored on the remote machine.',
    kind: 'action',
    value: 'Open',
  },
  {
    id: 'experimental.computerUse',
    sectionId: 'experimental',
    label: 'Computer use',
    description: 'Show computer-use sessions and remote viewport status.',
    kind: 'toggle',
    value: true,
  },
];

export const demoSnapshot: ControlSnapshot = {
  version: 1,
  machine: {
    id: 'demo-machine',
    name: 'Remote Mac',
    platform: 'macOS',
    status: 'online',
    latencyMs: 18,
    executionLabel: 'Execution on remote machine',
  },
  projects: [
    { id: 'kory-mobile', name: 'koryphaios-mobile', path: '~/Documents/koryphaios-mobile', branch: 'main' },
    { id: 'kory', name: 'koryphaios', path: '~/Documents/koryphaios', branch: 'main' },
  ],
  activeProjectId: 'kory-mobile',
  sessions: [
    { id: 's1', title: 'Adaptive mobile control', projectId: 'kory-mobile', updatedAt: 'now' },
    { id: 's2', title: 'Remote gateway protocol', projectId: 'kory-mobile', updatedAt: '12m' },
    { id: 's3', title: 'Desktop parity audit', projectId: 'kory', updatedAt: '1h', unread: 2 },
  ],
  activeSessionId: 's1',
  agents: [
    {
      id: 'manager',
      name: 'Kory',
      role: 'Manager',
      provider: 'OpenAI',
      model: 'GPT-5.6 Sol',
      status: 'running',
      currentTask: 'Coordinating the mobile control surface',
      progress: 0.68,
      contextUsed: 73420,
      contextLimit: 200000,
    },
    {
      id: 'ui',
      name: 'Interface',
      role: 'Subagent',
      provider: 'OpenAI',
      model: 'GPT-5.6 Sol',
      status: 'running',
      parentId: 'manager',
      currentTask: 'Adapting desktop patterns to compact layouts',
      progress: 0.79,
    },
    {
      id: 'gateway',
      name: 'Gateway',
      role: 'Subagent',
      provider: 'Claude',
      model: 'Claude Opus',
      status: 'running',
      parentId: 'manager',
      currentTask: 'Designing Zag control protocol',
      progress: 0.52,
      unread: 1,
    },
    {
      id: 'qa',
      name: 'Device QA',
      role: 'Subagent',
      provider: 'Google',
      model: 'Gemini 3 Pro',
      status: 'idle',
      parentId: 'manager',
      currentTask: 'Waiting for the simulator build',
      progress: 0.33,
    },
  ],
  feed: [
    {
      id: 'f1',
      kind: 'user',
      author: 'You',
      body: 'Make the mobile client feel like Koryphaios, with full control of the agents running at home.',
      createdAt: '11:23 PM',
    },
    {
      id: 'f2',
      kind: 'assistant',
      author: 'Kory',
      agentId: 'manager',
      body: 'I split the work into the adaptive shell, the remote control protocol, and device verification. The desktop remains the execution host.',
      createdAt: '11:24 PM',
      meta: 'GPT-5.6 Sol',
    },
    {
      id: 'f3',
      kind: 'tool',
      author: 'Interface',
      agentId: 'ui',
      body: 'Desktop design tokens mapped. Compact, medium, wide and three-column layouts are ready for implementation.',
      createdAt: '11:29 PM',
      meta: 'subagent',
    },
  ],
  activity: [
    { id: 'a1', title: 'Interface agent working', detail: 'Adaptive navigation and session feed', createdAt: 'now', status: 'running', agentId: 'ui' },
    { id: 'a2', title: 'Gateway protocol drafted', detail: 'Pair, snapshot and command endpoints', createdAt: '4m', status: 'success', agentId: 'gateway' },
    { id: 'a3', title: 'Device QA waiting', detail: 'Starts after the iOS prebuild completes', createdAt: '7m', status: 'info', agentId: 'qa' },
  ],
  goals: [],
  checklists: [],
  git: {
    isRepo: true,
    writeReady: true,
    status: [],
    branch: 'main',
    ahead: 0,
    behind: 0,
    remote: null,
    conflicts: [],
    branches: ['main'],
    worktrees: {
      active: [],
      availableSlots: 4,
      maxAllowed: 4,
      pendingResolutions: [],
    },
  },
  settingsSections: demoSections,
  settings: demoSettings,
  modelCatalog: [
    {
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6 Sol',
      provider: 'codex',
      providerLabel: 'OpenAI Codex',
      selection: 'codex:gpt-5.6-sol',
      reasoningLevels: ['low', 'medium', 'high', 'xhigh'],
      contextWindow: 200000,
      contextVerified: true,
    },
    {
      id: 'claude-opus',
      name: 'Claude Opus',
      provider: 'claude',
      providerLabel: 'Claude Code',
      selection: 'claude:claude-opus',
      reasoningLevels: [],
    },
    {
      id: 'gemini-3-pro',
      name: 'Gemini 3 Pro',
      provider: 'gemini',
      providerLabel: 'Gemini',
      selection: 'gemini:gemini-3-pro',
      reasoningLevels: [],
    },
  ],
  context: { used: 73420, limit: 200000, cached: 31800, archive: [] },
  capabilities: [
    'sessions',
    'agents',
    'subagents',
    'settings',
    'providers',
    'skills',
    'mcp',
    'memory',
    'notes',
    'teams',
    'git',
    'computer-use',
  ],
};

export function reduceDemo(snapshot: ControlSnapshot, command: MobileCommand): ControlSnapshot {
  if (command.name === 'agent.control') {
    const agentId = String(command.payload?.agentId ?? '');
    const action = String(command.payload?.action ?? '');
    return {
      ...snapshot,
      agents: snapshot.agents.map((agent) => {
        if (agent.id !== agentId) return agent;
        const status =
          action === 'pause' ? 'paused' : action === 'resume' ? 'running' : action === 'stop' ? 'completed' : agent.status;
        return { ...agent, status };
      }),
    };
  }

  if (command.name === 'agent.set_model') {
    const agentId = String(command.payload?.agentId ?? '');
    const model = String(command.payload?.model ?? '');
    return {
      ...snapshot,
      agents: snapshot.agents.map((agent) => (agent.id === agentId ? { ...agent, model } : agent)),
    };
  }

  if (command.name === 'agent.spawn') {
    const parentId = String(command.payload?.parentId ?? 'manager');
    const id = `agent-${snapshot.agents.length + 1}`;
    return {
      ...snapshot,
      agents: [
        ...snapshot.agents,
        {
          id,
          name: `Worker ${snapshot.agents.length}`,
          role: 'Subagent',
          provider: 'OpenAI',
          model: 'GPT-5.6 Sol',
          status: 'running',
          parentId,
          currentTask: 'Waiting for instructions',
          progress: 0.02,
        },
      ],
    };
  }

  if (command.name === 'session.send_message') {
    const body = String(command.payload?.body ?? '').trim();
    if (!body) return snapshot;
    const now = new Date();
    return {
      ...snapshot,
      feed: [
        ...snapshot.feed,
        {
          id: `f-${now.getTime()}`,
          kind: 'user',
          author: 'You',
          body,
          createdAt: now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        },
      ],
    };
  }

  if (command.name === 'setting.update') {
    const settingId = String(command.payload?.settingId ?? '');
    return {
      ...snapshot,
      settings: snapshot.settings.map((setting) =>
        setting.id === settingId ? { ...setting, value: command.payload?.value as SettingField['value'] } : setting,
      ),
    };
  }

  if (command.name === 'session.select') {
    return { ...snapshot, activeSessionId: String(command.payload?.sessionId ?? snapshot.activeSessionId) };
  }

  if (command.name === 'project.select') {
    return { ...snapshot, activeProjectId: String(command.payload?.projectId ?? snapshot.activeProjectId) };
  }

  return snapshot;
}
