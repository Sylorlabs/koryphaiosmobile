# October 11 iPhone 17 Pro native boot attempt

- Device: iPhone 17 Pro (simulator UUID `4ADB02EE-1CC6-4433-909A-1B1F247FA068`), iOS 27.0. Xcode developer directory supplied explicitly as `/Applications/Xcode-beta.app/Contents/Developer` because system default CommandLineTools cannot locate `simctl`.
- `simctl boot` and `bootstatus` succeeded; installed `com.koryphaios.mobile` launched with PID reported.
- [`iphone17pro-start.png`](iphone17pro-start.png): native React Native red screen says **“No script URL provided”**, consistent with the development server being stopped. No product screen was usable.
- Expo 57 Metro first started with `--localhost --port 8081`; `lsof` showed `[::1]:8081` only, an IPv4 `127.0.0.1` probe failed, and [`iphone17pro-metro.png`](iphone17pro-metro.png) still showed the red screen.
- Restarted Metro with `--host lan --port 8081`: `lsof` showed `*:8081` and `curl` of `127.0.0.1:8081` returned HTTP 200. This confirms host-side Metro availability only. It does not prove the simulator successfully loaded the current JavaScript bundle.
- One native `simctl terminate` subsequently returned exit 0. A separate request to poll the Expo Metro process was refused by automatic tool review; no later native success is claimed.

**Outstanding:** load a fingerprinted current JS bundle in a known development/native binary, capture a working route, interact with Pair/Chats/Notes/Controls, then complete both transport journeys and independent desktop readback. A signed/physical-device acceptance is still required.
