# VibeShield Test Scenarios

This directory contains scripts to manually verify the VibeShield agent loop.

## Prerequisites
1. Open the project in VS Code.
2. Build the extension: `cd packages/ide-extension && npm run compile`
3. Launch the extension (F5 or Run > Start Debugging).
4. **IMPORTANT:** In the *new* VS Code window (Extension Development Host), go to **Settings > VibeShield > Api Key** and paste your Gemini API Key. (Settings are not shared from your main window).

## Scenario 1: Process Crash & AI Analysis
**Goal:** Verify that a crashing process triggers `AgentLoop`, selects logs, calls Cortex-R, and displays feedback.

**Steps:**
1. Open the Command Palette (`Cmd+Shift+P`) in the **Extension Host window**.
2. Run `VibeShield: Start Process`.
3. When prompted for command, enter:
   ```bash
   node ${workspaceFolder}/vibeshield/packages/ide-extension/test-scenarios/broken-server.js
   ```
   *(Note: Use full path or relative path from workspace root. `npm` might not be in the PATH of the debug window, so use `node`.)*
4. **Observe:**
   - Process starts.
   - Process crashes (exit code 1).
   - "Analyzing logs..." notification appears.
   - After ~2-5s, detailed error feedback appears in an overlay card or notification.
   - Chat panel should show the error message.

## Scenario 2: Server Readiness Detection
**Goal:** Verify that a healthy server triggers the "Server Ready" detection and transitions to `healthy` phase.

**Steps:**
1. Open the Command Palette.
2. Run `VibeShield: Start Process`.
3. Enter command:
   ```bash
   node ${workspaceFolder}/packages/ide-extension/test-scenarios/healthy-server.js
   ```
4. **Observe:**
   - "Building project..." log appear.
   - "Ready on http://localhost:3000" log appears.
   - After ~1-3s, a notification "VibeShield: Server is ready at http://localhost:3000" should appear with an "Open" button.
   - Agent phase (if visible in logs) transitions to `healthy`.

## Scenario 3: Manual Analysis
**Goal:** Verify manual trigger works.

**Steps:**
1. Run Scenario 1 or 2.
2. Run command `VibeShield: Analyze Logs with Cortex-R`.
3. Verify a JSON document opens with the analysis result.
