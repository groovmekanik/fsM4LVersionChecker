// fsVersionChecker.js — version check on hover for Max for Live
//
// Setup:
//   1. Scripting name on display object (matches arg 3)
//   2. js fsVersionChecker.js <deviceId> <localVersion> <targetScriptingName>
//   3. [hover] outlet 0 → js inlet 0, outlet 2 → js inlet 1
//
// Only edits the target hint attribute.

autowatch = 1;
inlets = 2;
outlets = 0;

var VERSION_URL = "https://raw.githubusercontent.com/groovmekanik/fsM4LVersionChecker/main/versions.json";
var FETCH_TIMEOUT_MS = 4000;
var STAGE_VERSION_MS = 1000;
var STAGE_CHECKING_MS = 2000;
var STAGE_RESULT_MS = 3000;

var DEVICE_ID = "";
var LOCAL_VERSION = "";
var TARGET_VARNAME = "";

var devicePatcher = null;
var cachedManifest = null;
var hoverActive = false;
var hoverToken = 0;
var fetchInFlight = false;
var scheduledTasks = [];

/**
 * Reads device config from jsarguments typed into the js object box.
 * Parameters: none.
 * Returns: true when DEVICE_ID, LOCAL_VERSION, and TARGET_VARNAME are set.
 * Used by: loadbang().
 */
function readConfigFromArguments() {
    if (jsarguments.length < 4) {
        post("fsVersionChecker: expected js fsVersionChecker.js <deviceId> <version> <targetVarname>\n");
        return false;
    }

    DEVICE_ID = String(jsarguments[1]);
    LOCAL_VERSION = String(jsarguments[2]);
    TARGET_VARNAME = String(jsarguments[3]);
    return true;
}

/**
 * Updates the hint attribute on the named target object via getnamed().
 * Parameters:
 *   hintText (string): user-facing hint text.
 * Returns: nothing.
 * Used by: hover stage callbacks.
 */
function setTargetHint(hintText) {
    var target;

    if (!devicePatcher) {
        return;
    }

    target = devicePatcher.getnamed(TARGET_VARNAME);
    if (!target) {
        return;
    }

    try {
        target.message("hint", hintText);
        return;
    } catch (error) {
    }

    try {
        target.setboxattr("hint", hintText);
    } catch (error2) {
        post("fsVersionChecker: failed to set hint on " + TARGET_VARNAME + "\n");
    }
}

/**
 * Cancels all scheduled hover stage tasks.
 * Parameters: none.
 * Returns: nothing.
 * Used by: beginHoverSequence(), cancelHoverSequence().
 */
function cancelScheduledTasks() {
    var index;

    for (index = 0; index < scheduledTasks.length; index++) {
        try {
            scheduledTasks[index].cancel();
        } catch (error) {
        }
    }

    scheduledTasks = [];
}

/**
 * Schedules a hover stage callback after a delay.
 * Parameters:
 *   delayMs (number): delay in milliseconds.
 *   callback (function): function invoked when the stage is reached.
 *   token (number): hover generation token used to ignore stale callbacks.
 * Returns: nothing.
 * Used by: beginHoverSequence().
 */
function scheduleHoverStage(delayMs, callback, token) {
    var task = new Task(function() {
        if (token !== hoverToken || !hoverActive) {
            return;
        }

        callback();
    });

    task.schedule(delayMs);
    scheduledTasks.push(task);
}

/**
 * Splits a dotted version string into numeric parts.
 * Parameters:
 *   versionString (string): version such as "1.0.10".
 * Returns: array of numbers.
 * Used by: compareVersions().
 */
function parseVersionParts(versionString) {
    var rawParts = String(versionString).split(".");
    var parts = [];
    var index;

    for (index = 0; index < rawParts.length; index++) {
        var parsed = parseInt(rawParts[index], 10);
        parts.push(isNaN(parsed) ? 0 : parsed);
    }

    return parts;
}

/**
 * Compares two dotted numeric version strings.
 * Parameters:
 *   localVersion (string): installed device version.
 *   remoteVersion (string): manifest latest version.
 * Returns: -1 when local is older, 0 when equal, 1 when local is newer.
 * Used by: resolveCheckHint().
 */
function compareVersions(localVersion, remoteVersion) {
    var localParts = parseVersionParts(localVersion);
    var remoteParts = parseVersionParts(remoteVersion);
    var maxLength = localParts.length > remoteParts.length ? localParts.length : remoteParts.length;
    var index;

    for (index = 0; index < maxLength; index++) {
        var localPart = index < localParts.length ? localParts[index] : 0;
        var remotePart = index < remoteParts.length ? remoteParts[index] : 0;

        if (localPart < remotePart) {
            return -1;
        }

        if (localPart > remotePart) {
            return 1;
        }
    }

    return 0;
}

