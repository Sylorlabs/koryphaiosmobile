# iPad mini installed-app identity — 2026-10-10

**Device:** iPad mini (A17 Pro) simulator, iOS 27.0, UDID `8A73F4A1-3B96-4CCF-82CD-7CD850EA1F01`, observed booted.

`xcrun simctl get_app_container` resolved the installed `com.koryphaios.mobile` application, and its actual `Info.plist` reports:

| Field | Installed value |
| --- | --- |
| Bundle ID | `com.koryphaios.mobile` |
| Display/bundle name | `Koryphaios` |
| Version | `1.0.0` |
| Build number | `1` |
| React Native new architecture | `RCTNewArchEnabled = true` |
| Native executable SHA-256 | `f5c4c3474cbcbde1457c69be8548b010133205e04088eed1397e28e57f8ea767` |

The hash is over the installed `Koryphaios.app/Koryphaios` executable, rather than a build/Metro manifest. This identifies the **native executable**, not the running JavaScript bundle, source state, backend build, or currently served Metro revision. The checkout's app source is largely untracked; do not equate a commit SHA or modified source with the simulator's loaded JavaScript until a runtime fingerprint is explicitly recorded.

The [visually inspected Workspace screenshot](mini-current-after-settings-lock.png) was captured on the same UDID and showed an empty Workspace with a Connected indicator and Open chats CTA. It does not demonstrate the native executable's streaming/control behavior or that the latest Settings fix is loaded in the app.

**Gate:** named native binary evidence collected for this one iPad mini simulator. Source/JS runtime build identity, actual Settings interaction, complete direct and linked send→incremental stream→stop, and physical-device confirmation remain open.
