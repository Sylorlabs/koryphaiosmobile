import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  FileDiff,
  FlaskConical,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type {
  AgentPreferencesInspection,
  BundledSkillComparison,
  HarnessQualificationRecord,
  ResponseStyleInspection,
  SkillConversionPreview,
  SkillDocumentSpec,
  SkillEvaluationCard,
  SkillHealthRecord,
  SkillResolutionPreview,
  SkillRevision,
  SkillRevisionComparison,
  SkillWorkspaceInspection,
} from '../types/control';
import { ActionButton, Eyebrow } from './ui';

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function skillKey(skill: Pick<SkillRevision, 'source' | 'name' | 'state'>): string {
  return `${skill.source}:${skill.name}:${skill.state}`;
}

function normalizeSkillName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function AgentPreferencesView() {
  const { inspect, sendCommand } = useControl();
  const [loaded, setLoaded] = useState<AgentPreferencesInspection | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const next = await inspect<AgentPreferencesInspection>('agent.preferences.inspect');
      setLoaded(next);
      setDraft(next.content ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load preferences');
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const save = async () => {
    if (busy) return;
    setBusy('save');
    setError('');
    try {
      await sendCommand('agent.preferences.save', { content: draft });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save preferences');
    } finally {
      setBusy('');
    }
  };

  const initialize = async () => {
    if (busy) return;
    setBusy('init');
    setError('');
    try {
      await sendCommand('agent.preferences.init');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not initialize preferences');
    } finally {
      setBusy('');
    }
  };

  const dirty = loaded ? draft !== loaded.content : false;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loaded ? (
        <>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Project preferences</Text>
              <Text numberOfLines={2} style={styles.subtle}>
                {loaded.path || 'Stored on the host project'}
              </Text>
            </View>
            <ActionButton
              label="Save"
              icon={Save}
              primary
              loading={busy === 'save'}
              disabled={!dirty || Boolean(busy)}
              onPress={() => void save()}
            />
          </View>
          {!loaded.exists ? (
            <View style={styles.inlineNotice}>
              <Text style={styles.subtle}>No preferences file exists for this project yet.</Text>
              <ActionButton
                label="Create from template"
                icon={Sparkles}
                loading={busy === 'init'}
                disabled={Boolean(busy)}
                onPress={() => void initialize()}
              />
            </View>
          ) : null}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            placeholder="Project-specific guidance for Kory and its agents"
            placeholderTextColor={colors.textMuted}
            style={styles.editor}
          />
          <View style={styles.footerActions}>
            <ActionButton
              label="Revert edits"
              icon={RotateCcw}
              disabled={!dirty || Boolean(busy)}
              onPress={() => setDraft(loaded.content)}
            />
            <ActionButton label="Reload" icon={RefreshCw} disabled={Boolean(busy)} onPress={() => void load()} />
          </View>
        </>
      ) : (
        <Text style={styles.empty}>Loading preferences…</Text>
      )}
    </ScrollView>
  );
}

export function ResponseStyleControlView() {
  const { inspect, sendCommand } = useControl();
  const [loaded, setLoaded] = useState<ResponseStyleInspection | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const next = await inspect<ResponseStyleInspection>('response_style.inspect');
      setLoaded(next);
      setDraft(next.instructions ?? '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load response style');
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const save = async () => {
    if (busy) return;
    setBusy('save');
    setError('');
    try {
      await sendCommand('response_style.save', { instructions: draft });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save response style');
    } finally {
      setBusy('');
    }
  };

  const reset = async () => {
    if (busy) return;
    setBusy('reset');
    setError('');
    try {
      await sendCommand('response_style.reset');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset response style');
    } finally {
      setBusy('');
    }
  };

  const dirty = loaded ? draft !== loaded.instructions : false;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loaded ? (
        <>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Response style</Text>
              <Text numberOfLines={2} style={styles.subtle}>
                {loaded.path || 'Personal response style on the host'}
              </Text>
            </View>
            <ActionButton
              label="Save"
              icon={Save}
              primary
              loading={busy === 'save'}
              disabled={!dirty || Boolean(busy)}
              onPress={() => void save()}
            />
          </View>
          {!loaded.valid && loaded.errors.length ? (
            <View style={styles.inlineNotice}>
              {loaded.errors.map((message) => (
                <Text key={message} style={styles.error}>{message}</Text>
              ))}
            </View>
          ) : null}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            placeholder="How Kory should write responses"
            placeholderTextColor={colors.textMuted}
            style={styles.editor}
          />
          <View style={styles.footerActions}>
            <ActionButton
              label="Revert edits"
              icon={RotateCcw}
              disabled={!dirty || Boolean(busy)}
              onPress={() => setDraft(loaded.instructions)}
            />
            <ActionButton
              label="Reset default"
              icon={RefreshCw}
              loading={busy === 'reset'}
              disabled={Boolean(busy)}
              onPress={() => void reset()}
            />
          </View>
        </>
      ) : (
        <Text style={styles.empty}>Loading response style…</Text>
      )}
    </ScrollView>
  );
}

