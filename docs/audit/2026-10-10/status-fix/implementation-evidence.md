# `UX-03` machine REST/live presentation — October 10, 2026

## Reproduced discrepancy and scope

Native pre-change [iPhone Pro Machines](../connected-attempt/iphone17pro-machines.png) and [iPad mini Machines](../connected-attempt/ipadmini-machines-early.png) appeared healthy via REST. Their corresponding [iPhone Workspace](../connected-attempt/iphone17pro-workspace-later.png) and [mini Workspace](../connected-attempt/ipadmini-workspace-later.png) reported a lost live channel. A subsequent bearer-format fix connected Workspace; it did not correct the machine indicator's REST-only semantic or verify command execution.

Source inspection found the tablet `AdaptiveShell` and `MachinesView` indicators took only `snapshot.machine.status` (REST health). The shell's 150-point header pill appended raw `live.connection` text that could truncate, and its icon-only machine dock had a generic accessibility label.

## Fix

- `src/control/connectionPresentation.ts`: shared `machineLivePresentation` shows green only for paired desktop-online **and** live-connected; amber for checking/reconnecting; red for offline, lost or disconnected live control. Each state has readable text.
- `src/components/MachinesView.tsx`: show the machine platform/REST reachability and distinct live status in the card; its dot uses the combined state. REST latency is still independent from a live command result.
- `src/components/AdaptiveShell.tsx`: same combined dot for dock/header, a two-line host and state pill within the 150-point cap, and host-specific VoiceOver labels. The actual `REL-02` transport behavior is unchanged.
- `tests/connection-presentation.test.ts`, `tests/machines-view.test.tsx`: check REST-online/live-lost disagreement and Machines card/dot output.

## Validation and remaining native work

- `KORYPHAIOS_MACHINES_TEST_CHILD=1 bun test tests/machines-view.test.tsx`: **6 pass, 0 fail, 35 expectations**, exit 0.
- `npm run check` after the final shell pill adjustment: **95 parent tests, 0 fail, 340 expectations across 15 files**, plus TypeScript and Expo lint, exit 0.
- Expo Doctor from earlier October 10 check: **21/21**; not rerun because no dependency/config change.

**Automated source/UI behavior passed. Native remains open.** Old screenshots are **before** this repair. Capture paired REST-online/live-connected, REST-online/live-error and desktop-offline states on iPhone 17 Pro and windowed mini with current build identity; verify card status, header truncation, side rail and VoiceOver, then pair with actual send/stream/stop and desktop reconciliation. Do not count an indicator or source test as a host-control result.
