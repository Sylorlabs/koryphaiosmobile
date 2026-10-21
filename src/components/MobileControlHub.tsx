import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  Activity,
  Bot,
  BookOpen,
  Boxes,
  CircleDollarSign,
  ChevronRight,
  FileText,
  Folders,
  GitBranch,
  History,
  Images,
  Laptop,
  ListChecks,
  MemoryStick,
  MessageSquarePlus,
  MessagesSquare,
  Monitor,
  Palette,
  Plug,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Target,
  Terminal,
  Users,
  Workflow,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

import { useControl } from '../control/ControlProvider';
import { colors, radii, spacing, type as typography } from '../theme/tokens';
import { MobileSurface } from './MobileSurface';

type Destination = {
  label: string;
  icon: LucideIcon;
  href:
    | '/agents'
    | '/activity'
    | '/chats'
    | '/settings'
    | '/settings/appearance'
    | '/machines'
    | '/control/goals'
    | '/control/checklists'
    | '/control/git'
    | '/control/session'
    | '/control/workflows'
    | '/control/history'
    | '/control/computer'
    | '/control/commands'
    | '/control/memory'
    | '/control/notes'
    | '/control/teams'
    | '/control/modelSharing'
    | '/control/mcp'
    | '/control/media'
    | '/control/billing'
    | '/control/workspace'
    | '/control/preferences'
    | '/control/responseStyle'
    | '/control/skills';
};

const destinations: Destination[] = [
  { label: 'Chats & projects', icon: MessagesSquare, href: '/chats' },
  { label: 'Workspace', icon: Folders, href: '/control/workspace' },
  { label: 'Agents', icon: Bot, href: '/agents' },
  { label: 'Agent preferences', icon: BookOpen, href: '/control/preferences' },
  { label: 'Response style', icon: Sparkles, href: '/control/responseStyle' },
  { label: 'Skills', icon: Boxes, href: '/control/skills' },
  { label: 'Chat controls', icon: SlidersHorizontal, href: '/control/session' },
  { label: 'Workflows', icon: Workflow, href: '/control/workflows' },
  { label: 'Goals', icon: Target, href: '/control/goals' },
  { label: 'Checklists', icon: ListChecks, href: '/control/checklists' },
  { label: 'Time Travel', icon: History, href: '/control/history' },
  { label: 'Commands', icon: Terminal, href: '/control/commands' },
  { label: 'Git', icon: GitBranch, href: '/control/git' },
  { label: 'Activity', icon: Activity, href: '/activity' },
  { label: 'Computer', icon: Laptop, href: '/control/computer' },
  { label: 'Notes', icon: FileText, href: '/control/notes' },
  { label: 'Memory', icon: MemoryStick, href: '/control/memory' },
  { label: 'Team access', icon: Users, href: '/control/teams' },
  { label: 'Model sharing', icon: Share2, href: '/control/modelSharing' },
  { label: 'MCP servers', icon: Plug, href: '/control/mcp' },
  { label: 'Media', icon: Images, href: '/control/media' },
  { label: 'Usage & billing', icon: CircleDollarSign, href: '/control/billing' },
  { label: 'Appearance', icon: Palette, href: '/settings/appearance' },
  { label: 'Settings', icon: Settings, href: '/settings' },
  { label: 'Machine', icon: Monitor, href: '/machines' },
];

export function MobileControlHub() {
  const control = useControl();
  // A create acknowledgement belongs to the host/project where it started.
  // Remounting the action state also rejects late A → B → A responses.
  const { pairing, snapshot } = control;
  const scope = JSON.stringify([pairing?.baseUrl, pairing?.machineId, snapshot.activeProjectId]);
  return <ScopedMobileControlHub key={scope} control={control} />;
}

function ScopedMobileControlHub({ control }: { control: ReturnType<typeof useControl> }) {
  const { snapshot, pairing, sendCommand } = control;
  const createInFlight = useRef(false);
  const awaitingCreatedSession = useRef(false);
  const didDismiss = useRef(false);
  const mounted = useRef(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [acceptedSessionId, setAcceptedSessionId] = useState<string | null>(null);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // An accepted create can be followed by a failed or stale host snapshot.
  // Only close this screen when the new chat is actually selected in the
  // current host/project; otherwise keep the uncertain result visible.
  useEffect(() => {
    if (acceptedSessionId && snapshot.activeSessionId === acceptedSessionId && !didDismiss.current) {
      didDismiss.current = true;
      router.back();
    }
  }, [acceptedSessionId, snapshot.activeSessionId]);

  const createChat = async () => {
    // Lock before React has a chance to render the disabled state.
    if (createInFlight.current || awaitingCreatedSession.current) return;
    createInFlight.current = true;
    setCreating(true);
    setCreateError('');
    try {
      const result = await sendCommand('session.create', { projectId: snapshot.activeProjectId });
      if (!result.accepted) throw new Error('Chat creation was not accepted');
      awaitingCreatedSession.current = true;
      if (mounted.current) setAcceptedSessionId(result.sessionId ?? '');
    } catch {
      if (mounted.current) {
        setCreateError('A new chat was not confirmed. Check the chat list before retrying.');
      }
    } finally {
      createInFlight.current = false;
      if (mounted.current) setCreating(false);
    }
  };

  return (
    <MobileSurface title="Controls" showBack={false} closeButton>
      <ScrollView contentContainerStyle={styles.content}>
        {createError ? <Text accessibilityRole="alert" style={styles.actionError}>{createError}</Text> : null}
        {creating ? <Text style={styles.actionStatus}>Creating chat…</Text> : null}
        {acceptedSessionId !== null ? (
          <Text accessibilityRole="alert" style={styles.actionStatus}>
            {acceptedSessionId
              ? 'Host accepted the new chat. Waiting for it to appear in this project. Check Chats before trying again.'
              : 'Host accepted the new chat but returned no chat ID. Check Chats before trying again.'}
          </Text>
        ) : null}
        {pairing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New chat"
            accessibilityState={{ disabled: creating || acceptedSessionId !== null, busy: creating || acceptedSessionId !== null }}
            disabled={creating || acceptedSessionId !== null}
            onPress={() => void createChat()}
            style={({ pressed }) => [styles.row, (creating || acceptedSessionId !== null) && styles.disabled, pressed && styles.pressed]}
          >
            <View style={[styles.iconWrap, styles.newChatIcon]}>
              <MessageSquarePlus size={18} color={colors.onAccent} />
            </View>
            <Text style={[styles.rowText, styles.newChatText]}>New chat</Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {destinations.filter(({ href }) => pairing || href === '/machines').map(({ label, icon: Icon, href }) => (
          <Pressable
            key={href}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => router.replace(href)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Icon size={18} color={colors.accent} strokeWidth={1.8} />
            </View>
            <Text style={styles.rowText}>{label}</Text>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </MobileSurface>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
    gap: 2,
  },
  row: {
    minHeight: 54,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatIcon: {
    backgroundColor: colors.accent,
  },
  newChatText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.55,
  },
  actionError: {
    color: colors.warning,
    fontSize: typography.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  actionStatus: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
