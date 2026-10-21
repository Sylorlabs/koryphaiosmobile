import React from 'react';
import {
  Dimensions,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Activity, ArrowLeft, Bot, House, Monitor, RefreshCw, Settings } from 'lucide-react-native';
import { router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useControl } from '../control/ControlProvider';
import { machineDisplayName, machineLivePresentation } from '../control/connectionPresentation';
import { breakpoints, colors, radii, spacing, type as typography } from '../theme/tokens';
import { IconButton, StatusDot } from './ui';
import { CommandFeedback } from './CommandFeedback';

const navItems = [
  { href: '/workspace', label: 'Workspace', icon: House },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === '/workspace') return pathname === '/workspace' || pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdaptiveShell({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const pathname = usePathname();
  const { snapshot, pairing, live, refreshing, refresh } = useControl();
  const screen = Dimensions.get('screen');
  const windowedIPad = Platform.OS === 'ios' && Platform.isPad &&
    (width < screen.width - 24 || height < screen.height - 24);
  const machineName = machineDisplayName(snapshot.machine, pairing);
  const machineConnection = machineLivePresentation(Boolean(pairing) && snapshot.machine.id !== 'unpaired', snapshot.machine.status, live.connection);
  const workspaceRoute = pathname === '/workspace' || pathname === '/';
  const showSideNav = width >= breakpoints.rail && height >= breakpoints.medium;
  const showLabels = width >= breakpoints.threeColumn && height >= breakpoints.medium && !workspaceRoute;
  const showHeader = !workspaceRoute;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/workspace');
  };

  return (
    <SafeAreaView style={[styles.safeArea, windowedIPad && styles.windowedIPadSafeArea]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.root}>
        {showSideNav ? (
          <View style={[styles.sideNav, showLabels ? styles.sideNavWide : styles.sideNavRail]}>
            <View style={[styles.brandRow, !showLabels && styles.brandRowCentered]}>
              <Image source={require('../../assets/kory-logo.png')} style={styles.logo} />
              {showLabels ? <Text style={styles.brandText}>Koryphaios</Text> : null}
            </View>

            <View style={styles.sideNavItems}>
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Pressable
                    key={href}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      // Expo Router push always adds another stack entry.
                      // The main rail instead returns to an existing section,
                      // and tapping the current section should do nothing.
                      if (pathname === href || (href === '/workspace' && pathname === '/')) return;
                      router.navigate(href);
                    }}
                    style={({ pressed }) => [
                      styles.sideNavItem,
                      !showLabels && styles.sideNavItemRail,
                      active && styles.sideNavItemActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon size={19} color={active ? colors.accent : colors.textMuted} strokeWidth={1.9} />
                    {showLabels ? <Text style={[styles.sideNavLabel, active && styles.sideNavLabelActive]}>{label}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remote machine: ${machineName}. ${machineConnection.label}. Open Machines`}
              onPress={() => router.push('/machines')}
              style={({ pressed }) => [
                styles.machineDock,
                !showLabels && styles.machineDockRail,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.machineIconWrap}>
                <Monitor size={18} color={colors.textSecondary} strokeWidth={1.8} />
                <View style={styles.machineStatusFloat}>
                  <StatusDot status={machineConnection.status} size={6} />
                </View>
              </View>
              {showLabels ? (
                <View style={styles.machineDockCopy}>
                  <Text numberOfLines={1} style={styles.machineDockName}>
                    {machineName}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        ) : null}

        <View style={styles.main}>
          {showHeader ? (
            <View style={styles.header}>
              {!showSideNav ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={goBack}
                  style={({ pressed }) => [styles.compactBack, pressed && styles.pressed]}
                >
                  <ArrowLeft size={20} color={colors.textSecondary} />
                </Pressable>
              ) : null}
              <View style={styles.headerCopy}>
                <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
                {subtitle && width >= breakpoints.medium ? <Text numberOfLines={1} style={styles.headerSubtitle}>{subtitle}</Text> : null}
              </View>
              {right}
              {showSideNav ? (
                <View style={styles.headerMachine} accessible accessibilityLabel={`${machineName}. ${machineConnection.label}`}>
                  <StatusDot status={machineConnection.status} />
                  <View style={styles.headerMachineCopy}>
                    <Text numberOfLines={1} style={styles.headerMachineText}>{pairing ? machineName : 'Pair machine'}</Text>
                    {pairing ? (
                      <Text numberOfLines={1} style={styles.headerMachineState}>
                        {machineConnection.label.replace('Desktop online · ', '')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
              {pairing && showSideNav ? (
                <IconButton
                  icon={RefreshCw}
                  label="Refresh remote state"
                  active={refreshing}
                  disabled={refreshing}
                  onPress={() => void refresh()}
                />
              ) : null}
            </View>
          ) : null}

          <CommandFeedback />
          <View style={styles.content}>{children}</View>
        </View>
        {workspaceRoute && showSideNav ? <View pointerEvents="none" style={styles.workspaceBalanceRail} /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface1,
  },
  // Floating iPad windows put their traffic-light controls inside the top of
  // the app surface; native safe-area insets alone don't account for them.
  windowedIPadSafeArea: { paddingTop: 42 },
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.surface0,
  },
  sideNav: {
    backgroundColor: colors.surface1,
    paddingVertical: spacing.sm,
  },
  sideNavRail: {
    width: 68,
    paddingHorizontal: spacing.xs,
  },
  sideNavWide: {
    width: 188,
    paddingHorizontal: spacing.sm,
  },
  brandRow: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  brandRowCentered: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
  },
  brandText: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '800',
    letterSpacing: -0.15,
  },
  sideNavItems: {
    flex: 1,
    paddingTop: spacing.md,
    gap: spacing.xxs,
  },
  sideNavItem: {
    minHeight: 44,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sideNavItemRail: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  sideNavItemActive: {
    backgroundColor: colors.accentSoft,
  },
  sideNavLabel: {
    color: colors.textMuted,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  sideNavLabelActive: {
    color: colors.textPrimary,
  },
  machineDock: {
    minHeight: 54,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface2,
  },
  machineDockRail: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  machineIconWrap: {
    position: 'relative',
  },
  machineStatusFloat: {
    position: 'absolute',
    right: -4,
    bottom: -3,
    backgroundColor: colors.surface2,
    borderRadius: 5,
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  machineDockCopy: {
    minWidth: 0,
    flex: 1,
  },
  machineDockName: {
    color: colors.textSecondary,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  main: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface0,
  },
  workspaceBalanceRail: {
    width: 68,
    flexShrink: 0,
    backgroundColor: colors.surface1,
  },
  header: {
    minHeight: 58,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface1,
  },
  compactBack: {
    width: 44,
    height: 44,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    minWidth: 0,
    flex: 1,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: typography.base,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  headerMachine: {
    maxWidth: 150,
    minHeight: 36,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface2,
  },
  headerMachineCopy: {
    minWidth: 0,
    flexShrink: 1,
  },
  headerMachineText: {
    color: colors.textSecondary,
    fontSize: typography.xs,
    fontWeight: '600',
  },
  headerMachineState: {
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  commandStatus: {
    color: colors.textMuted,
    fontSize: typography.xs,
    marginLeft: spacing.xs,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  bottomNav: {
    minHeight: 64,
    paddingHorizontal: spacing.xs,
    paddingTop: 4,
    backgroundColor: colors.surface1,
    flexDirection: 'row',
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bottomNavIcon: {
    minWidth: 42,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNavIconActive: {
    backgroundColor: colors.accentSoft,
  },
  bottomNavLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  bottomNavLabelActive: {
    color: colors.accent,
  },
  pressed: {
    opacity: 0.68,
  },
});
