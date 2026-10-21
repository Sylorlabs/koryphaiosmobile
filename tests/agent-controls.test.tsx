// Native callback integration runs isolated to avoid shared Bun module mocks.
import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORYPHAIOS_AGENT_CONTROLS_CHILD !== '1') {
  test('agent control UI: acknowledgment, drafts, and host isolation', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORYPHAIOS_AGENT_CONTROLS_CHILD: '1' },
      encoding: 'utf8', timeout: 25_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Agent controls failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 30_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    Appearance: { getColorScheme: () => 'dark' },
    AppState: { currentState: 'active' },
    View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
    useWindowDimensions: () => ({ width: 393, height: 852 }),
    StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  }));
  // Exercise the real draft/send state machine without loading Expo's native
  // SecureStore module into Bun's renderer-only test process.
  mock.module('../src/control/conversationDraftStorage', () => ({
    agentMessageDraftStorage: {
      durable: true,
      load: async () => null,
      save: async (_raw: string) => {},
    },
  }));
  const savedDecisionReviews = new Map<string, { label: string }>();
  let failDecisionReviewSave = false;
  let failMailboxRead = false;
  let pendingDecisionReviewSave: Promise<void> | null = null;
  mock.module('../src/control/settingActionReviewStorage', () => ({
    settingActionReviewStorage: {
      load: async (key: string) => savedDecisionReviews.get(key) ?? null,
      save: async (key: string, value: { label: string }) => {
        if (failDecisionReviewSave) throw new Error('Keychain write failed');
        if (pendingDecisionReviewSave) await pendingDecisionReviewSave;
        savedDecisionReviews.set(key, value);
      },
      clear: async (key: string) => { savedDecisionReviews.delete(key); },
    },
  }));
  mock.module('expo-router', () => ({
    router: { push: () => {}, back: () => { navigations++; } },
  }));
  mock.module('lucide-react-native', () => Object.fromEntries(
    ['Bot', 'CircleStop', 'Send', 'X', 'Check', 'ChevronDown', 'ChevronRight', 'MessagesSquare'].map((name) => [name, `Icon${name}`]),
  ));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
    Eyebrow: 'Eyebrow', ProgressBar: 'ProgressBar', SectionTitle: 'SectionTitle', StatusDot: 'StatusDot',
  }));
  type Pending = {
    name: string;
    payload: Record<string, unknown>;
    resolve: (result: { accepted: boolean }) => void;
    reject: (error: Error) => void;
  };
  let navigations = 0;
  let dismissed: string[] = [];
  let pending: Pending[] = [];
  let mailItems: any[] = [];
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const worker = (id = 'worker-a') => ({
    id, name: id, role: 'worker', parentId: 'manager',
    status: 'running', provider: 'test', model: 'test', currentTask: '',
  });
  let agent = worker();
  const snapshotFor = (host: string, chat: string) => ({
    machine: { id: host }, activeProjectId: 'project-a', activeSessionId: chat,
    agents: [worker('worker-a'), worker('worker-b')], modelCatalog: [],
  });
  let control: any;
  let testScope = 0;
  const setHost = (host = 'host-a', chat = 'chat-a') => {
    // The native draft store lives for the life of this isolated process.
    // Unique machine/chat identities keep the tests independent.
    const scopedHost = `${host}-${testScope}`;
    const scopedChat = chat ? `${chat}-${testScope}` : '';
    control = {
      snapshot: snapshotFor(scopedHost, scopedChat),
      pairing: { machineId: scopedHost, baseUrl: `https://${scopedHost}.test` },
      modelChoices: {}, dismissedAgentIds: new Set(),
      setSelectedAgentId: () => {}, dismissAgent: (id: string) => dismissed.push(id),
      inspect: async (name: string) => {
        if (name !== 'agent.messages') return [];
        if (failMailboxRead) throw new Error('Desktop mailbox unavailable');
        return mailItems;
      },
      sendCommand: (name: string, payload: Record<string, unknown>) =>
        new Promise<{ accepted: boolean }>((resolve, reject) => {
          pending.push({ name, payload, resolve, reject });
        }),
    };
  };
  setHost();
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  const { AgentDetailView } = await import('../src/components/AgentDetailView');
  const { AgentsView } = await import('../src/components/AgentsView');
  const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  const settleTimers = async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 9)); await flush(); });
  };
  const render = async () => {
    await act(async () => {
      if (tree) tree.update(<AgentDetailView agent={agent} />);
      else tree = TestRenderer.create(<AgentDetailView agent={agent} />);
      await flush();
    });
    await settleTimers();
  };
  const renderAgents = async () => {
    await act(async () => {
      if (tree) tree.update(<AgentsView />);
      else tree = TestRenderer.create(<AgentsView />);
      await flush();
    });
    await settleTimers();
  };
  const input = () => tree!.root.findByType('TextInput' as any);
  const draft = () => input().props.value as string;
  const setDraft = async (value: string) => {
    await act(async () => { input().props.onChangeText(value); await flush(); });
  };
  const findButton = (label: string) =>
    tree!.root.findAll((node) =>
      node.type === 'Pressable' && node.props.accessibilityLabel === label
      || node.type === 'ActionButton' && node.props.label === label)[0];
  const tap = async (label: string) => {
    const button = findButton(label);
    expect(button).toBeDefined();
    await act(async () => { button.props.onPress(); await flush(); });
  };
  const restoreRecovered = async () => {
    const button = tree!.root.findAll((node) =>
      node.type === 'Pressable' &&
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith('Restore recovered agent message '))[0];
    expect(button).toBeDefined();
    await act(async () => { button.props.onPress(); await flush(); });
  };
  const text = () => tree!.root.findAllByType('Text' as any).flatMap((node) =>
    node.children.filter((child): child is string => typeof child === 'string')).join(' ');

  afterEach(async () => {
    if (tree) await act(async () => { tree!.unmount(); });
    tree = null;
    pending = []; dismissed = []; navigations = 0; mailItems = [];
    failDecisionReviewSave = false;
    failMailboxRead = false;
    pendingDecisionReviewSave = null;
    agent = worker();
    testScope++;
    setHost();
  });

  test('failure preserves draft, blocks rapid double tap, and shows recovery guidance', async () => {
    await render();
    await setDraft('check deployment');
    await tap('Send message to worker-a');
    await tap('Send message to worker-a');
    expect(pending).toHaveLength(1);
    expect(findButton('Send message to worker-a').props.disabled).toBe(true);
    expect(text()).toContain('Waiting for machine acknowledgement');
    expect(text()).toContain('check deployment');
    await act(async () => { pending[0].reject(new Error('Connection lost')); await flush(); });
    expect(draft()).toBe('');
    expect(text()).toContain('Connection lost');
    expect(text()).toContain('Check the agent transcript before resending');
    expect(text()).toContain('check deployment');
    await restoreRecovered();
    expect(draft()).toBe('check deployment');
    await tap('Send message to worker-a');
    expect(pending).toHaveLength(2);
    await act(async () => { pending[1].resolve({ accepted: false }); await flush(); });
    expect(draft()).toBe('');
    await restoreRecovered();
    expect(draft()).toBe('check deployment');
    await tap('Send message to worker-a');
    await act(async () => { pending[2].resolve({ accepted: true }); await flush(); });
    expect(draft()).toBe('');
    expect(text()).toContain('Message accepted by the machine');
  });

  test('switching agent and machine preserves isolated drafts; old ack cannot erase new edits', async () => {
    await render();
    await setDraft('agent A original');
    await tap('Send message to worker-a');
    agent = worker('worker-b');
    await render();
    expect(draft()).toBe('');
    await setDraft('agent B private');
    setHost('host-b', 'chat-b');
    agent = worker('worker-a');
    await render();
    expect(draft()).toBe('');
    await setDraft('host B private');
    setHost('host-a', 'chat-a');
    await render();
    expect(draft()).toBe('');
    expect(text()).toContain('agent A original');
    expect(text()).toContain('Waiting for machine acknowledgement');
    await setDraft('agent A revised while pending');
    await act(async () => { pending[0].resolve({ accepted: true }); await flush(); });
    expect(draft()).toBe('agent A revised while pending');
    agent = worker('worker-b');
    await render();
    expect(draft()).toBe('agent B private');
    setHost('host-b', 'chat-b');
    agent = worker('worker-a');
    await render();
    expect(draft()).toBe('host B private');
  });

  test('returning to an agent cannot duplicate an in-flight message; delivery errors survive remount', async () => {
    setHost('host-race', 'chat-race');
    await render();
    await setDraft('one remote request');
    await tap('Send message to worker-a');
    expect(pending).toHaveLength(1);

    agent = worker('worker-b');
    await render();
    agent = worker('worker-a');
    await render();
    expect(draft()).toBe('');
    expect(text()).toContain('one remote request');
    expect(text()).toContain('Waiting for machine acknowledgement');
    expect(findButton('Send message to worker-a').props.disabled).toBe(true);
    await tap('Send message to worker-a');
    expect(pending).toHaveLength(1);

    await act(async () => { pending[0].reject(new Error('Response lost')); await flush(); });
    expect(draft()).toBe('');
    expect(text()).toContain('Response lost');
    agent = worker('worker-b');
    await render();
    agent = worker('worker-a');
    await render();
    expect(text()).toContain('Check the agent transcript before resending');
    expect(text()).toContain('one remote request');
    await restoreRecovered();
    expect(draft()).toBe('one remote request');
    await tap('Send message to worker-a');
    expect(pending).toHaveLength(2);
    await act(async () => { pending[1].resolve({ accepted: true }); await flush(); });
    expect(draft()).toBe('');
  });

  test('stop/close wait for host acknowledgement, reject duplicates, and retain the agent on failure', async () => {
    await render();
    await tap('Stop');
    await tap('Close');
    expect(pending).toHaveLength(1);
    await act(async () => { pending[0].reject(new Error('Host offline')); await flush(); });
    expect(text()).toContain('Host offline');
    expect(dismissed).toHaveLength(0);
    await tap('Close');
    await tap('Stop');
    expect(pending).toHaveLength(2);
    await act(async () => { pending[1].resolve({ accepted: false }); await flush(); });
    expect(dismissed).toHaveLength(0);
    await tap('Close');
    await act(async () => { pending[2].resolve({ accepted: true }); await flush(); });
    expect(dismissed).toEqual(['worker-a']);
    expect(navigations).toBe(1);
  });

  test('without a selected chat, a message stays as a draft with clear guidance', async () => {
    setHost('host-c', '');
    await render();
    await setDraft('new chat needed');
    await tap('Send message to worker-a');
    expect(pending).toHaveLength(0);
    expect(text()).toContain('Open a chat on this machine');
    expect(draft()).toBe('new chat needed');
  });

  test('agent mailbox approvals reject duplicates and retain visible failures', async () => {
    mailItems = [{
      id: 'mail-1', fromSessionId: 'chat-other', toSessionId: 'chat-a',
      fromLabel: 'Peer', toLabel: 'Kory', status: 'pending_approval',
      subject: 'Review step', body: 'Approve requested change',
    }];
    await renderAgents();
    await tap('Agent messages');
    const approve = findButton('Approve agent message Review step');
    expect(approve.props.accessibilityRole).toBe('button');
    expect(approve.props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(44);
    const agentRow = findButton('Open agent worker-a, running');
    expect(agentRow?.props.accessibilityRole).toBe('button');
    expect(agentRow?.props.accessibilityState).toEqual({ selected: false });
    await tap('Approve agent message Review step');
    await tap('Approve agent message Review step');
    expect(pending).toHaveLength(1);
    expect(text()).toContain('Checking the desktop before updating this message');
    expect(pending[0].payload).toEqual({ messageId: 'mail-1', approved: true });
    await act(async () => { pending[0].reject(new Error('Permission denied')); await flush(); });
    expect(text()).toContain('Permission denied');
    expect(findButton('Approve agent message Review step')).toBeDefined();
    await tap('Decline agent message Review step');
    expect(pending).toHaveLength(1);
    expect(findButton('Decline agent message Review step').props.disabled).toBe(true);
    await tap('Review agent message Review step status');
    expect(text()).toContain('The desktop still shows this approval as pending');
    await tap('Allow agent message Review step decision retry after desktop review');
    expect(findButton('Decline agent message Review step').props.disabled).toBe(false);
    await tap('Decline agent message Review step');
    expect(pending).toHaveLength(2);
    expect(pending[1].payload).toEqual({ messageId: 'mail-1', approved: false });
    mailItems = [];
    await act(async () => { pending[1].resolve({ accepted: true }); await flush(); });
    expect(findButton('Approve agent message Review step')).toBeUndefined();
  });

  test('accepted agent-mail decisions stay locked when desktop still reports pending, including after remount', async () => {
    mailItems = [{
      id: 'mail-review-1', fromSessionId: 'chat-other', toSessionId: 'chat-a',
      fromLabel: 'Peer', toLabel: 'Kory', status: 'pending_approval',
      subject: 'Deploy service', body: 'Confirm deployment',
    }];
    await renderAgents();
    await tap('Agent messages');
    await tap('Approve agent message Deploy service');
    expect(pending).toHaveLength(1);
    await act(async () => { pending[0].resolve({ accepted: true }); await flush(); });
    const approve = findButton('Approve agent message Deploy service');
    expect(approve.props.disabled).toBe(true);
    await tap('Approve agent message Deploy service');
    expect(pending).toHaveLength(1);

    await act(async () => { tree!.unmount(); tree = null; await flush(); });
    await renderAgents();
    await tap('Agent messages');
    expect(findButton('Approve agent message Deploy service').props.disabled).toBe(true);
    await tap('Approve agent message Deploy service');
    expect(pending).toHaveLength(1);
    expect(text()).toContain('Check the desktop');
  });

  test('a verified terminal mailbox status releases the decision review lock', async () => {
    mailItems = [{
      id: 'mail-review-2', fromSessionId: 'chat-other', toSessionId: 'chat-a',
      fromLabel: 'Peer', toLabel: 'Kory', status: 'pending_approval',
      subject: 'Ship update', body: 'Confirm update',
    }];
    await renderAgents();
    await tap('Agent messages');
    await tap('Approve agent message Ship update');
    await act(async () => { pending[0].resolve({ accepted: true }); await flush(); });
    expect(findButton('Approve agent message Ship update').props.disabled).toBe(true);
    mailItems = [{ ...mailItems[0], status: 'delivered' }];
    await tap('Review agent message Ship update status');
    expect(findButton('Approve agent message Ship update')).toBeUndefined();
    expect(text()).toContain('delivered');
  });

  test('a malformed mailbox status cannot release an uncertain decision after remount', async () => {
    mailItems = [{
      id: 'mail-review-3', fromSessionId: 'chat-other', toSessionId: 'chat-a',
      fromLabel: 'Peer', toLabel: 'Kory', status: 'pending_approval',
      subject: 'Production switch', body: 'Apply change',
    }];
    await renderAgents();
    await tap('Agent messages');
    await tap('Approve agent message Production switch');
    expect(pending).toHaveLength(1);
    const validPending = { ...mailItems[0] };
    mailItems = [{ ...validPending, status: 'unrecognized' }];
    await act(async () => { pending[0].resolve({ accepted: true }); await flush(); });
    mailItems = [validPending];
    await act(async () => { tree!.unmount(); tree = null; await flush(); });
    await renderAgents();
    await tap('Agent messages');
    expect(findButton('Approve agent message Production switch').props.disabled).toBe(true);
    await tap('Approve agent message Production switch');
    expect(pending).toHaveLength(1);
  });

  test('mailbox readback failure after acceptance cannot unlock another decision', async () => {
    mailItems = [{
      id: 'mail-read-fail', fromSessionId: 'other', toSessionId: 'chat-a',
      fromLabel: 'Peer', toLabel: 'Kory', status: 'pending_approval',
      subject: 'Update tokens', body: 'Apply change',
    }];
    await renderAgents();
    await tap('Agent messages');
    await tap('Approve agent message Update tokens');
    failMailboxRead = true;
    await act(async () => { pending[0].resolve({ accepted: true }); await flush(); });
    expect(text()).toContain('Desktop mailbox unavailable');
    expect(findButton('Approve agent message Update tokens').props.disabled).toBe(true);
    failMailboxRead = false;
    await act(async () => { tree!.unmount(); tree = null; await flush(); });
    await renderAgents();
    await tap('Agent messages');
    expect(findButton('Approve agent message Update tokens').props.disabled).toBe(true);
  });

  test('failure to persist approval review prevents dispatch to the desktop', async () => {
    mailItems = [{
      id: 'mail-keychain-fail', fromSessionId: 'other', toSessionId: 'chat-a',
      fromLabel: 'Peer', toLabel: 'Kory', status: 'pending_approval',
      subject: 'Disable checks', body: 'Dangerous configuration',
    }];
    await renderAgents();
    await tap('Agent messages');
    failDecisionReviewSave = true;
    await tap('Approve agent message Disable checks');
    expect(pending).toHaveLength(0);
    expect(text()).toContain('Keychain write failed');
    expect(findButton('Approve agent message Disable checks').props.disabled).toBe(true);
  });

  test('decision locks belong to the exact host, project and chat across A-B-A switches', async () => {
    mailItems = [{
      id: 'mail-shared', fromSessionId: 'other', toSessionId: 'chat-a',
      fromLabel: 'Peer', toLabel: 'Kory', status: 'pending_approval',
      subject: 'Shared name', body: 'Review scope',
    }];
    setHost('machine-a', 'chat-a');
    await renderAgents();
    await tap('Agent messages');
    await tap('Approve agent message Shared name');
    await act(async () => { pending[0].resolve({ accepted: true }); await flush(); });
    expect(findButton('Approve agent message Shared name').props.disabled).toBe(true);

    setHost('machine-b', 'chat-a');
    await renderAgents();
    await tap('Agent messages');
    expect(findButton('Approve agent message Shared name').props.disabled).toBe(false);

    setHost('machine-a', 'chat-a');
    await renderAgents();
    await tap('Agent messages');
    expect(findButton('Approve agent message Shared name').props.disabled).toBe(true);
    expect(pending).toHaveLength(1);
  });

  test('a message resolved on desktop since the last poll is never approved again', async () => {
    mailItems = [{
      id: 'mail-already-done', fromSessionId: 'other', toSessionId: 'chat-a',
      fromLabel: 'Peer', toLabel: 'Kory', status: 'pending_approval',
      subject: 'Already handled', body: 'This changed on the desktop',
    }];
    await renderAgents();
    await tap('Agent messages');
    expect(findButton('Approve agent message Already handled').props.disabled).toBe(false);
    // This status changed on the desktop before the app's next scheduled poll.
    mailItems = [{ ...mailItems[0], status: 'declined' }];
    await tap('Approve agent message Already handled');
    expect(pending).toHaveLength(0);
    expect(findButton('Approve agent message Already handled')).toBeUndefined();
    expect(text()).toContain('declined');
  });

  test('a remount while Keychain save is pending cannot enable a second approval', async () => {
    mailItems = [{
      id: 'mail-persist-race', fromSessionId: 'other', toSessionId: 'chat-a',
      fromLabel: 'Peer', toLabel: 'Kory', status: 'pending_approval',
      subject: 'Deploy while navigating', body: 'Production action',
    }];
    let releaseSave!: () => void;
    pendingDecisionReviewSave = new Promise<void>((resolve) => { releaseSave = resolve; });
    await renderAgents();
    await tap('Agent messages');
    await tap('Approve agent message Deploy while navigating');
    expect(pending).toHaveLength(0); // Command waits for durable Keychain write.
    await act(async () => { tree!.unmount(); tree = null; await flush(); });
    await renderAgents();
    await tap('Agent messages');
    expect(findButton('Approve agent message Deploy while navigating').props.disabled).toBe(true);
    expect(text()).toContain('Check the desktop');
    await tap('Approve agent message Deploy while navigating');
    expect(pending).toHaveLength(0);
    await act(async () => { releaseSave(); await flush(); });
    pendingDecisionReviewSave = null;
    // The old screen cannot dispatch after it unmounted while storage was pending.
    expect(pending).toHaveLength(0);
  });
}
