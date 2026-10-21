# Linked-host Open/Unlink repair — October 10, 2026

**Issue:** LINK-01, P1. The linked host card was itself an Open Pressable with a nested Unlink button; unlink immediately removed a pairing with no confirmation.

**Source repair:** src/components/LinkedDesktopPanel.tsx uses a nonpressable row containing independent Open and Unlink actions. Unlink asks for a named destructive confirmation with Cancel. An in-flight guard blocks duplicate actions, errors remain displayed, and per-host accessible labels are supplied. src/components/ui.tsx supports an optional ActionButton accessibilityLabel.

**Tests:** tests/linked-desktop-panel.test.tsx isolates native component mocks and exercises independent touch targets, Cancel and confirmed Unlink, unlink failure, and rapid duplicate Open. Three child cases pass inside one parent wrapper. The latest npm run check **passed 101 parent tests, 370 assertions, 18 files, TypeScript and Expo lint**, exit 0. Other isolated suites (Settings 24/148, Activity 24/246, Machines 6/35) retain their previously recorded results.

**Visual evidence:** [Inspected 17e pairing screenshot](../native-followup/17e-pairing-audit-before.png) shows the unpaired Pair machine entry and a development warning. It does not show the linked panel or any actual pairing/removal result.

**Closure:** **Automated pass; native open.** Pair two safe test hosts on a fingerprinted native build, test Open and Unlink touch separation, Cancel, successful/failed removal, rapid taps and VoiceOver order, and verify actual selected-host identity and pairing persistence.
