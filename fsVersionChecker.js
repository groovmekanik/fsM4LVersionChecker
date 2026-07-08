// fsVersionChecker.js — version check on hover for Max for Live
//
// Setup:
//   1. Scripting name on display object (matches arg 3)
//   2. js fsVersionChecker.js <deviceId> <localVersion> <targetScriptingName>
//   3. [hover] outlet 0 → js inlet 0, outlet 2 → js inlet 1
//
// Setup verification: bang → config/target status; check → fetch and log latest version.
// First hover: version @2s, checking @4s, result @6s. Repeat hover: result @2s.
// Hint cleared on enter and leave. Manifest cached per Live session.

autowatch = 1;
inlets = 2;
outlets = 0;

var VERSION_URL = "https://raw.githubusercontent.com/groovmekanik/fsM4LVersionChecker/main/versions.json";
var FETCH_TIMEOUT_MS = 4000;
var STAGE_VERSION_MS = 2000;
var STAGE_CHECKING_MS = 4000;
var STAGE_RESULT_MS = 6000;
var STAGE_REHOVER_MS = 2000;

var DEVICE_ID = "";
var LOCAL_VERSION = "";
var TARGET_VARNAME = "";

var devicePatcher = null;
var cachedManifest = null;
var lastResultHint = "";
var hoverActive = false;
var hoverToken = 0;
var fetchInFlight = false;
var scheduledTasks = [];

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

function ensureInitialized() {
    if (!devicePatcher) {
        devicePatcher = this.patcher;
    }

    return readConfigFromArguments();
}

function getTargetObject() {
    if (!devicePatcher) {
        return null;
    }

    return devicePatcher.getnamed(TARGET_VARNAME);
}

function setTargetHint(hintText) {
    var target = getTargetObject();

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
    }
}

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

function compareVersions(localVersion, remoteVersion) {
    var localParts = String(localVersion).split(".");
    var remoteParts = String(remoteVersion).split(".");
    var maxLength = localParts.length > remoteParts.length ? localParts.length : remoteParts.length;
    var index;

    for (index = 0; index < maxLength; index++) {
        var localPart = index < localParts.length ? parseInt(localParts[index], 10) : 0;
        var remotePart = index < remoteParts.length ? parseInt(remoteParts[index], 10) : 0;

        if (isNaN(localPart)) {
            localPart = 0;
        }

        if (isNaN(remotePart)) {
            remotePart = 0;
        }

        if (localPart < remotePart) {
            return -1;
        }

        if (localPart > remotePart) {
            return 1;
        }
    }

    return 0;
}

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

function storeResultHint(manifest) {
    lastResultHint = resolveCheckHint(manifest);
}

function fetchManifestIfNeeded(onComplete) {
    var xhr;

    if (cachedManifest) {
        if (onComplete) {
            onComplete(cachedManifest);
        }
        return;
    }

    if (fetchInFlight) {
        if (onComplete) {
            post("fsVersionChecker: fetch already in progress\n");
        }
        return;
    }

    fetchInFlight = true;

    try {
        xhr = new XMLHttpRequest();
    } catch (error) {
        fetchInFlight = false;
        if (onComplete) {
            onComplete(null);
        }
        return;
    }

    xhr.open("GET", VERSION_URL, true);
    xhr.timeout = FETCH_TIMEOUT_MS;

    xhr.onreadystatechange = function() {
        if (xhr.readyState !== 4) {
            return;
        }

        fetchInFlight = false;

        if (xhr.status !== 200) {
            if (onComplete) {
                onComplete(null);
            }
            return;
        }

        try {
            cachedManifest = JSON.parse(xhr.responseText);
            storeResultHint(cachedManifest);
            if (onComplete) {
                onComplete(cachedManifest);
            }
        } catch (parseError) {
            if (onComplete) {
                onComplete(null);
            }
        }
    };

    xhr.onerror = function() {
        fetchInFlight = false;
        if (onComplete) {
            onComplete(null);
        }
    };

    xhr.ontimeout = function() {
        fetchInFlight = false;
        if (onComplete) {
            onComplete(null);
        }
    };

    xhr.send();
}

function beginHoverSequence() {
    var token = hoverToken;

    cancelScheduledTasks();
    setTargetHint("");

    if (lastResultHint) {
        scheduleHoverStage(STAGE_REHOVER_MS, function() {
            setTargetHint(lastResultHint);
        }, token);
        return;
    }

    scheduleHoverStage(STAGE_VERSION_MS, function() {
        setTargetHint("Version " + LOCAL_VERSION);
        fetchManifestIfNeeded();
    }, token);

    scheduleHoverStage(STAGE_CHECKING_MS, function() {
        setTargetHint("Checking for updates\u2026");
    }, token);

    scheduleHoverStage(STAGE_RESULT_MS, function() {
        if (!lastResultHint) {
            if (cachedManifest) {
                storeResultHint(cachedManifest);
            } else {
                lastResultHint = "Could not check for updates";
            }
        }

        setTargetHint(lastResultHint);
    }, token);
}

function cancelHoverSequence() {
    hoverToken += 1;
    hoverActive = false;
    cancelScheduledTasks();
    setTargetHint("");
}

function loadbang() {
    ensureInitialized();
}

function reportManifestCheck(manifest) {
    var deviceEntry;
    var latestVersion;

    if (!manifest || typeof manifest !== "object") {
        post("fsVersionChecker: could not fetch version manifest\n");
        return;
    }

    deviceEntry = manifest.devices && manifest.devices[DEVICE_ID];
    if (!deviceEntry || !deviceEntry.latest) {
        post("fsVersionChecker: no version info for device ID \"" + DEVICE_ID + "\"\n");
        return;
    }

    latestVersion = String(deviceEntry.latest);
    post("fsVersionChecker: " + DEVICE_ID + " latest = " + latestVersion + " (" + resolveCheckHint(manifest) + ")\n");
}

function bang() {
    var target;

    if (!ensureInitialized()) {
        return;
    }

    target = getTargetObject();
    post("fsVersionChecker: deviceId=" + DEVICE_ID + " localVersion=" + LOCAL_VERSION + " target=" + TARGET_VARNAME + " targetFound=" + (target ? "yes" : "no") + "\n");
}

function check() {
    if (!ensureInitialized()) {
        return;
    }

    if (cachedManifest) {
        reportManifestCheck(cachedManifest);
        return;
    }

    fetchManifestIfNeeded(function(manifest) {
        reportManifestCheck(manifest);
    });
}

function anything() {
    var scriptingName = String(messagename);

    if (!ensureInitialized()) {
        return;
    }

    if (scriptingName !== TARGET_VARNAME) {
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
