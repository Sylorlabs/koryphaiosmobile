# iPhone 17e: native pairing UX evidence (October 10, 2026)

Device: iPhone 17e simulator, iOS 27.0, foreground `com.koryphaios.mobile`, Expo development app. These screenshots were captured **before** the current pairing copy/feedback and QR submission guards. Exact JavaScript bundle and native candidate build hash were not captured; no physical iPhone or authentic desktop pairing was proven.

| Image | Actual observed state | Finding / limitation |
| --- | --- | --- |
| [01](01-iphone17e-overlay-before.png) | Unpaired landing with development overlay. | Overlay complicates safe-area assessment; launch only. |
| [02](02-iphone17e-pair-form.png) | Pair machine form with remote-address entry. | Navigation into form proven; pairing untested. |
| [03](03-iphone17e-pair-empty-validation.png) | Empty submitted address reveals inline validation. | Existing validation was present; edit recovery had not been checked. |
| [04](04-iphone17e-keyboard.png) | Input focused with software keyboard. | Keyboard appears; actual reachability and address validation needed replay. |
| [05](05-iphone17e-invalid-address-feedback.png) | Unreachable address shows a global “Desktop unavailable” banner and a second inline error. | Duplicate/unhelpful feedback; **PAIR-UX-01**. The name may be syntactically valid for a LAN host despite being unreachable. |
| [06](06-iphone17e-link-qr.png) | QR Link screen retains the earlier manual-pair global error. | Error bleeds across routes; **PAIR-UX-01**. |
| [07](07-iphone17e-after-camera-permission.png) | After the first camera permission grant, the app appears on onboarding instead of the scanner. | **PAIR-UX-03**: reproduce and inspect app lifecycle before diagnosing cause. This image alone does not prove a camera API regression. |
| [08](08-iphone17e-qr-scanner.png) | Second Scan opens the native camera preview and close affordance. | Basic scanner opening displayed; simulator preview is white; no actual QR or host pair occurred. |

## Source repairs and verification boundary

- `MachinesView`: explicit address format/empty validation, readable LAN/Tailscale guidance and clearing local feedback when edited.
- `CommandFeedback`: on unpaired Machines and QR Link routes, suppress global stale connection errors when there is no command feedback.
- `DevicePairingView`: clear pasted-link local errors on edit; synchronously guard repeated QR callbacks and pasted-link presses; show actionable camera-denial or preview-start failure fallback.
- Focused regressions: new `machines-view`, `command-feedback`, and **four** `device-pairing-view` child scenarios. Latest `npm run check` **103 parent tests / 372 expectations / 20 files**, TypeScript and Expo lint, exit 0. Earlier Expo Doctor 21/21; no dependency/config changes in this repair.

A native `agent-device` navigation **back from QR Link to Machines** after these first two fixes showed the new `Desktop address` accessibility label and helper: “Enter the reachable LAN or Tailscale address of your desktop while Koryphaios is running. You can also link by QR code above.” This verifies only that the revised source copy rendered in the active development session. The follow-up simulator pairing action's execution status was not obtained: the tool's attempt to poll that session was refused by automatic review. It therefore does **not** establish post-fix validation, QR handling, error suppression, scanner fallback, camera lifecycle or end-to-end pairing. No native journey is closed.

## Required replay

On an identified current native build: fresh 17e → Pair machine → empty submit/edit → reject path-bearing URL locally → unreachable-but-well-formed host and single inline error → QR Link without previous global banner → camera permission grant/deny → scanner preview/failure fallback → genuine scanned and pasted controlled pairing link → one authenticated desktop grant, restart and revoke. Repeat critical paths on Pro Max, windowed mini and physical iPhone/iPad; record source/native/host identities and actual host effects. Keep `PAIR-01` durable secure-store failure and `REL-02` authenticated control as separate P0 gates.