type SkillScreen = 'library' | 'detail' | 'create' | 'routing' | 'comparison' | 'bundled' | 'convert';

type SkillCreatorState = {
  source: 'personal' | 'project';
  name: string;
  description: string;
  instructions: string;
  domains: string;
  activation: string;
  shouldTrigger: string;
  shouldNotTrigger: string;
  evidence: string;
  broader: string;
  facets: string;
  requires: string;
  conflicts: string;
  excludes: string;
  targetMedia: string;
  depth: string;
  contextBudget: string;
};

const EMPTY_CREATOR: SkillCreatorState = {
  source: 'personal',
  name: '',
  description: '',
  instructions: '',
  domains: '',
  activation: '',
  shouldTrigger: '',
  shouldNotTrigger: '',
  evidence: '',
  broader: '',
  facets: '',
  requires: '',
  conflicts: '',
  excludes: '',
  targetMedia: 'any',
  depth: '0',
  contextBudget: '4000',
};

const DOCUMENT_FORMATS: { label: string; value: SkillDocumentSpec }[] = [
  {
    label: 'Markdown',
    value: { kind: 'markdown', extension: '.md', renderer: 'markdown', mediaType: 'text/markdown' },
  },
  {
    label: 'Text',
    value: { kind: 'text', extension: '.txt', renderer: 'plain', mediaType: 'text/plain' },
  },
  {
    label: 'HTML',
    value: { kind: 'html', extension: '.html', renderer: 'html', mediaType: 'text/html' },
  },
];

