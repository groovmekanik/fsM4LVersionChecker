# fsM4LVersionChecker

A lightweight version checker for Max for Live devices. On hover, it shows the local version and checks a public `versions.json` manifest for updates. Failures are silent — the device keeps working normally.

**Status:** Tested in standalone Max via `basicTesting.maxpat`. Not yet tested in a production M4L device.

## Files

- **`fsVersionChecker.js`** — `[js]` script for each device
- **`versions.json`** — published manifest of latest device versions
- **`basicTesting.maxpat`** — standalone Max patcher for local testing (see below)

## Testing in Max

Open **`basicTesting.maxpat`** in Max to exercise the checker without Ableton Live.

The patch includes:

- `[js fsVersionChecker.js bandSplit 1.5 test123]` — example config with an older local version so update messaging is visible
- `[hover]` wired to the js object (outlet 0 → inlet 0, outlet 2 → inlet 1)
- A `[live.dial]` with scripting name **`test123`** as the hover target
- A **button** (`bang`) and **`check`** message wired to the js object for setup verification

Hover the dial and watch its hint attribute change over time. Leave hover to confirm the hint clears.

Send **`bang`** to the js object to verify jsarguments and that the target object is found. Send **`check`** to fetch the manifest (or use the session cache) and log the latest version plus the resolved hover message. Neither message affects the target hint.

## Manifest

```json
{
  "devices": {
    "bandSplit": { "latest": "2.0.0" }
  }
}
```

Hosted at:

`https://raw.githubusercontent.com/groovmekanik/fsM4LVersionChecker/main/versions.json`

## Device setup

1. Give the display object a **scripting name** (e.g. `bar-display`).
2. Add the checker:

```
js fsVersionChecker.js bandSplit 2.0.0 bar-display
```

3. Add **`[hover]`** and wire:
   - outlet 0 (enter) → `js` inlet 0
   - outlet 2 (leave) → `js` inlet 1

The target must be click-responsive (Max `[hover]` requirement). The script only updates the target object's `hint` attribute, clearing it on hover enter and leave.

### Setup verification

Wire a button to the js inlet (or use `basicTesting.maxpat`) and confirm in the Max console:

| Message | Purpose |
|---|---|
| **`bang`** | Logs `deviceId`, `localVersion`, `target` scripting name, and `targetFound=yes/no` |
| **`check`** | Fetches `versions.json` (once per session), logs e.g. `bandSplit latest = 2.0.0 (Update available: 2.0.0)` |

Use **`bang`** first when integrating into a device — no network required. Use **`check`** to confirm the device ID exists in the manifest and network access works. Both are safe to leave wired in production; they only write to the Max console.

## Hover behaviour

### First hover (per Live session)

| Time | Hint |
|---|---|
| 2 s | `Version <local>` — fetch starts |
| 4 s | `Checking for updates…` |
| 6 s | `Up to date`, `Update available: <latest>`, `Running development version`, or an error message |

Max controls when hints actually appear on screen; these intervals are the scheduled delays from hover enter.

### Repeat hover

After the first successful check, later hovers skip the version and checking stages. The cached result appears after **2 s**. The hint is cleared again when the pointer leaves.

The manifest and result message are cached per Live session after the first successful fetch.

## Constraints

No analytics, authentication, user tracking, Node for Max, polling, or external dependencies. A single public JSON fetch on hover — nothing more.
