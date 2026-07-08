# fsM4LVersionChecker

A lightweight version checker for Max for Live devices. On hover, it shows the local version and checks a public `versions.json` manifest for updates. Failures are silent — the device keeps working normally.

## Files

- **`fsVersionChecker.js`** — `[js]` script for each device
- **`versions.json`** — published manifest of latest device versions

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

The target must be click-responsive (Max `[hover]` requirement). The script only updates the target object's `hint` attribute.

## Hover behaviour

| Time | Hint |
|---|---|
| 1 s | `Version <local>` |
| 2 s | `Checking for updates…` |
| 3 s | `Up to date`, `Update available: <latest>`, `Running development version`, or an error message |

The manifest is cached per Live session after the first successful fetch.

## Constraints

No analytics, authentication, user tracking, Node for Max, polling, or external dependencies. A single public JSON fetch on hover — nothing more.