/**
 * Resolves the final user-facing hint from a parsed manifest.
 * Parameters:
 *   manifest (object): parsed versions.json content.
 * Returns: hint string for the 3 second stage.
 * Used by: showResultStage().
 */
function resolveCheckHint(manifest) {
    var devices;
    var deviceEntry;
    var latestVersion;
    var comparison;

    if (!manifest || typeof manifest !== "object") {
        return "Could not check for updates";
    }

    devices = manifest.devices;
    if (!devices || typeof devices !== "object") {
        return "Could not check for updates";
    }

    deviceEntry = devices[DEVICE_ID];
    if (!deviceEntry || typeof deviceEntry !== "object" || !deviceEntry.latest) {
        return "Version info unavailable";
    }

    latestVersion = String(deviceEntry.latest);
    comparison = compareVersions(LOCAL_VERSION, latestVersion);

    if (comparison < 0) {
        return "Update available: " + latestVersion;
    }

    if (comparison > 0) {
        return "Running development version";
    }

    return "Up to date";
}

/**
 * Starts an asynchronous manifest fetch when no session cache exists.
 * Parameters: none.
 * Returns: nothing.
 * Used by: showVersionStage().
 */
function fetchManifestIfNeeded() {
    var xhr;

    if (cachedManifest || fetchInFlight) {
        return;
    }

    fetchInFlight = true;

    try {
        xhr = new XMLHttpRequest();
    } catch (error) {
        fetchInFlight = false;
        post("fsVersionChecker: XMLHttpRequest unavailable\n");
        return;
    }

    xhr.open("GET", VERSION_URL, true);
    xhr.timeout = FETCH_TIMEOUT_MS;

    xhr.onreadystatechange = function() {
        if (xhr.readyState !== 4) {
            return;
        }

        fetchInFlight = false;

        if (xhr.status === 200) {
            try {
                cachedManifest = JSON.parse(xhr.responseText);
            } catch (parseError) {
                post("fsVersionChecker: JSON parse error\n");
            }
            return;
        }

        post("fsVersionChecker: HTTP status " + xhr.status + "\n");
    };

    xhr.onerror = function() {
        fetchInFlight = false;
        post("fsVersionChecker: request error\n");
    };

    xhr.ontimeout = function() {
        fetchInFlight = false;
        post("fsVersionChecker: request timeout\n");
    };

    xhr.send();
}

/**
 * Shows the local version hint and starts the manifest fetch.
 * Parameters: none.
 * Returns: nothing.
 * Used by: hover stage scheduler.
 */
function showVersionStage() {
    setTargetHint("Version " + LOCAL_VERSION);
    fetchManifestIfNeeded();
}

/**
 * Shows the in-progress hint while waiting for the manifest fetch.
 * Parameters: none.
 * Returns: nothing.
 * Used by: hover stage scheduler.
 */
function showCheckingStage() {
    setTargetHint("Checking for updates\u2026");
}

/**
 * Shows the final version-check result hint.
 * Parameters: none.
 * Returns: nothing.
 * Used by: hover stage scheduler.
 */
function showResultStage() {
    var hintText;

    if (cachedManifest) {
        hintText = resolveCheckHint(cachedManifest);
    } else {
        hintText = "Could not check for updates";
    }

    setTargetHint(hintText);
}

/**
 * Starts the timed hover hint sequence.
 * Parameters: none.
 * Returns: nothing.
 * Used by: msg_symbol() on hover enter.
 */
function beginHoverSequence() {
    var token = hoverToken;

    cancelScheduledTasks();
    scheduleHoverStage(STAGE_VERSION_MS, showVersionStage, token);
    scheduleHoverStage(STAGE_CHECKING_MS, showCheckingStage, token);
    scheduleHoverStage(STAGE_RESULT_MS, showResultStage, token);
}

/**
 * Stops the hover sequence and invalidates pending stage callbacks.
 * Parameters: none.
 * Returns: nothing.
 * Used by: msg_symbol() on hover leave.
 */
function cancelHoverSequence() {
    hoverToken += 1;
    hoverActive = false;
    cancelScheduledTasks();
}

/**
 * Initialises checker config from jsarguments on device load.
 * Parameters: none.
 * Returns: nothing.
 * Used by: Max loadbang message.
 */
function loadbang() {
    devicePatcher = this.patcher;
    readConfigFromArguments();
}

/**
 * Handles hover enter/leave symbols from the [hover] object.
 * Parameters:
 *   scriptingName (symbol): scripting name reported by [hover].
 * Returns: nothing.
 * Used by: [hover] outlets wired to inlets 0 (enter) and 1 (leave).
 */
function msg_symbol(scriptingName) {
    if (String(scriptingName) !== TARGET_VARNAME) {
        return;
    }

    if (inlet === 0) {
        if (hoverActive) {
            return;
        }

        hoverActive = true;
        hoverToken += 1;
        beginHoverSequence();
        return;
    }

    if (inlet === 1) {
        cancelHoverSequence();
    }
}
