import Cocoa
import ApplicationServices

// ============================================================================
// VibeShield Native Accessibility Chat Scraper
// Uses low-level AXUIElement API to read the IDE's chat panel content.
//
// Compile: swiftc -O ax_scraper.swift -o ax_scraper
// Run: ./ax_scraper
// Output: JSON with chat messages extracted from the right panel
// ============================================================================

// MARK: - Output Types

struct ChatMessage: Codable {
    let role: String
    let text: String
    let x: Int
}

struct ScraperResult: Codable {
    let status: String
    let app: String
    let pid: Int32
    let windowTitle: String
    let elementsScanned: Int
    let messages: [ChatMessage]
    let debug: [String]
}

// MARK: - AXUIElement Helpers

func axGet(_ el: AXUIElement, _ attr: String) -> AnyObject? {
    var v: AnyObject?
    return AXUIElementCopyAttributeValue(el, attr as CFString, &v) == .success ? v : nil
}

func axChildren(_ el: AXUIElement) -> [AXUIElement] {
    axGet(el, kAXChildrenAttribute) as? [AXUIElement] ?? []
}

func axRole(_ el: AXUIElement) -> String { axGet(el, kAXRoleAttribute) as? String ?? "" }
func axTitle(_ el: AXUIElement) -> String { axGet(el, kAXTitleAttribute) as? String ?? "" }
func axVal(_ el: AXUIElement) -> String { axGet(el, kAXValueAttribute) as? String ?? "" }
func axDesc(_ el: AXUIElement) -> String { axGet(el, kAXDescriptionAttribute) as? String ?? "" }

func axPos(_ el: AXUIElement) -> CGPoint? {
    guard let v = axGet(el, kAXPositionAttribute) else { return nil }
    var p = CGPoint.zero
    return AXValueGetValue(v as! AXValue, .cgPoint, &p) ? p : nil
}

func axSize(_ el: AXUIElement) -> CGSize? {
    guard let v = axGet(el, kAXSizeAttribute) else { return nil }
    var s = CGSize.zero
    return AXValueGetValue(v as! AXValue, .cgSize, &s) ? s : nil
}

// MARK: - Find IDE Process

func findIDE() -> (pid_t, String)? {
    for app in NSWorkspace.shared.runningApplications {
        guard let url = app.bundleURL else { continue }
        let path = url.path
        // Match known IDE bundles (not helpers/crashpad)
        if (path.contains("Antigravity.app") || path.contains("Cursor.app") ||
            path.contains("Visual Studio Code.app") || path.contains("Code.app"))
            && !path.contains("Helper") && !path.contains("crashpad") {
            return (app.processIdentifier, app.localizedName ?? "IDE")
        }
    }
    return nil
}

// MARK: - Extract Chat Text

var scanned = 0
let MAX_ELEMENTS = 8000

func extract(_ el: AXUIElement, depth: Int, chatX: CGFloat,
             msgs: inout [ChatMessage], seen: inout Set<String>) {
    if depth > 40 || scanned > MAX_ELEMENTS { return }
    scanned += 1

    let role = axRole(el)
    let pos = axPos(el)
    let size = axSize(el)

    // Skip elements on the LEFT side (editor/sidebar)
    if depth > 5, let p = pos {
        if p.x < chatX && (size?.width ?? 1512) < 1400 { return }
    }

    // Collect text from all text-like elements
    let val = axVal(el)
    if !val.isEmpty && val.count > 3 && !seen.contains(val) {
        seen.insert(val)
        msgs.append(ChatMessage(role: role, text: val, x: Int(pos?.x ?? 0)))
    }

    // Check title on non-window elements
    if role != "AXWindow" && role != "AXApplication" {
        let title = axTitle(el)
        if !title.isEmpty && title.count > 3 && title != val && !seen.contains(title) {
            seen.insert(title)
            msgs.append(ChatMessage(role: "\(role):title", text: title, x: Int(pos?.x ?? 0)))
        }
    }

    // Recurse
    for child in axChildren(el).prefix(400) {
        if scanned > MAX_ELEMENTS { break }
        extract(child, depth: depth + 1, chatX: chatX, msgs: &msgs, seen: &seen)
    }
}

// MARK: - Main

func run() {
    var debug: [String] = []

    let trusted = AXIsProcessTrusted()
    if !trusted { debug.append("NOT trusted for accessibility") }

    guard let (pid, name) = findIDE() else {
        output(ScraperResult(status: "no_ide", app: "", pid: 0, windowTitle: "",
                             elementsScanned: 0, messages: [], debug: ["No IDE found"]))
        return
    }
    debug.append("IDE: \(name) (PID \(pid))")

    let app = AXUIElementCreateApplication(pid)

    // Find the largest window
    guard let windows = axGet(app, kAXWindowsAttribute) as? [AXUIElement] else {
        debug.append("Cannot access windows")
        output(ScraperResult(status: "no_access", app: name, pid: pid, windowTitle: "",
                             elementsScanned: 0, messages: [], debug: debug))
        return
    }

    var bestWin: AXUIElement? = nil
    var bestTitle = ""
    var bestSize = CGSize.zero
    for w in windows {
        let s = axSize(w) ?? .zero
        if s.height < 100 { continue }
        if s.width * s.height > bestSize.width * bestSize.height {
            bestWin = w; bestTitle = axTitle(w); bestSize = s
        }
    }

    guard let win = bestWin else {
        debug.append("No main window found (\(windows.count) windows, all too small)")
        output(ScraperResult(status: "no_window", app: name, pid: pid, windowTitle: "",
                             elementsScanned: 0, messages: [], debug: debug))
        return
    }

    // Chat panel is on the right side (typically right 40-50%)
    let winX = axPos(win)?.x ?? 0
    let chatX = winX + bestSize.width * 0.50
    debug.append("Window: \(bestTitle) (\(Int(bestSize.width))x\(Int(bestSize.height)))")
    debug.append("Chat X boundary: \(Int(chatX))")

    var msgs: [ChatMessage] = []
    var seen = Set<String>()
    extract(win, depth: 0, chatX: chatX, msgs: &msgs, seen: &seen)

    // Filter noise (single chars, emoji-only, UI labels)
    let filtered = msgs.filter { m in
        if m.text.count < 4 { return false }
        if m.text.allSatisfy({ $0.isSymbol || $0.isWhitespace || $0.isPunctuation }) { return false }
        return true
    }

    debug.append("Scanned \(scanned), extracted \(filtered.count) messages")

    output(ScraperResult(status: "ok", app: name, pid: pid, windowTitle: bestTitle,
                         elementsScanned: scanned, messages: filtered, debug: debug))
}

func output(_ result: ScraperResult) {
    let enc = JSONEncoder()
    enc.outputFormatting = .prettyPrinted
    if let data = try? enc.encode(result), let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

run()
