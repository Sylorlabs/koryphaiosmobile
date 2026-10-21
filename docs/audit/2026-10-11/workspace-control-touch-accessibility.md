# UX-TOUCH-02 — Workspace Goals, Checklists and Git

**Date:** October 11, 2026. **Disposition:** source + focused tests repaired; native, desktop and signed-device acceptance open. Release **NO-GO**.

## Reproduced issue

`src/components/WorkspaceControls.tsx` rendered Goals and Checklists status/remove icons at 32×32 points, Git Switch/Merge controls at 24 points high with no guaranteed 44-point width, and the panel Close button at 40×40 points. Several icon-only controls did not declare button semantics or identify the affected checklist item, diff or Git branch to VoiceOver. The scope selector was only 32 points tall and did not announce selection. On narrow phone screens these targets invite mis-taps; iPad users cannot reliably distinguish two adjacent unlabeled branch actions with assistive technology.

The four isolated rendered regressions in `tests/workspace-control-touch-accessibility.test.tsx` all failed before repair, demonstrating missing labels/roles and selection semantics. After repair **4/4 pass, 49 expectations**. Tests use a mock desktop adapter and do not mutate Git, Goals or Checklists on the real host.

## Source change

- Goals/checklist inline icons and diff Close are now **44×44 points**; panel Close is **44×44**; Git branch controls are at least **44×44**; scope/tab chips are at least 44 points tall. Checklist rows expand to accommodate targets.
- Each icon action exposes `accessibilityRole="button"` and a contextual label: goal check title, checklist mark/skip/remove action, Git branch name and merge destination, or inspected file. Section chips announce the selected state, and Goal detail expansion and lifecycle controls have explicit semantics.
- Verified mocked command payloads for goal-check removal, checklist mark/skip/remove and Git branch checkout/merge are unchanged; closing a diff does not close the entire panel.

## Checks and remaining proof

| Check | Result |
| --- | --- |
| Focused child suite | 4 passed, 0 failed, 49 expectations; red-before-green |
| `npm run typecheck` | PASS, current edit |
| `npm run lint` | PASS, current edit |
| Full `npm run test` | Started, but automatic safety review **blocked result polling**; current aggregate outcome unknown. Last completed historical run: 155 pass, 2 fail. |
| Native interaction, actual VoiceOver, device layout | **NOT VERIFIED** |
| Direct/linked desktop side effects or signed TestFlight | **NOT VERIFIED** |

### Native follow-up, in order

1. On a fingerprinted build at compact iPhone width, open Goals → expanded check and Checklists → mark, skip, remove; capture before/pressed/pending/confirmed/rejected states and measure tappability without mis-activating adjacent icons.
2. Recheck a resizable iPad mini window and iPad Pro in portrait/landscape, with large Dynamic Type. Verify 44-point targets do not clip text or create unreachable horizontal content.
3. With VoiceOver, confirm every control announces the affected item and action, current scope selection, branch name, intended merge destination, and Close diff versus Close panel; inspect focus progression after actions.
4. Using a **disposable** desktop repository, exercise branch checkout/merge and checklist mutations through both direct and linked transport and independently read back the exact host state. Test rejected commands and delayed responses. Record tap-to-feedback p50/p95 on devices.

This is a source/interaction-test correction. No new valid native screenshots or physical iOS tests were captured in this continuation, and these changes do not resolve missing incremental streaming or other release P0s.
