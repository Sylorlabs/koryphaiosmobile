import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  Plus,
  Save,
  Trash2,
  Unlink,
} from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import type { RemoteNote } from '../types/control';
import { ActionButton, IconButton } from './ui';

type CanvasCard = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  noteId?: string;
  color: string;
};

type CanvasEdge = {
  id: string;
  from: string;
  to: string;
};

type CanvasDocument = {
  v: 1;
  name: string;
  cards: CanvasCard[];
  edges: CanvasEdge[];
};

const CARD_COLORS = ['#8b7ec8', '#6b9bd1', '#5ec4a0', '#d4845c', '#c47fd0', '#e8a85a'];
const CANVAS_TAG = 'canvas';

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseCanvas(note: RemoteNote): CanvasDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(note.content);
  } catch {
    throw new Error('This canvas contains invalid JSON');
  }
  if (!raw || typeof raw !== 'object') throw new Error('This canvas document is invalid');
  const source = raw as Record<string, unknown>;
  const cards = Array.isArray(source.cards) ? source.cards : [];
  const edges = Array.isArray(source.edges) ? source.edges : [];
  const parsedCards = cards.flatMap((item, index): CanvasCard[] => {
    if (!item || typeof item !== 'object') return [];
    const card = item as Record<string, unknown>;
    const id = typeof card.id === 'string' && card.id ? card.id : uid();
    return [{
      id,
      x: finiteNumber(card.x, 100 + (index % 3) * 210),
      y: finiteNumber(card.y, 100 + Math.floor(index / 3) * 150),
      w: Math.max(120, finiteNumber(card.w, 180)),
      h: Math.max(80, finiteNumber(card.h, 120)),
      text: typeof card.text === 'string' ? card.text : '',
      ...(typeof card.noteId === 'string' && card.noteId ? { noteId: card.noteId } : {}),
      color: typeof card.color === 'string' && card.color ? card.color : CARD_COLORS[index % CARD_COLORS.length],
    }];
  });
  const cardIds = new Set(parsedCards.map((card) => card.id));
  const parsedEdges = edges.flatMap((item): CanvasEdge[] => {
    if (!item || typeof item !== 'object') return [];
    const edge = item as Record<string, unknown>;
    if (typeof edge.from !== 'string' || typeof edge.to !== 'string') return [];
    if (!cardIds.has(edge.from) || !cardIds.has(edge.to) || edge.from === edge.to) return [];
    return [{
      id: typeof edge.id === 'string' && edge.id ? edge.id : uid(),
      from: edge.from,
      to: edge.to,
    }];
  });
  return {
    v: 1,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 200) : note.title,
    cards: parsedCards,
    edges: parsedEdges,
  };
}

function serializeCanvas(name: string, cards: CanvasCard[], edges: CanvasEdge[]): string {
  const ids = new Set(cards.map((card) => card.id));
  const validEdges = edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
  return JSON.stringify({
    v: 1,
    name: name.trim() || 'Untitled canvas',
    cards: cards.map((card) => ({
      ...card,
      x: Math.round(card.x),
      y: Math.round(card.y),
      w: Math.round(card.w),
      h: Math.round(card.h),
    })),
    edges: validEdges,
  } satisfies CanvasDocument);
}

function cardLabel(card: CanvasCard): string {
  return card.text.trim() || (card.noteId ? 'Note card' : 'Card');
}

