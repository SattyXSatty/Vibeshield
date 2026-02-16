#!/usr/bin/env osascript -l JavaScript

/**
 * Robust Scraper for Antigravity/Electron Apps
 */
function run(argv) {
    var se = Application("System Events");
    var targetApp = null;
    var targetName = "";
    var debugLog = [];

    // Candidates to look for
    var precursors = ["Antigravity", "Electron", "Cursor", "Code", "Comet"];
    var candidates = [];

    var procs = se.processes;
    var procCount = procs.length;

    for (var i = 0; i < procCount; i++) {
        try {
            var p = procs[i];
            var pName = p.name();

            // Check if name matches any precursor
            var matches = false;
            for (var j = 0; j < precursors.length; j++) {
                if (pName.indexOf(precursors[j]) > -1) {
                    matches = true;
                    break;
                }
            }
            if (!matches) continue;

            // Check for windows
            // Some apps hide windows in Helper processes
            var wins = p.windows;
            if (wins.length > 0) {
                candidates.push({
                    p: p,
                    name: pName,
                    count: wins.length,
                    front: p.frontmost()
                });
            }
        } catch (e) {
            debugLog.push("Err(" + i + "): " + e.message);
        }
    }

    if (candidates.length === 0) {
        return JSON.stringify({
            error: "No matching processes with windows found",
            searched: precursors,
            debug: debugLog.slice(0, 5) // Limit debug output
        });
    }

    // Sort: Frontmost first, then most windows
    candidates.sort(function (a, b) {
        if (a.front && !b.front) return -1;
        if (!a.front && b.front) return 1;
        return b.count - a.count;
    });

    targetApp = candidates[0].p;
    targetName = candidates[0].name;

    // Scrape Logic
    var results = [];
    var seen = {};

    var scan = function (el, depth) {
        if (depth > 25) return; // Prevent infinite recursion in deep DOMs
        try {
            var role = el.role();
            var val = el.value();
            var desc = el.description();

            // Heuristic for chat messages: Long text in static text or text area
            // Also buttons/links sometimes contain text
            var text = "";
            if (typeof val === 'string') text = val;
            else if (typeof desc === 'string') text = desc;

            if (text && typeof text === 'string' && text.trim().length > 3) { // Min length filter 
                if (!seen[text]) {
                    results.push({ role: role, text: text });
                    seen[text] = true;
                }
            }

            // Recurse
            var children = el.uiElements;
            // Only recurse if container-like role to save time?
            // "AXGroup", "AXScrollArea", "AXWebArea", "AXWindow", "AXSplitGroup"
            // But sometimes generic groups.
            // Just scan all for now, depth limiting saves us.
            var childCount = children.length;
            // Limit children width processing to avoid massive trees?
            if (childCount > 500) childCount = 500;

            for (var k = 0; k < childCount; k++) {
                scan(children[k], depth + 1);
            }
        } catch (e) {
            // Ignore element access errors
        }
    };

    try {
        var win = targetApp.windows[0];
        scan(win, 0);
    } catch (e) {
        return JSON.stringify({
            error: "Window scan failed",
            app: targetName,
            details: e.message
        });
    }

    return JSON.stringify({
        app: targetName,
        status: "Success",
        messages: results
    });
}
