# Simulator native executable identity — October 10, 2026

Read-only examination of the installed `com.koryphaios.mobile` bundle on **iPhone 17 Pro** and **iPad mini (A17 Pro)** iOS 27.0 simulators. No install, launch, tapping, host mutation, data deletion or deployment occurred in this inspection.

| Field | iPhone 17 Pro | iPad mini |
| --- | --- | --- |
| Bundle identifier | `com.koryphaios.mobile` | `com.koryphaios.mobile` |
| Version / build | `1.0.0` / `1` | `1.0.0` / `1` |
| Xcode build | `27A5228h` | `27A5228h` |
| SDK build in bundle | `24A5390e` | `24A5390e` |
| Declared minimum iOS | `16.4` | `16.4` |
| SHA-256 of app executable | `f5c4c3474cbcbde1457c69be8548b010133205e04088eed1397e28e57f8ea767` | Same |
| Bundle size (sum of files) | ~149.1 MB | ~149.1 MB |
| Embedded `.hbc` assets | None detected | None detected |

The simulator executables have the same hash, so these two simulators share the same **native executable**. The running JavaScript can be obtained dynamically from Metro, and its version/source fingerprint has **not** been established. Neither a signed distributable build, current-source provenance nor a physical-device run is proven. SDK `24A5390e` is a build identifier reported by `Info.plist`; do not infer an Xcode or Duo-specific SDK requirement from this string alone.

Screenshots were saved at 23:54 PDT and visually inspected. [Pro](04-iphone17pro-after-note-guard.png) shows Agent behavior Settings with an Expo warning at the bottom. [Mini](05-ipadmini-after-note-guard.png) shows Chats in a floating window, one `New Session` row and a horizontally scrolling project selector partially clipped at the right edge. Neither screenshot exercises Notes, send/stream/stop, linked transport, VoiceOver or remote desktop effects. Treat them as **visual observations only**.

**Next native evidence:** pin current source/Metro JS and desktop build identities; navigate to Notes on a simulator with supported, authorized interaction; inspect dirty Back, keep/discard while keyboard is present; capture command + independent desktop note revision. Repeat real streaming/stop/reconnect on direct and linked hosts before assigning readiness to any device class.
