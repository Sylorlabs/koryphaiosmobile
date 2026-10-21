# Fresh simulator screenshot review — 2026-10-10 19:49 PDT

Evidence tier: visual capture only. No touch walkthrough, verified authoritative desktop response, or physical-device acceptance is represented by these captures.

## iPhone 17 Pro

- Source: `iphone17pro-current.png`.
- Visible route: **Agent behavior** (advanced settings).
- The settings content renders with rows for enforcement, execution mode, preferences, external paths, model access, notes, critic gate, gate strictness, and intent interview. This is visual presence only: toggles, selectors, and edit actions have not been exercised.
- A persistent development warning toast (`Open debugger to view warnings.`) covers the lower portion of the screen. Treat this as development-build interference and investigate the underlying warning; do not claim that the production UI has this overlay.
- Needs keyboard, scrolling, safe-area, accessible-label, and hit-target checks on a clean production-like build.

## iPad mini A17 Pro

- Source: `ipadmini-current.png`.
- The Koryphaios workspace displays in a resizable/windowed iPad presentation rather than full screen. The system dock is visible.
- Workspace status reads **Connected** and names a backend, while a bright blue title bar reads **Refreshing...**. A connected label is not a successful end-to-end stream or command acknowledgment.
- Empty conversation state reads **Choose a chat to begin** with an **Open chats** CTA. Composer is visible but cannot establish send behavior without selecting or creating a chat.
- Needs Stage Manager / window resizing, portrait/landscape, sidebar navigation, empty-state and loading-state, keyboard and send-action validation.

## iPhone 17 Pro Max

- Source: `iphone17promax-current.png`.
- The visible UI is an operating-system deep-link prompt, `Open in “Koryphaios”?`, obscuring the app. A blue **Refreshing...** bar is visible behind it near the status area.
- **Reject as app-screen acceptance evidence.** This screenshot does not establish that the app reached an interactive, stable route. Dismiss the prompt with the intended action and recapture after the app settles.
- Do not label the system prompt or temporary loading bar a verified production defect until reproduced outside the launch/deep-link setup.

## Immediate follow-up

1. Establish a clean launch in each simulator; remove dev-only overlays, dismiss operating-system prompts, and recapture stable screens.
2. Run genuine touch journeys for create/select/send, at least three streamed partial outputs, stop/restart/reconnect, and desktop-authoritative result verification using disposable fixtures.
3. Compare each visible control against the desktop Koryphaios application, then repair reproducible mismatches and rerun focused and full checks.
4. Add 11-inch and 13-inch iPad, iPhone base, Air, Pro, Pro Max, and Duo coverage; keep unsupported/unavailable device classes marked unverified.

Audit access note: a read-only shell inspection of the local mobile workspace (`pwd`, `git status --short`, `AGENTS.md`, and the existing mega-audit ledger) was rejected by automatic safety review with `couldn't determine the safety status of the request`. The proposed source review and repairs have not been rerun after that refusal.
