#!/usr/bin/env osascript -l JavaScript

/**
 * VibeShield Chat Scraper — JXA (JavaScript for Automation)
 * 
 * Extracts visible chat text from the IDE's right panel (Agent Chat)
 * using macOS Accessibility API.
 * 
 * Designed to run via: osascript -l JavaScript scraper.js
 * Returns JSON: { app, status, messages: [{role, text}], debug }
 * 
 * Also saves results to ~/.vibeshield/chat_history.json for Cortex-R.
 */
function run() {
    var se = Application("System Events");
    var debugLog = [];
    var targetProc = null;
    var targetName = "";
    var mainWin = null;
    var maxArea = 0;

    // Step 1: Find ALL foreground processes, pick the IDE (largest window)
    var candidates = ["Electron", "Cursor", "Code", "Antigravity", "Comet"];
    var allProcs = se.processes;
    var procCount = allProcs.length;

    for (var i = 0; i < procCount; i++) {
        try {
            var p = allProcs[i];
            var pName = p.name();

            // Check if process name matches any candidate
            var isCandidate = false;
            for (var c = 0; c < candidates.length; c++) {
                if (pName.indexOf(candidates[c]) > -1) {
                    isCandidate = true;
                    break;
                }
            }
            if (!isCandidate) continue;

            // Check all windows of this process
            var wins;
            try { wins = p.windows(); } catch (e) { continue; }

            for (var w = 0; w < wins.length; w++) {
                try {
                    var win = wins[w];
                    var sz = win.size();
                    var area = sz[0] * sz[1];

                    // Skip tiny windows (menu bars, popups)
                    if (sz[1] < 100) continue;

                    if (area > maxArea) {
                        maxArea = area;
                        mainWin = win;
                        targetProc = p;
                        targetName = pName;
                    }
                } catch (e) { /* skip inaccessible windows */ }
            }
        } catch (e) {
            debugLog.push("ProcErr(" + i + "): " + e.message);
        }
    }

    if (!mainWin) {
        return JSON.stringify({
            error: "No IDE window found",
            debug: debugLog.slice(0, 10),
            searched: candidates
        });
    }

    // Step 2: Get window geometry, calculate chat panel boundary
    var winPos, winSize;
    try {
        winPos = mainWin.position();
        winSize = mainWin.size();
    } catch (e) {
        return JSON.stringify({ error: "Cannot read window geometry", details: e.message });
    }

    // Chat panel is on the RIGHT side (typically right 40-45%)
    var chatLeftX = winPos[0] + winSize[0] * 0.50;
    debugLog.push("Window: " + winSize[0] + "x" + winSize[1] + " at (" + winPos[0] + "," + winPos[1] + ")");
    debugLog.push("Chat boundary: x > " + Math.round(chatLeftX));

    // Step 3: Recursive extraction — ONLY from the right panel
    var results = [];
    var seen = {};
    var scanned = 0;
    var MAX_SCAN = 6000;

    var scan = function (el, depth) {
        if (depth > 30 || scanned > MAX_SCAN) return;
        scanned++;

        try {
            var role = el.role();

            // Check position — skip elements on the left (editor area)
            if (depth > 2) {
                try {
                    var pos = el.position();
                    if (pos[0] < chatLeftX) return; // LEFT of chat boundary → skip
                } catch (e) { /* no position info, continue scanning */ }
            }

            // Extract text from text elements
            if (role === "AXStaticText" || role === "AXTextField" || role === "AXTextArea") {
                try {
                    var val = el.value();
                    if (val && typeof val === 'string') {
                        var text = val.trim();
                        // Skip very short text (UI labels: ×, ▶, etc.)
                        if (text.length > 4 && !seen[text]) {
                            seen[text] = true;
                            results.push({ role: role, text: text });
                        }
                    }
                } catch (e) { /* no value */ }
            }

            // Also capture descriptions on groups (section headers, etc.)
            if (role === "AXGroup" || role === "AXWebArea" || role === "AXSection") {
                try {
                    var desc = el.description();
                    if (desc && typeof desc === 'string' && desc.length > 8 && !seen[desc]) {
                        seen[desc] = true;
                        results.push({ role: "section", text: "[" + desc + "]" });
                    }
                } catch (e) { }
            }
        } catch (e) { return; }

        // Recurse into children
        try {
            var children = el.uiElements();
            var childCount = Math.min(children.length, 300); // Cap to prevent explosion
            for (var k = 0; k < childCount; k++) {
                if (scanned > MAX_SCAN) break;
                try { scan(children[k], depth + 1); } catch (e) { }
            }
        } catch (e) { /* no children */ }
    };

    // Start from the main window
    scan(mainWin, 0);

    debugLog.push("Scanned " + scanned + " elements, found " + results.length + " text blocks");

    // Step 4: Filter results (keep only meaningful chat content)
    var chatMessages = [];
    for (var r = 0; r < results.length; r++) {
        var msg = results[r];
        // Skip UI noise
        if (msg.text.match(/^[×▶▼▲►◄⌘⇧⌥\s]+$/)) continue;
        if (msg.text.length < 5) continue;
        chatMessages.push({ role: msg.role, value: msg.text });
    }

    return JSON.stringify({
        app: targetName,
        status: "ok",
        windowTitle: (function () { try { return mainWin.name(); } catch (e) { return ""; } })(),
        windowSize: winSize[0] + "x" + winSize[1],
        elementsScanned: scanned,
        messages: chatMessages,
        debug: debugLog
    });
}