export function SkillsControlView() {
  const { inspect, sendCommand } = useControl();
  const [inspection, setInspection] = useState<SkillWorkspaceInspection | null>(null);
  const [screen, setScreen] = useState<SkillScreen>('library');
  const [selectedKey, setSelectedKey] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftCore, setDraftCore] = useState('');
  const [creator, setCreator] = useState<SkillCreatorState>(EMPTY_CREATOR);
  const [advancedCreator, setAdvancedCreator] = useState(false);
  const [routingPrompt, setRoutingPrompt] = useState('');
  const [routing, setRouting] = useState<SkillResolutionPreview | null>(null);
  const [comparison, setComparison] = useState<SkillRevisionComparison | null>(null);
  const [bundledComparison, setBundledComparison] = useState<BundledSkillComparison | null>(null);
  const [targetDocument, setTargetDocument] = useState<SkillDocumentSpec>(DOCUMENT_FORMATS[0].value);
  const [conversion, setConversion] = useState<SkillConversionPreview | null>(null);
  const [testResult, setTestResult] = useState<{ passed?: boolean; cases?: unknown[] } | null>(null);
  const [evaluation, setEvaluation] = useState<SkillEvaluationCard | null>(null);
  const [qualifications, setQualifications] = useState<HarnessQualificationRecord[]>([]);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const selected = useMemo(
    () => inspection?.skills.find((skill) => skillKey(skill) === selectedKey) ?? null,
    [inspection?.skills, selectedKey],
  );
  const selectedHealth = useMemo<SkillHealthRecord | null>(() => {
    if (!selected) return null;
    return (
      inspection?.health?.records?.find(
        (record) =>
          record.name === selected.name &&
          record.source === selected.source &&
          record.state === selected.state &&
          record.hash === selected.hash,
      ) ?? null
    );
  }, [inspection?.health?.records, selected]);

  const load = useCallback(async (prefer?: { name: string; source: 'personal' | 'project'; state?: 'active' | 'draft' }) => {
    setError('');
    try {
      const next = await inspect<SkillWorkspaceInspection>('skills.inspect');
      setInspection(next);
      if (prefer) {
        const match =
          next.skills.find(
            (skill) =>
              skill.name === prefer.name &&
              skill.source === prefer.source &&
              (!prefer.state || skill.state === prefer.state),
          ) ?? next.skills.find((skill) => skill.name === prefer.name && skill.source === prefer.source);
        if (match) {
          setSelectedKey(skillKey(match));
          setDraftContent(match.sourceContent ?? match.content ?? match.instructions ?? '');
          setDraftCore(match.coreInstructions ?? '');
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load skills');
    }
  }, [inspect]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openSkill = (skill: SkillRevision) => {
    setSelectedKey(skillKey(skill));
    setDraftContent(skill.sourceContent ?? skill.content ?? skill.instructions ?? '');
    setDraftCore(skill.coreInstructions ?? '');
    setTestResult(null);
    setConversion(null);
    setEvaluation(null);
    setQualifications([]);
    setEvidenceOpen(false);
    setScreen('detail');
  };

  const loadEvidence = useCallback(async () => {
    if (!selected || evidenceBusy) return;
    setEvidenceBusy(true);
    setError('');
    try {
      const [nextEvaluation, allQualifications] = await Promise.all([
        inspect<SkillEvaluationCard>('skills.evaluation', {
          name: selected.name,
          source: selected.source,
          state: selected.state,
        }),
        inspect<HarnessQualificationRecord[]>('skills.qualifications'),
      ]);
      setEvaluation(nextEvaluation);
      setQualifications(
        allQualifications.filter((record) => record.skill === selected.name),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load skill evidence');
    } finally {
      setEvidenceBusy(false);
    }
  }, [evidenceBusy, inspect, selected]);

  useEffect(() => {
    if (screen !== 'detail' || !selected || !evidenceOpen || evaluation) return;
    const timer = setTimeout(() => void loadEvidence(), 0);
    return () => clearTimeout(timer);
  }, [evaluation, evidenceOpen, loadEvidence, screen, selected]);

  const saveDraft = async () => {
    if (!selected || selected.state !== 'draft' || busy) return;
    setBusy('save');
    setError('');
    try {
      await sendCommand('skill.save_draft', {
        name: selected.name,
        source: selected.source,
        expectedHash: selected.hash,
        content: draftContent,
        coreInstructions: draftCore,
        ...(selected.storageVersion === 2 && selected.document ? { document: selected.document } : {}),
      });
      await load({ name: selected.name, source: selected.source, state: 'draft' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save skill draft');
    } finally {
      setBusy('');
    }
  };

  const testSkill = async (activate = false) => {
    if (!selected || busy) return;
    setBusy(activate ? 'activate' : 'test');
    setError('');
    try {
      const result = await sendCommand('skill.test', {
        name: selected.name,
        source: selected.source,
        state: selected.state,
        expectedHash: selected.hash,
      });
      const test = (result.data ?? {}) as { passed?: boolean; cases?: unknown[] };
      setTestResult(test);
      if (activate) {
        if (test.passed === false) throw new Error('Trigger tests did not pass');
        await sendCommand('skill.activate', {
          name: selected.name,
          source: selected.source,
          expectedHash: selected.hash,
        });
        await load({ name: selected.name, source: selected.source, state: 'active' });
        setScreen('detail');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Skill test failed');
    } finally {
      setBusy('');
    }
  };

  const createSkill = async () => {
    if (busy) return;
    setBusy('create');
    setError('');
    try {
      const result = await sendCommand('skill.create', {
        source: creator.source,
        name: normalizeSkillName(creator.name),
        description: creator.description.trim(),
        instructions: creator.instructions.trim(),
        domains: splitLines(creator.domains),
        activation: splitLines(creator.activation),
        shouldTrigger: splitLines(creator.shouldTrigger),
        shouldNotTrigger: splitLines(creator.shouldNotTrigger),
        evidence: splitLines(creator.evidence),
        broader: splitLines(creator.broader),
        facets: splitLines(creator.facets),
        requires: splitLines(creator.requires),
        conflicts: splitLines(creator.conflicts),
        excludes: splitLines(creator.excludes),
        targetMedia: splitLines(creator.targetMedia),
        depth: Number(creator.depth || 0),
        contextBudget: Number(creator.contextBudget || 4000),
      });
      const created = result.data as SkillRevision | undefined;
      setCreator(EMPTY_CREATOR);
      setAdvancedCreator(false);
      await load(
        created
          ? { name: created.name, source: created.source, state: created.state }
          : {
              name: normalizeSkillName(creator.name),
              source: creator.source,
              state: 'draft',
            },
      );
      setScreen('detail');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create skill');
    } finally {
      setBusy('');
    }
  };

  const openComparison = async () => {
    if (!selected || busy) return;
    setBusy('compare');
    setError('');
    try {
      setComparison(
        await inspect<SkillRevisionComparison>('skills.compare', {
          name: selected.name,
          source: selected.source,
        }),
      );
      setScreen('comparison');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not compare revisions');
    } finally {
      setBusy('');
    }
  };

  const openBundled = async () => {
    if (!selected || busy) return;
    setBusy('bundled');
    setError('');
    try {
      setBundledComparison(
        await inspect<BundledSkillComparison>('skills.compare_bundled', { name: selected.name }),
      );
      setScreen('bundled');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not compare bundled skill');
    } finally {
      setBusy('');
    }
  };

  const applyBundled = async (choice: 'replace' | 'merge' | 'keep-local' | 'merge-with-agent') => {
    if (!selected || busy) return;
    setBusy(`bundled:${choice}`);
    setError('');
    try {
      await sendCommand('skill.update_default', {
        name: selected.name,
        expectedHash: selected.hash,
        choice,
      });
      await load({ name: selected.name, source: selected.source });
      setScreen('detail');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply bundled update');
    } finally {
      setBusy('');
    }
  };

  const previewConversion = async () => {
    if (!selected || busy) return;
    setBusy('convert-preview');
    setError('');
    try {
      setConversion(
        await inspect<SkillConversionPreview>('skills.convert_preview', {
          name: selected.name,
          source: selected.source,
          state: selected.state,
          expectedHash: selected.hash,
          document: targetDocument,
        }),
      );
      setScreen('convert');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview conversion');
    } finally {
      setBusy('');
    }
  };

  const applyConversion = async () => {
    if (!selected || busy) return;
    setBusy('convert');
    setError('');
    try {
      await sendCommand('skill.convert', {
        name: selected.name,
        source: selected.source,
        state: selected.state,
        expectedHash: selected.hash,
        document: targetDocument,
      });
      await load({ name: selected.name, source: selected.source, state: 'draft' });
      setScreen('detail');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create converted draft');
    } finally {
      setBusy('');
    }
  };

  const runRouting = async () => {
    if (!routingPrompt.trim() || busy) return;
    setBusy('routing');
    setError('');
    try {
      setRouting(
        await inspect<SkillResolutionPreview>('skills.resolve', { prompt: routingPrompt.trim() }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not test routing');
    } finally {
      setBusy('');
    }
  };

  const setCreatorField = <K extends keyof SkillCreatorState>(key: K, value: SkillCreatorState[K]) =>
    setCreator((current) => ({ ...current, [key]: value }));

  const back = () => {
    setError('');
    if (screen === 'detail') {
      setScreen('library');
      return;
    }
    if (screen === 'comparison' || screen === 'bundled' || screen === 'convert') {
      setScreen('detail');
      return;
    }
    setScreen('library');
  };

  if (screen === 'create') {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={back} style={styles.backButton}><ArrowLeft size={18} color={colors.textSecondary} /></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>New skill</Text>
            <Text style={styles.subtle}>Create a host-side draft for review.</Text>
          </View>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.card}>
          <Eyebrow>Scope</Eyebrow>
          <View style={styles.chipRow}>
            {(['personal', 'project'] as const).map((source) => (
              <Pressable
                key={source}
                onPress={() => setCreatorField('source', source)}
                style={[styles.chip, creator.source === source && styles.chipActive]}
              >
                <Text style={[styles.chipText, creator.source === source && styles.chipTextActive]}>
                  {source === 'personal' ? 'Personal' : 'Project'}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field label="Name" value={creator.name} onChangeText={(value) => setCreatorField('name', value)} />
          <Field label="Description" value={creator.description} multiline onChangeText={(value) => setCreatorField('description', value)} />
          <Field label="Instructions" value={creator.instructions} multiline tall onChangeText={(value) => setCreatorField('instructions', value)} />
        </View>
        <View style={styles.card}>
          <Eyebrow>Routing</Eyebrow>
          <Field label="Domains · one per line" value={creator.domains} multiline onChangeText={(value) => setCreatorField('domains', value)} />
          <Field label="Activation cues · one per line" value={creator.activation} multiline onChangeText={(value) => setCreatorField('activation', value)} />
          <Field label="Should trigger · at least two" value={creator.shouldTrigger} multiline onChangeText={(value) => setCreatorField('shouldTrigger', value)} />
          <Field label="Should not trigger · at least two" value={creator.shouldNotTrigger} multiline onChangeText={(value) => setCreatorField('shouldNotTrigger', value)} />
          <Field label="Evidence · one per line" value={creator.evidence} multiline onChangeText={(value) => setCreatorField('evidence', value)} />
        </View>
        <Pressable
          onPress={() => setAdvancedCreator((open) => !open)}
          style={({ pressed }) => [styles.expandRow, pressed && styles.pressed]}
        >
          <Text style={styles.expandText}>Advanced relationships and budget</Text>
          {advancedCreator ? <ChevronDown size={16} color={colors.textMuted} /> : <ChevronRight size={16} color={colors.textMuted} />}
        </Pressable>
        {advancedCreator ? (
          <View style={styles.card}>
            <Field label="Broader skills" value={creator.broader} multiline onChangeText={(value) => setCreatorField('broader', value)} />
            <Field label="Facets" value={creator.facets} multiline onChangeText={(value) => setCreatorField('facets', value)} />
            <Field label="Requires" value={creator.requires} multiline onChangeText={(value) => setCreatorField('requires', value)} />
            <Field label="Conflicts" value={creator.conflicts} multiline onChangeText={(value) => setCreatorField('conflicts', value)} />
            <Field label="Excludes" value={creator.excludes} multiline onChangeText={(value) => setCreatorField('excludes', value)} />
            <Field label="Target media" value={creator.targetMedia} multiline onChangeText={(value) => setCreatorField('targetMedia', value)} />
            <View style={styles.twoColumn}>
              <View style={styles.flexOne}>
                <Field label="Depth" value={creator.depth} keyboardType="number-pad" onChangeText={(value) => setCreatorField('depth', value)} />
              </View>
              <View style={styles.flexOne}>
                <Field label="Context budget" value={creator.contextBudget} keyboardType="number-pad" onChangeText={(value) => setCreatorField('contextBudget', value)} />
              </View>
            </View>
          </View>
        ) : null}
        <ActionButton
          label="Create draft"
          icon={Plus}
          primary
          loading={busy === 'create'}
          disabled={
            Boolean(busy) ||
            !normalizeSkillName(creator.name) ||
            creator.description.trim().length < 40 ||
            creator.instructions.trim().length < 40 ||
            !splitLines(creator.domains).length ||
            !splitLines(creator.activation).length ||
            splitLines(creator.shouldTrigger).length < 2 ||
            splitLines(creator.shouldNotTrigger).length < 2 ||
            !splitLines(creator.evidence).length
          }
          onPress={() => void createSkill()}
        />
      </ScrollView>
    );
  }

  if (screen === 'routing') {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={back} style={styles.backButton}><ArrowLeft size={18} color={colors.textSecondary} /></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Test routing</Text>
            <Text style={styles.subtle}>Preview which skills the manager would load.</Text>
          </View>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.inputActionRow}>
          <TextInput
            value={routingPrompt}
            onChangeText={setRoutingPrompt}
            multiline
            placeholder="Describe a task"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.routingInput]}
          />
          <ActionButton label="Run" icon={FlaskConical} loading={busy === 'routing'} disabled={!routingPrompt.trim() || Boolean(busy)} onPress={() => void runRouting()} />
        </View>
        {routing ? (
          <View style={styles.card}>
            <View style={styles.metaRow}>
              <Text style={styles.cardTitle}>
                {routing.blocked ? 'Blocked' : `${routing.selected?.length ?? 0} selected`}
              </Text>
              <Text style={styles.meta}>
                {routing.totalContextCost ?? 0}/{routing.contextBudget ?? 0}
              </Text>
            </View>
            {(routing.selected ?? []).map((item) => (
              <View key={`${item.skill.source}:${item.skill.name}`} style={styles.compactRow}>
                <View style={styles.headerCopy}>
                  <Text style={styles.rowTitle}>{item.skill.name}</Text>
                  <Text style={styles.subtle}>{item.reason}</Text>
                </View>
                <Text style={styles.meta}>{item.representation ?? 'full'}</Text>
              </View>
            ))}
            {(routing.collisions ?? []).map((item) => (
              <Text key={item.name} style={styles.warningText}>Resolve source for {item.name}</Text>
            ))}
            {(routing.hierarchyErrors ?? []).map((item) => (
              <Text key={item} style={styles.warningText}>{item}</Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  if (screen === 'comparison' && comparison && selected) {
    return (
      <ComparisonScreen
        title="Active vs draft"
        leftLabel="Active"
        left={comparison.active}
        rightLabel="Draft"
        right={comparison.draft}
        changed={comparison.changed}
        onBack={back}
      />
    );
  }

  if (screen === 'bundled' && bundledComparison && selected) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable onPress={back} style={styles.backButton}><ArrowLeft size={18} color={colors.textSecondary} /></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Bundled update</Text>
            <Text style={styles.subtle}>{selected.name}</Text>
          </View>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <ComparisonBody
          leftLabel="Local"
          left={bundledComparison.local}
          rightLabel="Bundled"
          right={bundledComparison.bundled}
          changed={bundledComparison.changed}
        />
        <View style={styles.actionWrap}>
          <ActionButton label="Keep local" disabled={Boolean(busy)} onPress={() => void applyBundled('keep-local')} />
          <ActionButton label="Merge to draft" disabled={Boolean(busy)} onPress={() => void applyBundled('merge')} />
          <ActionButton label="Agent merge" loading={busy === 'bundled:merge-with-agent'} disabled={Boolean(busy) && busy !== 'bundled:merge-with-agent'} onPress={() => void applyBundled('merge-with-agent')} />
          <ActionButton label="Replace" danger disabled={Boolean(busy)} onPress={() => void applyBundled('replace')} />
        </View>
      </ScrollView>
    );
  }

  if (screen === 'convert' && selected) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable onPress={back} style={styles.backButton}><ArrowLeft size={18} color={colors.textSecondary} /></Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Convert skill format</Text>
            <Text style={styles.subtle}>{selected.name}</Text>
          </View>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.chipRow}>
          {DOCUMENT_FORMATS.map(({ label, value }) => (
            <Pressable
              key={value.kind}
              onPress={() => {
                setTargetDocument(value);
                setConversion(null);
              }}
              style={[styles.chip, targetDocument.kind === value.kind && styles.chipActive]}
            >
              <Text style={[styles.chipText, targetDocument.kind === value.kind && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <ActionButton label="Preview conversion" loading={busy === 'convert-preview'} disabled={Boolean(busy)} onPress={() => void previewConversion()} />
        {conversion ? (
          <View style={styles.card}>
            <View style={styles.metaRow}>
              <Text style={styles.cardTitle}>{conversion.lossy ? 'Review required' : 'Preview'}</Text>
              <Text style={styles.meta}>{conversion.targetDocument.kind}</Text>
            </View>
            {conversion.warnings.map((warning) => <Text key={warning} style={styles.warningText}>{warning}</Text>)}
            <Text selectable style={styles.codePreview}>{conversion.convertedContent}</Text>
            <ActionButton label="Create converted draft" primary loading={busy === 'convert'} disabled={Boolean(busy)} onPress={() => void applyConversion()} />
          </View>
        ) : null}
      </ScrollView>
    );
  }

  if (screen === 'detail' && selected) {
    const contentDirty =
      draftContent !== (selected.sourceContent ?? selected.content ?? selected.instructions ?? '') ||
      draftCore !== (selected.coreInstructions ?? '');
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable onPress={back} style={styles.backButton}><ArrowLeft size={18} color={colors.textSecondary} /></Pressable>
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={styles.title}>{selected.name}</Text>
            <Text style={styles.subtle}>
              {selected.source === 'project' ? 'Project' : 'Personal'} · {selected.state}
            </Text>
          </View>
          <ActionButton label="Reload" icon={RefreshCw} onPress={() => void load({ name: selected.name, source: selected.source, state: selected.state })} />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.description}>{selected.description}</Text>
        {selected.validation?.errors?.length ? (
          <View style={styles.warningCard}>
            {selected.validation.errors.map((item) => <Text key={item} style={styles.warningText}>{item}</Text>)}
          </View>
        ) : null}
        <View style={styles.card}>
          <View style={styles.metaRow}>
            <Eyebrow>Source</Eyebrow>
            <Text style={styles.meta}>{selected.document?.kind ?? 'legacy'}</Text>
          </View>
          <TextInput
            value={draftContent}
            onChangeText={setDraftContent}
            editable={selected.state === 'draft'}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            textAlignVertical="top"
            style={[styles.editor, selected.state !== 'draft' && styles.readonlyEditor]}
          />
          {selected.storageVersion === 2 ? (
            <>
              <Eyebrow>Core instructions</Eyebrow>
              <TextInput
                value={draftCore}
                onChangeText={setDraftCore}
                editable={selected.state === 'draft'}
                multiline
                textAlignVertical="top"
                style={[styles.editorSmall, selected.state !== 'draft' && styles.readonlyEditor]}
              />
            </>
          ) : null}
          {selected.state === 'draft' ? (
            <View style={styles.actionWrap}>
              <ActionButton
                label="Reset edits"
                icon={RotateCcw}
                disabled={!contentDirty || Boolean(busy)}
                onPress={() => {
                  setDraftContent(selected.sourceContent ?? selected.content ?? selected.instructions ?? '');
                  setDraftCore(selected.coreInstructions ?? '');
                }}
              />
              <ActionButton label="Save draft" icon={Save} primary loading={busy === 'save'} disabled={!contentDirty || Boolean(busy)} onPress={() => void saveDraft()} />
            </View>
          ) : null}
        </View>
        <View style={styles.actionWrap}>
          <ActionButton label="Test triggers" icon={FlaskConical} loading={busy === 'test'} disabled={Boolean(busy)} onPress={() => void testSkill(false)} />
          {selected.state === 'draft' ? (
            <ActionButton label="Validate & activate" icon={Check} primary loading={busy === 'activate'} disabled={Boolean(busy) || contentDirty} onPress={() => void testSkill(true)} />
          ) : null}
          <ActionButton label="Active vs draft" icon={FileDiff} loading={busy === 'compare'} disabled={Boolean(busy)} onPress={() => void openComparison()} />
          {selected.bundledUpdateAvailable ? (
            <ActionButton label="Bundled update" disabled={Boolean(busy)} onPress={() => void openBundled()} />
          ) : null}
          <ActionButton
            label="Convert format"
            disabled={Boolean(busy)}
            onPress={() => {
              setConversion(null);
              setScreen('convert');
            }}
          />
        </View>
        {testResult ? (
          <View style={testResult.passed === false ? styles.warningCard : styles.successCard}>
            <Text style={testResult.passed === false ? styles.warningText : styles.successText}>
              {testResult.passed === false ? 'Trigger tests failed' : 'Trigger tests passed'}
              {Array.isArray(testResult.cases) ? ` · ${testResult.cases.length} cases` : ''}
            </Text>
          </View>
        ) : null}
        <View style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={evidenceOpen ? 'Hide skill evidence' : 'Show skill evidence'}
            onPress={() => setEvidenceOpen((open) => !open)}
            style={({ pressed }) => [styles.expandRow, pressed && styles.pressed]}
          >
            <View style={styles.headerCopy}>
              <Eyebrow>Evidence</Eyebrow>
              <Text style={styles.subtle}>
                {selectedHealth
                  ? selectedHealth.promotionState +
                    ' · ' +
                    selectedHealth.usageCount +
                    ' uses · ' +
                    selectedHealth.openRegressions +
                    ' regressions'
                  : 'Promotion, qualification and health'}
              </Text>
            </View>
            {evidenceOpen ? (
              <ChevronDown size={16} color={colors.textMuted} />
            ) : (
              <ChevronRight size={16} color={colors.textMuted} />
            )}
          </Pressable>
          {evidenceOpen ? (
            <View style={styles.evidenceBody}>
              {evidenceBusy && !evaluation ? (
                <Text style={styles.subtle}>Loading evidence…</Text>
              ) : null}
              {evaluation ? (
                <>
                  <View style={styles.metaRow}>
                    <Text style={styles.rowTitle}>Promotion</Text>
                    <Text style={styles.meta}>{evaluation.gate.status}</Text>
                  </View>
                  <View style={styles.evidenceMetrics}>
                    <Text style={styles.healthMetric}>{evaluation.gate.candidateRuns} runs</Text>
                    <Text style={styles.healthMetric}>{evaluation.gate.distinctProviders} providers</Text>
                    <Text style={styles.healthMetric}>{evaluation.gate.distinctModels} models</Text>
                    <Text style={styles.healthMetric}>{evaluation.gate.humanBlindReviews} blind reviews</Text>
                    <Text style={styles.healthMetric}>{evaluation.cases.length} cases</Text>
                  </View>
                  {evaluation.gate.reasons.map((reason) => (
                    <Text key={reason} style={styles.subtle}>{reason}</Text>
                  ))}
                </>
              ) : null}
              {qualifications.length ? (
                <>
                  <Eyebrow>Harness qualification</Eyebrow>
                  {qualifications.map((record) => (
                    <View
                      key={[
                        record.provider,
                        record.model,
                        record.harnessVersion,
                        record.role,
                        record.medium ?? '',
                      ].join(':')}
                      style={styles.compactRow}
                    >
                      <View style={styles.headerCopy}>
                        <Text numberOfLines={1} style={styles.rowTitle}>
                          {record.provider}:{record.model}
                        </Text>
                        <Text style={styles.subtle}>
                          {record.role}
                          {record.medium ? ' · ' + record.medium : ''}
                          {' · ' + record.successes + '/' + record.sampleSize + ' pass'}
                        </Text>
                      </View>
                      <Text style={styles.meta}>{Math.round(record.quality * 100)}%</Text>
                    </View>
                  ))}
                </>
              ) : evaluation && !evidenceBusy ? (
                <Text style={styles.subtle}>No measured harness qualification yet.</Text>
              ) : null}
              {selectedHealth ? (
                <>
                  <Eyebrow>Health</Eyebrow>
                  <View style={styles.evidenceMetrics}>
                    <Text style={styles.healthMetric}>
                      precision{' '}
                      {selectedHealth.routingPrecision === null
                        ? '—'
                        : Math.round(selectedHealth.routingPrecision * 100) + '%'}
                    </Text>
                    <Text style={styles.healthMetric}>
                      recall{' '}
                      {selectedHealth.routingRecall === null
                        ? '—'
                        : Math.round(selectedHealth.routingRecall * 100) + '%'}
                    </Text>
                    <Text style={styles.healthMetric}>{selectedHealth.usageCount} uses</Text>
                    <Text style={styles.healthMetric}>{selectedHealth.openRegressions} open regressions</Text>
                  </View>
                  {selectedHealth.steward ? (
                    <Text style={styles.subtle}>
                      Steward{' '}
                      {selectedHealth.steward.displayLabel ||
                        selectedHealth.steward.agentId ||
                        'assigned'}
                      {selectedHealth.steward.model
                        ? ' · ' + selectedHealth.steward.model
                        : ''}
                    </Text>
                  ) : null}
                </>
              ) : null}
              <ActionButton
                label="Refresh evidence"
                icon={RefreshCw}
                loading={evidenceBusy}
                disabled={evidenceBusy}
                onPress={() => {
                  setEvaluation(null);
                  void loadEvidence();
                }}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.card}>
          <Eyebrow>Routing metadata</Eyebrow>
          <MetaList label="Domains" values={selected.metadata?.domains} />
          <MetaList label="Activation" values={selected.metadata?.activation} />
          <MetaList label="Broader" values={selected.metadata?.broader} />
          <MetaList label="Requires" values={selected.metadata?.requires} />
          <MetaList label="Conflicts" values={selected.metadata?.conflicts} />
          <View style={styles.metaRow}>
            <Text style={styles.subtle}>Context budget</Text>
            <Text style={styles.meta}>{selected.metadata?.contextBudget ?? '—'}</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Skills</Text>
          <Text style={styles.subtle}>
            {inspection
              ? `${inspection.skills.length} revisions${inspection.bundledUpdateCount ? ` · ${inspection.bundledUpdateCount} updates` : ''}`
              : 'Loading library…'}
          </Text>
        </View>
        <ActionButton label="Routing" icon={FlaskConical} onPress={() => setScreen('routing')} />
        <ActionButton label="New" icon={Plus} primary onPress={() => setScreen('create')} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {inspection?.health?.summary ? (
        <View style={styles.healthRow}>
          <Text style={styles.healthMetric}>{inspection.health.summary.active ?? 0} active</Text>
          <Text style={styles.healthMetric}>{inspection.health.summary.ready ?? 0} ready</Text>
          <Text style={styles.healthMetric}>{inspection.health.summary.blocked ?? 0} blocked</Text>
          <Pressable onPress={() => void load()} style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}>
            <RefreshCw size={15} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.list}>
        {(inspection?.skills ?? []).map((skill) => (
          <Pressable
            key={skillKey(skill)}
            onPress={() => openSkill(skill)}
            style={({ pressed }) => [styles.skillRow, pressed && styles.pressed]}
          >
            <View style={styles.headerCopy}>
              <View style={styles.nameRow}>
                <Text numberOfLines={1} style={styles.rowTitle}>{skill.name}</Text>
                {skill.bundledUpdateAvailable ? <View style={styles.updateDot} /> : null}
              </View>
              <Text numberOfLines={2} style={styles.subtle}>{skill.description}</Text>
              <Text style={styles.meta}>
                {skill.source === 'project' ? 'Project' : 'Personal'} · {skill.state}
                {skill.validation?.valid === false ? ' · needs fixes' : ''}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        ))}
        {inspection && !inspection.skills.length ? <Text style={styles.empty}>No skills yet.</Text> : null}
      </View>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  tall = false,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  tall?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'number-pad' ? 'none' : 'sentences'}
        autoCorrect={keyboardType !== 'number-pad'}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          tall && styles.tallInput,
        ]}
      />
    </View>
  );
}

function MetaList({ label, values }: { label: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <View style={styles.metaBlock}>
      <Text style={styles.subtle}>{label}</Text>
      <Text style={styles.metaValue}>{values.join(' · ')}</Text>
    </View>
  );
}

function ComparisonBody({
  leftLabel,
  left,
  rightLabel,
  right,
  changed,
}: {
  leftLabel: string;
  left: string;
  rightLabel: string;
  right: string;
  changed: boolean;
}) {
  return (
    <>
      <Text style={styles.subtle}>{changed ? 'Revisions differ' : 'No content changes'}</Text>
      <View style={styles.card}>
        <Eyebrow>{leftLabel}</Eyebrow>
        <Text selectable style={styles.codePreview}>{left}</Text>
      </View>
      <View style={styles.card}>
        <Eyebrow>{rightLabel}</Eyebrow>
        <Text selectable style={styles.codePreview}>{right}</Text>
      </View>
    </>
  );
}

function ComparisonScreen({
  title,
  leftLabel,
  left,
  rightLabel,
  right,
  changed,
  onBack,
}: {
  title: string;
  leftLabel: string;
  left: string;
  rightLabel: string;
  right: string;
  changed: boolean;
  onBack: () => void;
}) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backButton}><ArrowLeft size={18} color={colors.textSecondary} /></Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>
      <ComparisonBody
        leftLabel={leftLabel}
        left={left}
        rightLabel={rightLabel}
        right={right}
        changed={changed}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1 },
  content: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.huge,
    gap: spacing.sm,
  },
  headerRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
  subtle: { color: colors.textMuted, fontSize: typography.xs, lineHeight: 17 },
  meta: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
  metaValue: { color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
  error: { color: colors.error, fontSize: typography.xs, lineHeight: 17 },
  empty: { color: colors.textMuted, fontSize: typography.sm, paddingVertical: spacing.lg },
  card: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  inlineNotice: {
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    padding: spacing.md,
    gap: spacing.sm,
  },
  editor: {
    minHeight: 300,
    borderRadius: radii.xl,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    padding: spacing.md,
    fontSize: typography.sm,
    lineHeight: 21,
  },
  editorSmall: {
    minHeight: 140,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    padding: spacing.sm,
    fontSize: typography.sm,
    lineHeight: 20,
  },
  readonlyEditor: { opacity: 0.78 },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 2 },
  skillRow: {
    minHeight: 68,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowTitle: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '700' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  updateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  healthRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  healthMetric: { color: colors.textMuted, fontSize: typography.xs },
  evidenceBody: { gap: spacing.sm },
  evidenceMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  refreshButton: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: 17,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accentSoft },
  chipText: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700' },
  chipTextActive: { color: colors.accent },
  field: { gap: 5 },
  fieldLabel: { color: colors.textSecondary, fontSize: typography.xs, fontWeight: '700' },
  input: {
    minHeight: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: typography.sm,
  },
  multilineInput: { minHeight: 78 },
  tallInput: { minHeight: 170 },
  twoColumn: { flexDirection: 'row', gap: spacing.xs },
  flexOne: { flex: 1, minWidth: 0 },
  expandRow: {
    minHeight: 48,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  expandText: { flex: 1, color: colors.textSecondary, fontSize: typography.sm, fontWeight: '700' },
  inputActionRow: { gap: spacing.xs },
  routingInput: { minHeight: 86 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  compactRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warningCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.errorSoft,
    padding: spacing.sm,
    gap: 4,
  },
  warningText: { color: colors.error, fontSize: typography.xs, lineHeight: 17 },
  successCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.successSoft,
    padding: spacing.sm,
  },
  successText: { color: colors.success, fontSize: typography.xs, fontWeight: '700' },
  metaBlock: { gap: 3 },
  cardTitle: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '800' },
  codePreview: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: 'monospace',
  },
  pressed: { opacity: 0.7 },
});