export function NotesCanvasControlView({
  notes,
  onOpenNote,
  onRefresh,
}: {
  notes: RemoteNote[];
  onOpenNote: (id: string) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const { inspect, sendCommand } = useControl();
  const canvases = useMemo(() => notes.filter((note) => note.tags?.includes(CANVAS_TAG)), [notes]);
  const regularNotes = useMemo(() => notes.filter((note) => !note.tags?.includes(CANVAS_TAG)), [notes]);
  const [canvasNote, setCanvasNote] = useState<RemoteNote | null>(null);
  const [name, setName] = useState('Untitled canvas');
  const [cards, setCards] = useState<CanvasCard[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [dirty, setDirty] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState('');
  const [connectFrom, setConnectFrom] = useState('');
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [noteQuery, setNoteQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const filteredNotes = useMemo(() => {
    const query = noteQuery.trim().toLocaleLowerCase();
    return regularNotes
      .filter((note) => !query || note.title.toLocaleLowerCase().includes(query))
      .slice(0, 20);
  }, [noteQuery, regularNotes]);

  const reset = () => {
    setCanvasNote(null);
    setName('Untitled canvas');
    setCards([]);
    setEdges([]);
    setDirty(false);
    setExpandedCardId('');
    setConnectFrom('');
    setNotePickerOpen(false);
    setNoteQuery('');
    setError('');
  };

  const loadCanvas = async (noteId: string) => {
    if (dirty) {
      setError('Save this canvas before opening another one');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const note = await inspect<RemoteNote>('notes.read', { noteId });
      const document = parseCanvas(note);
      setCanvasNote(note);
      setName(document.name);
      setCards(document.cards);
      setEdges(document.edges);
      setExpandedCardId('');
      setConnectFrom('');
      setNotePickerOpen(false);
      setDirty(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open canvas');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setLoading(true);
    setError('');
    try {
      const title = name.trim() || 'Untitled canvas';
      const content = serializeCanvas(title, cards, edges);
      const result = canvasNote
        ? await sendCommand('note.update', {
            noteId: canvasNote.id,
            expectedRevision: canvasNote.revision,
            title,
            content,
            tags: [CANVAS_TAG],
            folderPath: canvasNote.folderPath || '/canvases',
          })
        : await sendCommand('note.create', {
            title,
            content,
            tags: [CANVAS_TAG],
            folderPath: '/canvases',
            format: 'markdown',
          });
      const saved = result.data as RemoteNote | undefined;
      if (!saved) throw new Error('The desktop did not return the saved canvas');
      setCanvasNote(saved);
      setName(saved.title || title);
      setDirty(false);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save canvas');
    } finally {
      setLoading(false);
    }
  };

  const addCard = (note?: RemoteNote) => {
    const index = cards.length;
    const card: CanvasCard = {
      id: uid(),
      x: 80 + (index % 3) * 210,
      y: 80 + Math.floor(index / 3) * 150,
      w: 180,
      h: 120,
      text: note?.title || 'New card',
      ...(note ? { noteId: note.id } : {}),
      color: CARD_COLORS[index % CARD_COLORS.length],
    };
    setCards((current) => [...current, card]);
    setExpandedCardId(card.id);
    setDirty(true);
    setNotePickerOpen(false);
    setNoteQuery('');
  };

  const updateCard = (cardId: string, patch: Partial<CanvasCard>) => {
    setCards((current) => current.map((card) => card.id === cardId ? { ...card, ...patch } : card));
    setDirty(true);
  };

  const moveCard = (cardId: string, dx: number, dy: number) => {
    setCards((current) => current.map((card) => card.id === cardId
      ? { ...card, x: card.x + dx, y: card.y + dy }
      : card));
    setDirty(true);
  };

  const deleteCard = (cardId: string) => {
    setCards((current) => current.filter((card) => card.id !== cardId));
    setEdges((current) => current.filter((edge) => edge.from !== cardId && edge.to !== cardId));
    setConnectFrom((current) => current === cardId ? '' : current);
    setExpandedCardId((current) => current === cardId ? '' : current);
    setDirty(true);
  };

  const connect = (cardId: string) => {
    if (!connectFrom) {
      setConnectFrom(cardId);
      return;
    }
    const from = connectFrom;
    setConnectFrom('');
    if (from === cardId || edges.some((edge) => edge.from === from && edge.to === cardId)) return;
    setEdges((current) => [...current, { id: uid(), from, to: cardId }]);
    setDirty(true);
  };

  const removeEdge = (edgeId: string) => {
    setEdges((current) => current.filter((edge) => edge.id !== edgeId));
    setDirty(true);
  };

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <TextInput
          value={name}
          onChangeText={(value) => {
            setName(value);
            setDirty(true);
          }}
          placeholder="Canvas name"
          placeholderTextColor={colors.textMuted}
          style={styles.nameInput}
        />
        <ActionButton label="Save" icon={Save} primary loading={loading} disabled={!dirty && Boolean(canvasNote)} onPress={() => void save()} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.canvasStrip}>
        <Pressable
          onPress={reset}
          style={({ pressed }) => [styles.canvasChoice, !canvasNote && styles.canvasChoiceActive, pressed && styles.pressed]}
        >
          <Plus size={14} color={!canvasNote ? colors.accent : colors.textMuted} />
          <Text style={[styles.canvasChoiceText, !canvasNote && styles.canvasChoiceTextActive]}>New</Text>
        </Pressable>
        {canvases.map((canvas) => {
          const active = canvas.id === canvasNote?.id;
          return (
            <Pressable
              key={canvas.id}
              disabled={loading}
              onPress={() => void loadCanvas(canvas.id)}
              style={({ pressed }) => [styles.canvasChoice, active && styles.canvasChoiceActive, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={[styles.canvasChoiceText, active && styles.canvasChoiceTextActive]}>{canvas.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.addRow}>
        <ActionButton label="Card" icon={Plus} onPress={() => addCard()} />
        <ActionButton
          label="Note card"
          icon={FileText}
          onPress={() => setNotePickerOpen((value) => !value)}
        />
        <Text style={styles.counts}>{cards.length} cards  {edges.length} links</Text>
      </View>

      {notePickerOpen ? (
        <View style={styles.picker}>
          <TextInput
            value={noteQuery}
            onChangeText={setNoteQuery}
            placeholder="Find a note"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
            {filteredNotes.map((note) => (
              <Pressable key={note.id} onPress={() => addCard(note)} style={({ pressed }) => [styles.noteRow, pressed && styles.pressed]}>
                <FileText size={15} color={colors.accent} />
                <Text numberOfLines={1} style={styles.noteTitle}>{note.title || 'Untitled note'}</Text>
              </Pressable>
            ))}
            {!filteredNotes.length ? <Text style={styles.empty}>No notes match</Text> : null}
          </ScrollView>
        </View>
      ) : null}

      {connectFrom ? (
        <View style={styles.connectNotice}>
          <Link2 size={14} color={colors.accent} />
          <Text numberOfLines={2} style={styles.connectNoticeText}>
            Linking from {cardLabel(cardById.get(connectFrom) ?? { id: '', x: 0, y: 0, w: 0, h: 0, text: '', color: '' })}. Choose Connect on another card.
          </Text>
          <ActionButton label="Cancel" onPress={() => setConnectFrom('')} />
        </View>
      ) : null}

      <View style={styles.listCard}>
        {cards.map((card) => {
          const expanded = card.id === expandedCardId;
          const linkedNote = card.noteId ? noteById.get(card.noteId) : undefined;
          const incoming = edges.filter((edge) => edge.to === card.id).length;
          const outgoing = edges.filter((edge) => edge.from === card.id).length;
          return (
            <View key={card.id} style={styles.cardBlock}>
              <Pressable
                onPress={() => setExpandedCardId((current) => current === card.id ? '' : card.id)}
                style={({ pressed }) => [styles.cardHeader, pressed && styles.pressed]}
              >
                <View style={[styles.cardColor, { backgroundColor: card.color }]} />
                <View style={styles.cardCopy}>
                  <Text numberOfLines={1} style={styles.cardTitle}>{cardLabel(card)}</Text>
                  <Text style={styles.cardMeta}>{linkedNote ? 'Note' : 'Card'}  {Math.round(card.x)}, {Math.round(card.y)}  {incoming + outgoing} links</Text>
                </View>
                {expanded ? <ChevronDown size={16} color={colors.textMuted} /> : <ChevronRight size={16} color={colors.textMuted} />}
              </Pressable>

              {expanded ? (
                <View style={styles.cardDetails}>
                  <TextInput
                    value={card.text}
                    onChangeText={(text) => updateCard(card.id, { text })}
                    multiline
                    textAlignVertical="top"
                    placeholder="Card text"
                    placeholderTextColor={colors.textMuted}
                    style={styles.cardInput}
                  />

                  <View style={styles.cardActionRow}>
                    {linkedNote ? <ActionButton label="Open note" icon={FileText} onPress={() => onOpenNote(linkedNote.id)} /> : null}
                    <ActionButton label={connectFrom === card.id ? 'Connecting' : 'Connect'} icon={Link2} onPress={() => connect(card.id)} />
                    <ActionButton label="Delete" icon={Trash2} danger onPress={() => deleteCard(card.id)} />
                  </View>

                  <View style={styles.positionBlock}>
                    <Text style={styles.positionLabel}>Position</Text>
                    <View style={styles.positionButtons}>
                      <IconButton icon={ArrowLeft} label="Move card left" onPress={() => moveCard(card.id, -10, 0)} />
                      <IconButton icon={ArrowUp} label="Move card up" onPress={() => moveCard(card.id, 0, -10)} />
                      <IconButton icon={ArrowDown} label="Move card down" onPress={() => moveCard(card.id, 0, 10)} />
                      <IconButton icon={ArrowRight} label="Move card right" onPress={() => moveCard(card.id, 10, 0)} />
                      <Text style={styles.positionValue}>{Math.round(card.x)}, {Math.round(card.y)}</Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
        {!cards.length ? <Text style={styles.empty}>Add a card or note to start the canvas.</Text> : null}
      </View>

      {edges.length ? (
        <View style={styles.linksCard}>
          <Text style={styles.sectionLabel}>Connections</Text>
          {edges.map((edge) => (
            <View key={edge.id} style={styles.edgeRow}>
              <Link2 size={14} color={colors.textMuted} />
              <Text numberOfLines={1} style={styles.edgeText}>
                {cardLabel(cardById.get(edge.from) ?? { id: '', x: 0, y: 0, w: 0, h: 0, text: edge.from, color: '' })} → {cardLabel(cardById.get(edge.to) ?? { id: '', x: 0, y: 0, w: 0, h: 0, text: edge.to, color: '' })}
              </Text>
              <IconButton icon={Unlink} label="Remove connection" danger onPress={() => removeEdge(edge.id)} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  nameInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    color: colors.textPrimary,
    fontSize: typography.sm,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
  canvasStrip: { gap: spacing.xs, paddingVertical: 2 },
  canvasChoice: {
    minHeight: 34,
    maxWidth: 190,
    paddingHorizontal: spacing.sm,
    borderRadius: 17,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  canvasChoiceActive: { backgroundColor: colors.accentSoft },
  canvasChoiceText: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700' },
  canvasChoiceTextActive: { color: colors.accent },
  error: { color: colors.error, fontSize: typography.xs, lineHeight: 17 },
  addRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  counts: { marginLeft: 'auto', color: colors.textMuted, fontSize: typography.xs },
  picker: { borderRadius: radii.xl, backgroundColor: colors.surface2, padding: spacing.sm, gap: spacing.xs },
  searchInput: {
    minHeight: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    paddingHorizontal: spacing.sm,
    fontSize: typography.sm,
  },
  pickerList: { maxHeight: 260 },
  noteRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  noteTitle: { flex: 1, color: colors.textSecondary, fontSize: typography.sm, fontWeight: '600' },
  connectNotice: {
    borderRadius: radii.lg,
    backgroundColor: colors.accentSoft,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  connectNoticeText: { flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: typography.xs, lineHeight: 17 },
  listCard: { borderRadius: radii.xl, backgroundColor: colors.surface2, overflow: 'hidden' },
  cardBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  cardHeader: { minHeight: 54, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardColor: { width: 4, height: 28, borderRadius: 2 },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '700' },
  cardMeta: { marginTop: 2, color: colors.textMuted, fontSize: typography.xs },
  cardDetails: { paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  cardInput: {
    minHeight: 92,
    borderRadius: radii.lg,
    backgroundColor: colors.surface3,
    color: colors.textPrimary,
    fontSize: typography.sm,
    lineHeight: 20,
    padding: spacing.sm,
  },
  cardActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  positionBlock: { gap: 4 },
  positionLabel: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700' },
  positionButtons: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  positionValue: { marginLeft: 'auto', color: colors.textMuted, fontSize: typography.xs, fontVariant: ['tabular-nums'] },
  linksCard: { borderRadius: radii.xl, backgroundColor: colors.surface2, padding: spacing.sm, gap: 4 },
  sectionLabel: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '800' },
  edgeRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  edgeText: { flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: typography.xs },
  empty: { padding: spacing.lg, textAlign: 'center', color: colors.textMuted, fontSize: typography.sm },
  pressed: { opacity: 0.66 },
});
