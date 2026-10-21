import { afterEach, expect, mock, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';

if (process.env.KORY_NOTES_UI_CHILD !== '1') {
  test('notes UI: search and asynchronous note selection safety', () => {
    const child = spawnSync(process.execPath, ['test', import.meta.path], {
      env: { ...process.env, KORY_NOTES_UI_CHILD: '1' },
      encoding: 'utf8', timeout: 20_000,
    });
    if (child.error || child.status !== 0) {
      throw new Error(child.error?.message ?? `Notes UI tests failed (${child.status}):\n${child.stdout}\n${child.stderr}`);
    }
    expect(child.status).toBe(0);
  }, 25_000);
} else {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mock.module('react-native', () => ({
    View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
    StyleSheet: { create: (styles: unknown) => styles },
    Appearance: { getColorScheme: () => 'dark' },
  }));
  mock.module('lucide-react-native', () => Object.fromEntries([
    'ArchiveRestore', 'ChevronDown', 'ChevronLeft', 'ChevronRight', 'FileClock', 'FileDown',
    'FileUp', 'FileText', 'Folder', 'GitFork', 'ListChecks', 'LayoutGrid', 'MoreHorizontal',
    'Network', 'Paperclip', 'Plus', 'RefreshCw', 'Save', 'Settings2', 'Table2', 'Trash2', 'X',
  ].map((name) => [name, `Icon${name}`])));
  mock.module('../src/native/mobileFiles', () => ({
    pickFiles: async () => [], shareBytesFile: async () => {}, shareTextFile: async () => {},
  }));
  mock.module('../src/components/ui', () => ({
    ActionButton: (props: Record<string, unknown>) => React.createElement('ActionButton', props),
  }));
  mock.module('../src/components/NotesNetworkControlView', () => ({ NotesNetworkControlView: () => null }));
  mock.module('../src/components/NotesCanvasControlView', () => ({ NotesCanvasControlView: () => null }));
  const savedCreationReviews = new Map<string, { label: string }>();
  let reviewStorageReadFails = false;
  let reviewStorageWriteFails = false;
  mock.module('../src/control/settingActionReviewStorage', () => ({
    settingActionReviewStorage: {
      load: async (key: string) => {
        if (reviewStorageReadFails) throw new Error('Saved review unavailable');
        return savedCreationReviews.get(key) ?? null;
      },
      save: async (key: string, value: { label: string }) => {
        if (reviewStorageWriteFails) throw new Error('Cannot save review');
        savedCreationReviews.set(key, value);
      },
      clear: async (key: string) => { savedCreationReviews.delete(key); },
    },
  }));

  const note = (id: string) => ({
    id, title: id, content: '', folderPath: '/', pinned: false, includeInContext: false,
    format: 'markdown', tags: [], revision: 1,
  });
  const orphanedDraft = {
    id: 'draft-recover', noteId: 'deleted-note', baseRevision: 1, draftRevision: 3,
    baseTitle: 'Draft one', title: 'Draft one', contentBytes: 15,
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
    state: 'orphaned', content: 'Recovered words', folderPath: '/', tags: [],
    pinned: false, includeInContext: false, format: 'markdown',
  };
  let reviewDraft = { ...orphanedDraft };
  let failOriginalRead = false;
  const relationship = {
    fromId: 'note-a', toId: 'note-b', fromTitle: 'Note A', toTitle: 'Note B',
    type: 'supports', evidence: 'Evidence', revision: 3, status: 'proposed',
  };
  let showRelationship = false;
  let hostRelationshipStatus: 'proposed' | 'accepted' | 'rejected' = 'proposed';
  let deferReview = false;
  type Pending = { name: string; payload?: Record<string, unknown>; resolve: (value: any) => void; reject: (reason: unknown) => void };
  const requests: Pending[] = [];
  const calls: { name: string; payload?: Record<string, unknown> }[] = [];
  let deferredQueries = false;
  let deferredNotes = false;
  let deferredSaves = false;
  let deferredCreates = false;
  let deferredDiscards = false;
  let hostDiscardConfirmed = false;
  let confirmRecoverDiscardOnHost = false;
  let failRecoverDraftCheck = false;
  let hostRelationshipBeyondFirstPage = false;
  let noteReadback: ReturnType<typeof note> | null = null;
  let noteSaveResponse: { accepted: boolean; data?: unknown } | null = null;
  let testDesktopGeneration = 0;
  const control = {
    pairing: { baseUrl: 'https://test-machine.example', machineId: 'test-machine', machineName: 'Test desktop' },
    snapshot: { machine: { id: 'test-machine' }, activeProjectId: `project-${testDesktopGeneration}` },
    inspect: <T,>(name: string, payload?: Record<string, unknown>): Promise<T> => {
      calls.push({ name, payload });
      if ((name === 'notes.inspect' && deferredQueries && payload?.search !== '')
          || (name === 'notes.read' && deferredNotes)) {
        return new Promise((resolve, reject) => requests.push({ name, payload, resolve, reject }));
      }
      if (name === 'notes.inspect') return Promise.resolve({ notes: [note('Alpha'), note('Beta')] } as T);
      if (name === 'notes.read') {
        if (failOriginalRead) return Promise.reject(new Error('Desktop read unavailable'));
        return Promise.resolve((noteReadback ?? note(String(payload?.noteId))) as T);
      }
      if (name === 'notes.relationships') {
        if (!showRelationship) return Promise.resolve([] as T);
        if (payload?.noteId) {
          if (hostRelationshipBeyondFirstPage && !payload?.offset) {
            return Promise.resolve(Array.from({ length: 200 }, (_, index) => ({
              ...relationship, toId: `other-${index}`,
            })) as T);
          }
          return Promise.resolve([{ ...relationship, status: hostRelationshipStatus, revision: hostRelationshipStatus === 'proposed' ? 3 : 4 }] as T);
        }
        return Promise.resolve((hostRelationshipStatus === 'proposed' ? [relationship] : []) as T);
      }
      if (name === 'notes.drafts') {
        if (failRecoverDraftCheck && calls.some((call) => call.name === 'notes.draft_discard')) {
          return Promise.reject(new Error('Desktop draft list unavailable'));
        }
        return Promise.resolve((hostDiscardConfirmed ? [] : [reviewDraft]) as T);
      }
      if (name === 'notes.draft') return Promise.resolve(reviewDraft as T);
      throw new Error(`Unexpected inspection: ${name}`);
    },
    sendCommand: (name: string, payload?: Record<string, unknown>) => {
      calls.push({ name, payload });
      if (name === 'note.update' && deferredSaves) {
        return new Promise<{ accepted: boolean; data?: unknown }>((resolve, reject) => requests.push({ name, payload, resolve, reject }));
      }
      if (name === 'note.create' && deferredCreates) {
        return new Promise<{ accepted: boolean; data?: unknown }>((resolve, reject) => requests.push({ name, payload, resolve, reject }));
      }
      if (name === 'notes.draft_discard' && deferredDiscards) {
        return new Promise<{ accepted: boolean; data?: unknown }>((resolve, reject) => requests.push({ name, payload, resolve, reject }));
      }
      if (name === 'notes.draft_discard' && confirmRecoverDiscardOnHost) hostDiscardConfirmed = true;
      if (name === 'notes.relationship_review' && deferReview) {
        return new Promise<{ accepted: boolean; data?: unknown }>((resolve, reject) => requests.push({ name, payload, resolve, reject }));
      }
      return Promise.resolve(noteSaveResponse ?? { accepted: true });
    },
  };
  mock.module('../src/control/ControlProvider', () => ({ useControl: () => control }));
  const { NotesControlView } = await import('../src/components/NotesControlView');
  let tree: TestRenderer.ReactTestRenderer | null = null;
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const mount = async () => {
    control.snapshot.activeProjectId = `project-${testDesktopGeneration}`;
    await act(async () => { tree = TestRenderer.create(<NotesControlView />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 7)); await flush(); });
  };
  const remount = async () => {
    await act(async () => { tree?.unmount(); tree = null; });
    await mount();
  };
  const search = () => tree!.root.findAllByType('TextInput' as any)
    .find((node) => node.props.placeholder === 'Search notes')!;
  const writeSearch = async (value: string) => {
    await act(async () => { search().props.onChangeText(value); await flush(); });
  };
  const submitSearch = async () => {
    await act(async () => { search().props.onSubmitEditing(); await flush(); });
  };
  const clickNote = async (id: string) => {
    const row = tree!.root.findAllByType('Pressable' as any).find((element) =>
      element.findAllByType('Text' as any).some((node) => node.children.join('') === id));
    expect(row).toBeDefined();
    await act(async () => { row!.props.onPress(); await flush(); });
  };
  const action = (label: string) => tree!.root.findAllByType('ActionButton' as any)
    .find((node) => node.props.label === label)!;
  const createButton = () => tree!.root.findAllByType('Pressable' as any)
    .find((element) => element.props.accessibilityLabel === 'New note')!;
  const noteBody = () => tree!.root.findAllByType('TextInput' as any)
    .find((node) => node.props.placeholder === 'Write a note');
  const writeBody = async (value: string) => {
    expect(noteBody()).toBeDefined();
    await act(async () => { noteBody()!.props.onChangeText(value); await flush(); });
  };
  const clickBack = async () => {
    const back = tree!.root.findAllByType('Pressable' as any).find((element) =>
      element.findAllByType('Text' as any).some((node) => node.children.join('') === 'Notes'));
    expect(back).toBeDefined();
    await act(async () => { back!.props.onPress(); await flush(); });
  };
  const openRecovery = async () => {
    const menu = tree!.root.findAllByType('Pressable' as any)
      .find((element) => element.props.accessibilityLabel === 'More note tools')!;
    await act(async () => { menu.props.onPress(); await flush(); });
    const review = tree!.root.findAllByType('Pressable' as any)
      .find((element) => element.findAllByType('Text' as any)
        .some((label) => label.children.join('') === 'Review'))!;
    await act(async () => { review.props.onPress(); await flush(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 7)); await flush(); });
    expect(action('Recover')).toBeDefined();
  };
  const resolve = async (key: string, response: unknown) => {
    const request = requests.find((entry) =>
      String(entry.payload?.search ?? entry.payload?.noteId) === key);
    expect(request).toBeDefined();
    await act(async () => { request!.resolve(response); await flush(); });
  };
  const resolveCreate = async (response: unknown) => {
    const request = requests.find((entry) => entry.name === 'note.create');
    expect(request).toBeDefined();
    await act(async () => { request!.resolve(response); await flush(); });
  };
  const rejectCreate = async (reason: unknown) => {
    const request = requests.find((entry) => entry.name === 'note.create');
    expect(request).toBeDefined();
    await act(async () => { request!.reject(reason); await flush(); });
  };
  const resolveDiscard = async (response: unknown) => {
    const request = requests.find((entry) => entry.name === 'notes.draft_discard');
    expect(request).toBeDefined();
    await act(async () => { request!.resolve(response); await flush(); });
  };
  const resolveReview = async (response: unknown) => {
    const request = requests.find((entry) => entry.name === 'notes.relationship_review');
    expect(request).toBeDefined();
    await act(async () => { request!.resolve(response); await flush(); });
  };

  afterEach(async () => {
    if (tree) await act(async () => { tree!.unmount(); });
    testDesktopGeneration += 1;
    savedCreationReviews.clear();
    reviewStorageReadFails = false;
    reviewStorageWriteFails = false;
    tree = null; requests.length = 0; calls.length = 0;
    deferredQueries = false; deferredNotes = false; deferredSaves = false; deferredCreates = false;
    deferredDiscards = false; hostDiscardConfirmed = false;
    confirmRecoverDiscardOnHost = false; failRecoverDraftCheck = false;
    hostRelationshipBeyondFirstPage = false;
    reviewDraft = { ...orphanedDraft }; failOriginalRead = false;
    showRelationship = false; hostRelationshipStatus = 'proposed'; deferReview = false;
    noteReadback = null; noteSaveResponse = null;
  });

  test('typing does not issue an unfiltered notes request or erase results', async () => {
    await mount();
    expect(calls.filter((call) => call.name === 'notes.inspect')).toHaveLength(1);
    await writeSearch('report');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 7)); await flush(); });
    expect(calls.filter((call) => call.name === 'notes.inspect')).toHaveLength(1);
    expect(search().props.value).toBe('report');
    await submitSearch();
    expect(calls.filter((call) => call.name === 'notes.inspect').map((call) => call.payload?.search))
      .toEqual(['', 'report']);
  });

  test('rapid New note taps dispatch once and expose pending feedback until the created note opens', async () => {
    await mount();
    deferredCreates = true;
    await act(async () => {
      createButton().props.onPress();
      createButton().props.onPress();
      await flush();
    });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
    expect(createButton().props.disabled).toBe(true);
    expect(createButton().props.accessibilityState?.busy).toBe(true);
    expect(tree!.root.findAllByType('Text' as any)
      .some((element) => element.children.join('') === 'Creating note…')).toBe(true);
    await resolveCreate({ accepted: true, data: note('Created') });
    expect(tree!.root.findAllByType('TextInput' as any)
      .find((element) => element.props.placeholder === 'Title')?.props.value).toBe('Created');
  });

  test('a rejected New note request unlocks the button and reports failure without navigating', async () => {
    await mount();
    deferredCreates = true;
    await act(async () => { createButton().props.onPress(); await flush(); });
    await resolveCreate({ accepted: false });
    expect(createButton().props.disabled).toBe(false);
    expect(tree!.root.findAllByType('Text' as any)
      .some((element) => element.children.join('').includes('did not accept'))).toBe(true);
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
  });

  test('a late New note response does not navigate away from another note opened while waiting', async () => {
    await mount();
    deferredCreates = true;
    await act(async () => { createButton().props.onPress(); await flush(); });
    await clickNote('Beta');
    await resolveCreate({ accepted: true, data: note('Created') });
    expect(tree!.root.findAllByType('TextInput' as any)
      .find((element) => element.props.placeholder === 'Title')?.props.value).toBe('Beta');
  });

  test('an accepted New note without its identity explains the uncertain result without creating twice', async () => {
    await mount();
    deferredCreates = true;
    await act(async () => { createButton().props.onPress(); await flush(); });
    await resolveCreate({ accepted: true });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
    expect(tree!.root.findAllByType('Text' as any)
      .some((element) => element.children.join('').includes('Check the notes list'))).toBe(true);
    expect(tree!.root.findAllByType('TextInput' as any)
      .some((element) => element.props.placeholder === 'Title')).toBe(false);
    expect(createButton().props.disabled).toBe(true);
    await act(async () => { createButton().props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
    expect(action('Checked list — allow another')).toBeDefined();
    await act(async () => { action('Checked list — allow another').props.onPress(); await flush(); });
    expect(createButton().props.disabled).toBe(false);
  });

  test('a lost New note response remains uncertain and cannot silently submit a duplicate', async () => {
    await mount();
    deferredCreates = true;
    await act(async () => { createButton().props.onPress(); await flush(); });
    await rejectCreate(new Error('Connection interrupted after request'));
    expect(createButton().props.disabled).toBe(true);
    expect(tree!.root.findAllByType('Text' as any)
      .some((element) => element.children.join('').includes('may have been created'))).toBe(true);
    await act(async () => { createButton().props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
  });

  test('an uncertain New note stays blocked after leaving and returning to the screen', async () => {
    await mount();
    deferredCreates = true;
    await act(async () => { createButton().props.onPress(); await flush(); });
    await rejectCreate(new Error('Network interrupted after creation'));
    expect(savedCreationReviews.size).toBe(1);

    await remount();
    expect(createButton().props.disabled).toBe(true);
    await act(async () => { createButton().props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
    expect(action('Checked list — allow another').props.disabled).toBe(true);
    await act(async () => { action('Refresh notes').props.onPress(); await flush(); });
    expect(action('Checked list — allow another').props.disabled).toBe(false);
    await act(async () => { action('Checked list — allow another').props.onPress(); await flush(); });
    expect(savedCreationReviews.size).toBe(0);
    expect(createButton().props.disabled).toBe(false);
  });

  test('a pending New note is saved before network send and survives a route remount', async () => {
    await mount();
    deferredCreates = true;
    await act(async () => { createButton().props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
    expect(savedCreationReviews.size).toBe(1);
    await remount();
    expect(createButton().props.disabled).toBe(true);
    await act(async () => { createButton().props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
  });

  test('New note cannot reach the desktop if saved review storage is unavailable', async () => {
    reviewStorageWriteFails = true;
    await mount();
    await act(async () => { createButton().props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(0);
    expect(createButton().props.disabled).toBe(true);
  });

  test('a new note with a known ID but failed editor read cannot be silently created again', async () => {
    await mount();
    noteSaveResponse = { accepted: true, data: note('Created') };
    failOriginalRead = true;
    await act(async () => { createButton().props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
    expect(createButton().props.disabled).toBe(true);
    expect(tree!.root.findAllByType('Text' as any)
      .some((node) => node.children.join('').includes('created, but could not be opened'))).toBe(true);
    await act(async () => { createButton().props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
  });

  test('a note readback returning another ID must not open a different note', async () => {
    await mount();
    noteReadback = note('Wrong');
    await clickNote('Alpha');
    expect(tree!.root.findAllByType('TextInput' as any)
      .some((node) => node.props.placeholder === 'Title')).toBe(false);
    expect(tree!.root.findAllByType('Text' as any)
      .some((node) => node.children.join('').includes('does not match'))).toBe(true);
  });

  test('rapid Recover taps on an orphaned draft create only one copy', async () => {
    await mount();
    await openRecovery();
    deferredCreates = true;
    await act(async () => {
      action('Recover').props.onPress();
      action('Recover').props.onPress();
      await flush();
    });
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(1);
    expect(action('Recover').props.disabled).toBe(true);
    await resolveCreate({ accepted: false });
    expect(action('Recover').props.disabled).toBe(false);
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(0);
  });

  test('an unverified recovered copy cannot discard the only draft', async () => {
    await mount();
    await openRecovery();
    deferredCreates = true;
    await act(async () => { action('Recover').props.onPress(); await flush(); });
    await resolveCreate({ accepted: true, data: { ...note('Created'), id: '' } });
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(0);
    expect(action('Recover').props.disabled).toBe(true);
    expect(action('Checked list — allow another')).toBeDefined();
  });

  test('a recovered copy with mismatched host content retains the original draft', async () => {
    await mount();
    await openRecovery();
    deferredCreates = true;
    await act(async () => { action('Recover').props.onPress(); await flush(); });
    await resolveCreate({ accepted: true, data: { ...note('Created'), title: 'Draft one (recovered)', content: 'Recovered words' } });
    expect(calls.filter((call) => call.name === 'notes.read')).toHaveLength(1);
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(0);
    expect(action('Recover').props.disabled).toBe(true);
  });

  test('a host-verified recovered copy discards its draft only after the matching readback', async () => {
    await mount();
    await openRecovery();
    confirmRecoverDiscardOnHost = true;
    noteReadback = { ...note('Created'), title: 'Draft one (recovered)', content: 'Recovered words' };
    noteSaveResponse = { accepted: true, data: noteReadback };
    await act(async () => { action('Recover').props.onPress(); await flush(); });
    const verificationIndex = calls.findIndex((call) => call.name === 'notes.read' && call.payload?.noteId === 'Created');
    const discardIndex = calls.findIndex((call) => call.name === 'notes.draft_discard');
    expect(verificationIndex).toBeGreaterThan(-1);
    expect(discardIndex).toBeGreaterThan(verificationIndex);
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(1);
    expect(calls.filter((call) => call.name === 'notes.drafts')).toHaveLength(2);
    await clickBack();
    expect(createButton().props.disabled).toBe(false);
    expect(action('Checked list — allow another')).toBeUndefined();
    expect(tree!.root.findAllByType('TextInput' as any)
      .find((element) => element.props.placeholder === 'Search notes')).toBeDefined();
  });

  test('accepted recovery discard with retained host draft keeps the recovered note and review lock', async () => {
    await mount();
    await openRecovery();
    noteReadback = { ...note('Created'), title: 'Draft one (recovered)', content: 'Recovered words' };
    noteSaveResponse = { accepted: true, data: noteReadback };
    await act(async () => { action('Recover').props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'notes.drafts')).toHaveLength(2);
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(1);
    expect(tree!.root.findAllByType('TextInput' as any)
      .find((element) => element.props.placeholder === 'Title')?.props.value).toBe('Draft one (recovered)');
    await clickBack();
    expect(createButton().props.disabled).toBe(true);
    expect(action('Checked list — allow another')).toBeDefined();
  });

  test('inaccessible draft list after recovered copy cannot be mistaken for confirmed discard', async () => {
    await mount();
    await openRecovery();
    failRecoverDraftCheck = true;
    noteReadback = { ...note('Created'), title: 'Draft one (recovered)', content: 'Recovered words' };
    noteSaveResponse = { accepted: true, data: noteReadback };
    await act(async () => { action('Recover').props.onPress(); await flush(); });
    await clickBack();
    expect(createButton().props.disabled).toBe(true);
  });

  test('a recoverable draft with a failed host read does not create an unwanted copy', async () => {
    reviewDraft = { ...orphanedDraft, state: 'recoverable' };
    failOriginalRead = true;
    await mount();
    await openRecovery();
    await act(async () => { action('Recover').props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'notes.read')).toHaveLength(1);
    expect(calls.filter((call) => call.name === 'note.create')).toHaveLength(0);
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(0);
    expect(action('Recover').props.disabled).toBe(false);
  });

  test('saving a recoverable draft requires independent confirmation before releasing recovery review', async () => {
    reviewDraft = { ...orphanedDraft, noteId: 'Alpha', state: 'recoverable' };
    await mount();
    await openRecovery();
    await act(async () => { action('Recover').props.onPress(); await flush(); });
    noteSaveResponse = {
      accepted: true,
      data: { ...note('Alpha'), title: 'Draft one', content: 'Recovered words', revision: 2 },
    };
    await act(async () => { action('Save').props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(1);
    expect(calls.filter((call) => call.name === 'notes.drafts')).toHaveLength(2);
    await clickBack();
    expect(createButton().props.disabled).toBe(true);
    expect(action('Checked list — allow another')).toBeDefined();
  });

  test('saving a recoverable draft confirmed absent on desktop releases recovery review', async () => {
    reviewDraft = { ...orphanedDraft, noteId: 'Alpha', state: 'recoverable' };
    await mount();
    await openRecovery();
    await act(async () => { action('Recover').props.onPress(); await flush(); });
    confirmRecoverDiscardOnHost = true;
    noteSaveResponse = {
      accepted: true,
      data: { ...note('Alpha'), title: 'Draft one', content: 'Recovered words', revision: 2 },
    };
    await act(async () => { action('Save').props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'notes.drafts')).toHaveLength(2);
    await clickBack();
    expect(createButton().props.disabled).toBe(false);
    expect(action('Checked list — allow another')).toBeUndefined();
  });

  test('Discard from the recovery list requires an explicit second action', async () => {
    await mount();
    await openRecovery();
    await act(async () => { action('Discard').props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(0);
    expect(action('Confirm discard')).toBeDefined();
    await act(async () => { action('Keep draft').props.onPress(); await flush(); });
    expect(action('Confirm discard')).toBeUndefined();
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(0);
  });

  test('confirmed Discard sends once then waits for a matching desktop draft-list readback', async () => {
    await mount();
    await openRecovery();
    deferredDiscards = true;
    await act(async () => { action('Discard').props.onPress(); await flush(); });
    await act(async () => {
      action('Confirm discard').props.onPress();
      action('Confirm discard').props.onPress();
      await flush();
    });
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(1);
    expect(action('Confirm discard').props.disabled).toBe(true);
    await resolveDiscard({ accepted: true });
    expect(action('Check host')).toBeDefined();
    expect(action('Confirm discard')).toBeUndefined();
    expect(calls.filter((call) => call.name === 'notes.draft_discard')).toHaveLength(1);
    hostDiscardConfirmed = true;
    await act(async () => { action('Check host').props.onPress(); await flush(); });
    expect(action('Check host')).toBeUndefined();
    expect(action('Recover')).toBeUndefined();
  });

  test('explicitly rejected draft discard preserves the draft and offers a controlled retry', async () => {
    await mount();
    await openRecovery();
    deferredDiscards = true;
    await act(async () => { action('Discard').props.onPress(); await flush(); });
    await act(async () => { action('Confirm discard').props.onPress(); await flush(); });
    await resolveDiscard({ accepted: false });
    expect(action('Recover')).toBeDefined();
    expect(action('Confirm discard').props.disabled).toBe(false);
    expect(tree!.root.findAllByType('Text' as any)
      .some((element) => element.children.join('').includes('did not accept'))).toBe(true);
  });

  test('relationship Accept double-tap submits only once and waits for host confirmation', async () => {
    showRelationship = true;
    await mount();
    await openRecovery();
    deferReview = true;
    await act(async () => {
      action('Accept').props.onPress();
      action('Accept').props.onPress();
      action('Reject').props.onPress();
      await flush();
    });
    expect(calls.filter((call) => call.name === 'notes.relationship_review')).toHaveLength(1);
    expect(action('Accept').props.disabled).toBe(true);
    expect(action('Reject').props.disabled).toBe(true);
    await resolveReview({ accepted: true, data: { ...relationship, revision: 4, status: 'accepted' } });
    expect(action('Check relationship')).toBeDefined();
    expect(action('Accept').props.disabled).toBe(true);
    expect(calls.filter((call) => call.name === 'notes.relationship_review')).toHaveLength(1);
    hostRelationshipStatus = 'accepted';
    await act(async () => { action('Check relationship').props.onPress(); await flush(); });
    expect(action('Accept')).toBeUndefined();
    expect(action('Check relationship')).toBeUndefined();
  });

  test('relationship confirmation finds the exact host record after the first full page', async () => {
    showRelationship = true;
    hostRelationshipBeyondFirstPage = true;
    await mount();
    await openRecovery();
    deferReview = true;
    await act(async () => { action('Accept').props.onPress(); await flush(); });
    hostRelationshipStatus = 'accepted';
    await resolveReview({ accepted: true });
    expect(calls.filter((call) => call.name === 'notes.relationships' && call.payload?.offset === 200)).toHaveLength(1);
    expect(action('Accept')).toBeUndefined();
  });

  test('explicitly rejected relationship decision leaves choices available and reports the denial', async () => {
    showRelationship = true;
    await mount();
    await openRecovery();
    deferReview = true;
    await act(async () => { action('Reject').props.onPress(); await flush(); });
    await resolveReview({ accepted: false });
    expect(action('Accept').props.disabled).toBe(false);
    expect(action('Reject').props.disabled).toBe(false);
    expect(tree!.root.findAllByType('Text' as any)
      .some((element) => element.children.join('').includes('did not accept'))).toBe(true);
  });

  test('a relationship host read with the wrong final status cannot clear the uncertain action', async () => {
    showRelationship = true;
    await mount();
    await openRecovery();
    deferReview = true;
    await act(async () => { action('Accept').props.onPress(); await flush(); });
    await resolveReview({ accepted: true });
    hostRelationshipStatus = 'rejected';
    await act(async () => { action('Check relationship').props.onPress(); await flush(); });
    expect(action('Check relationship')).toBeDefined();
    expect(action('Accept').props.disabled).toBe(true);
    expect(calls.filter((call) => call.name === 'notes.relationship_review')).toHaveLength(1);
  });

  test('Notes navigation and editor options expose 44-point targets and selection state', async () => {
    await mount();
    const newNote = createButton();
    expect(newNote.props.accessibilityRole).toBe('button');
    expect(newNote.props.style({ pressed: false })[0]).toMatchObject({ width: 44, height: 44 });
    const moreTools = tree!.root.findAllByType('Pressable' as any)
      .find((node) => node.props.accessibilityLabel === 'More note tools')!;
    expect(moreTools.props.accessibilityState.expanded).toBe(false);
    await clickNote('Alpha');
    const options = () => tree!.root.findAllByType('Pressable' as any)
      .find((node) => node.findAllByType('Text' as any)
        .some((label) => label.children.join('') === 'Options'))!;
    expect(options().props.accessibilityRole).toBe('button');
    expect(options().props.accessibilityState.expanded).toBe(false);
    expect(options().props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(44);
    await act(async () => { options().props.onPress(); await flush(); });
    expect(options().props.accessibilityState.expanded).toBe(true);
    const markdown = tree!.root.findAllByType('Pressable' as any)
      .find((node) => node.findAllByType('Text' as any)
        .some((label) => label.children.join('') === 'Markdown'))!;
    expect(markdown.props.accessibilityRole).toBe('radio');
    expect(markdown.props.accessibilityState.checked).toBe(true);
    expect(markdown.props.style({ pressed: false })[0].minHeight).toBeGreaterThanOrEqual(44);
  });

  test('a slow older search cannot overwrite the most recently submitted results', async () => {
    await mount();
    deferredQueries = true;
    await writeSearch('Alpha');
    await submitSearch();
    await writeSearch('Beta');
    await submitSearch();
    await resolve('Beta', { notes: [note('Beta')] });
    await resolve('Alpha', { notes: [note('Alpha')] });
    expect(tree!.root.findAllByType('Text' as any)
      .some((element) => element.children.join('') === 'Beta')).toBe(true);
    expect(tree!.root.findAllByType('Text' as any)
      .some((element) => element.children.join('') === 'Alpha')).toBe(false);
  });

  test('a late old note read cannot replace the note opened afterward', async () => {
    deferredNotes = true;
    await mount();
    await clickNote('Alpha');
    await clickNote('Beta');
    await resolve('Beta', note('Beta'));
    await resolve('Alpha', note('Alpha'));
    const editorTitle = tree!.root.findAllByType('TextInput' as any)
      .find((element) => element.props.placeholder === 'Title');
    expect(editorTitle?.props.value).toBe('Beta');
  });

  test('a late save cannot reopen an editor after leaving for the notes list', async () => {
    await mount();
    await clickNote('Alpha');
    deferredSaves = true;
    await act(async () => { action('Save').props.onPress(); await flush(); });
    await clickBack();
    expect(action('Discard edits')).toBeDefined();
    await act(async () => { action('Discard edits').props.onPress(); await flush(); });
    await resolve('Alpha', { accepted: true, data: { ...note('Alpha'), revision: 2 } });
    expect(tree!.root.findAllByType('TextInput' as any)
      .some((element) => element.props.placeholder === 'Title')).toBe(false);
  });

  test('a late save from note A cannot replace note B opened afterward', async () => {
    await mount();
    await clickNote('Alpha');
    deferredSaves = true;
    await act(async () => { action('Save').props.onPress(); await flush(); });
    await clickBack();
    expect(action('Discard edits')).toBeDefined();
    await act(async () => { action('Discard edits').props.onPress(); await flush(); });
    await clickNote('Beta');
    await resolve('Alpha', { accepted: true, data: { ...note('Alpha'), revision: 2 } });
    expect(tree!.root.findAllByType('TextInput' as any)
      .find((element) => element.props.placeholder === 'Title')?.props.value).toBe('Beta');
  });

  test('pressing Save twice in one tick sends only one note mutation', async () => {
    await mount();
    await clickNote('Alpha');
    deferredSaves = true;
    await act(async () => {
      action('Save').props.onPress();
      action('Save').props.onPress();
      await flush();
    });
    expect(calls.filter((call) => call.name === 'note.update')).toHaveLength(1);
  });

  test('Back with unsaved edits requires explicit discard and retains the draft until confirmed', async () => {
    await mount();
    await clickNote('Alpha');
    await writeBody('Do not lose this draft');
    await clickBack();
    expect(noteBody()?.props.value).toBe('Do not lose this draft');
    expect(action('Discard edits')).toBeDefined();
    await act(async () => { action('Keep editing').props.onPress(); await flush(); });
    expect(noteBody()?.props.value).toBe('Do not lose this draft');
    await clickBack();
    await act(async () => { action('Discard edits').props.onPress(); await flush(); });
    expect(noteBody()).toBeUndefined();
  });

  test('newer edits made during an in-flight Save still require confirmation to leave', async () => {
    await mount();
    await clickNote('Alpha');
    await writeBody('First submitted revision');
    deferredSaves = true;
    await act(async () => { action('Save').props.onPress(); await flush(); });
    await writeBody('Second unsaved revision');
    await resolve('Alpha', { accepted: true, data: { ...note('Alpha'), content: 'First submitted revision', revision: 2 } });
    await clickBack();
    expect(noteBody()?.props.value).toBe('Second unsaved revision');
    expect(action('Discard edits')).toBeDefined();
  });

  test('Back on an unchanged note still closes immediately', async () => {
    await mount();
    await clickNote('Beta');
    await clickBack();
    expect(noteBody()).toBeUndefined();
  });

  test('accepted Save without a returned note stays pending until authoritative readback confirms the exact edit', async () => {
    await mount();
    await clickNote('Alpha');
    await writeBody('Keep this until the desktop confirms it');
    await act(async () => { action('Save').props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'notes.read')).toHaveLength(2);
    expect(action('Save').props.disabled).toBe(true);
    expect(action('Check host')).toBeDefined();
    expect(noteBody()?.props.value).toBe('Keep this until the desktop confirms it');
    await act(async () => { action('Save').props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.update')).toHaveLength(1);

    noteReadback = { ...note('Alpha'), content: 'Keep this until the desktop confirms it', revision: 2 };
    await act(async () => { action('Check host').props.onPress(); await flush(); });
    expect(action('Check host')).toBeUndefined();
    expect(action('Save').props.disabled).toBe(false);
    await clickBack();
    expect(noteBody()).toBeUndefined();
  });

  test('an accepted Save with matching text but unchanged revision must remain unverified', async () => {
    await mount();
    await clickNote('Alpha');
    await writeBody('Text may already exist, but revision did not advance');
    noteReadback = { ...note('Alpha'), content: 'Text may already exist, but revision did not advance' };
    await act(async () => { action('Save').props.onPress(); await flush(); });
    expect(action('Check host')).toBeDefined();
    expect(action('Save').props.disabled).toBe(true);
  });

  test('an accepted Save with returned stale revision remains pending and prevents duplicate writes', async () => {
    await mount();
    await clickNote('Alpha');
    await writeBody('New text needs a new desktop revision');
    noteSaveResponse = {
      accepted: true,
      data: { ...note('Alpha'), content: 'New text needs a new desktop revision' },
    };
    await act(async () => { action('Save').props.onPress(); await flush(); });
    expect(action('Check host')).toBeDefined();
    expect(action('Save').props.disabled).toBe(true);
    expect(noteBody()?.props.value).toBe('New text needs a new desktop revision');
    await act(async () => { action('Save').props.onPress(); await flush(); });
    expect(calls.filter((call) => call.name === 'note.update')).toHaveLength(1);
  });

  test('an accepted Save with returned revision but wrong content stays unconfirmed', async () => {
    await mount();
    await clickNote('Alpha');
    await writeBody('This exact payload matters');
    noteSaveResponse = {
      accepted: true,
      data: { ...note('Alpha'), content: 'A different note was saved', revision: 2 },
    };
    await act(async () => { action('Save').props.onPress(); await flush(); });
    expect(action('Check host')).toBeDefined();
    expect(action('Save').props.disabled).toBe(true);
    expect(noteBody()?.props.value).toBe('This exact payload matters');
  });

  test('a rejected Save explicitly reports failure and preserves the unsaved content', async () => {
    await mount();
    await clickNote('Alpha');
    await writeBody('Unsent draft');
    noteSaveResponse = { accepted: false };
    await act(async () => { action('Save').props.onPress(); await flush(); });
    expect(noteBody()?.props.value).toBe('Unsent draft');
    expect(tree!.root.findAllByType('Text' as any)
      .some((element) => element.children.join('').includes('did not accept'))).toBe(true);
  });
}
