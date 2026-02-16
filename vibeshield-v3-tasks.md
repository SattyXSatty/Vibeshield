# VibeShield V3 - Final Project Tasks

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEVELOPER'S IDE                              │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │                     Code Editor                               │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     AI Chat (Cursor/Copilot)                  │  │
│  │  [VibeShield sends feedback here with developer permission]   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              VibeShield OVERLAY UI (Always on top)            │  │
│  │  ┌─────────┐ ┌──────────────────────────────────────────────┐ │  │
│  │  │ Status  │ │  Live Logs / Test Progress / Results         │ │  │
│  │  │ ● Running│ │  > Starting application...                   │ │  │
│  │  │         │ │  > Capturing terminal output...               │ │  │
│  │  │ Phase:  │ │  > Sending to Cortex-R for analysis...       │ │  │
│  │  │ Terminal│ │  > ❌ Error detected: Module not found        │ │  │
│  │  │ Check   │ │  > Sending feedback to IDE chat...           │ │  │
│  │  └─────────┘ └──────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

                              ↕ IPC

┌─────────────────────────────────────────────────────────────────────┐
│                     VibeShield Core Engine                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Log Capture  │→ │ Log Selector │→ │      CORTEX-R            │  │
│  │ (stdout/err) │  │ (what to     │  │  • Error Detection       │  │
│  │              │  │  send to LLM)│  │  • Intent Extraction     │  │
│  └──────────────┘  └──────────────┘  │  • Test Planning         │  │
│                                       │  • Result Analysis       │  │
│  ┌──────────────┐  ┌──────────────┐  │  • Feedback Generation   │  │
│  │ Process Mgr  │  │ Test Runner  │  └──────────────────────────┘  │
│  │ (start/stop) │  │ (CLI/API/UI) │                                │
│  └──────────────┘  └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Principles

1. **Cortex-R does all the thinking** - No hardcoded error patterns, test logic, or reasoning
2. **Overlay UI shows everything** - Developer sees what's happening in real-time
3. **IDE chat for feedback** - Requests permission, then sends feedback via existing chat
4. **Log selection is our job** - Determine what log portions to send to Cortex-R
5. **Fully automated** - No manual testing, Cortex-R + agents handle everything

---

## Timeline

| Week | Focus | Key Deliverable |
|------|-------|-----------------|
| **Week 1** | Foundation + Overlay UI + Terminal Loop | Working overlay showing terminal analysis |
| **Week 2** | Cortex-R Integration + CLI/API Testing | Automated testing via Cortex-R |
| **Week 3** | UI Testing (Playwright + browser-use) | Full browser automation |
| **Week 4** | Polish, Reliability, Edge Cases | Production-ready agent |

---

## Team Allocation

- **Member A**: Overlay UI, IDE Chat Integration, User Experience
- **Member B**: Process Management, Log Capture, Test Execution
- **Member C**: Cortex-R Integration, Log Selection, Test Planning

---

# WEEK 1: Foundation + Overlay UI + Terminal Loop

**Goal:** Working overlay UI showing real-time terminal analysis via Cortex-R

## Epic 1.1: Project Foundation
**Owner:** All  
**Labels:** `infrastructure`, `priority-critical`, `week-1`

### Task 1.1.1: Repository & Project Setup
**Estimate:** 2 hours  
**Description:** Initialize the VibeShield monorepo.

**Subtasks:**
- [ ] Create GitHub repository `vibeshield`
- [ ] Initialize monorepo structure:
  ```
  vibeshield/
  ├── packages/
  │   ├── core/           # Main engine
  │   ├── overlay-ui/     # Electron/Web overlay
  │   ├── ide-extension/  # VS Code extension
  │   └── cortex-bridge/  # Cortex-R integration
  ├── shared/             # Shared types & utils
  └── scripts/
  ```
- [ ] Set up TypeScript with strict mode
- [ ] Configure pnpm workspaces
- [ ] Set up ESLint + Prettier
- [ ] Create build scripts for all packages
- [ ] Set up development mode with hot reload
- [ ] Create initial README

**Acceptance Criteria:**
- All packages build successfully
- Development mode works
- Monorepo structure is clean

---

### Task 1.1.2: Shared Types & Interfaces
**Estimate:** 3 hours  
**Description:** Define all shared TypeScript types.

**Subtasks:**
- [ ] Create `shared/types/` directory
- [ ] Define core types:
  ```typescript
  // Agent state
  interface AgentState {
    phase: 'idle' | 'watching' | 'running' | 'analyzing' | 'testing' | 'feedback';
    subPhase?: string;
    startTime: Date;
    attempts: number;
  }
  
  // Log entry
  interface LogEntry {
    timestamp: Date;
    source: 'stdout' | 'stderr' | 'system';
    content: string;
    level: 'info' | 'warn' | 'error' | 'debug';
  }
  
  // Cortex-R request/response
  interface CortexRequest {
    type: 'analyze_logs' | 'extract_intent' | 'plan_tests' | 'analyze_results';
    context: Record<string, any>;
    logs?: LogEntry[];
  }
  
  interface CortexResponse {
    success: boolean;
    result: any;
    confidence: number;
    reasoning?: string;
  }
  
  // Test types
  interface TestPlan {
    type: 'cli' | 'api' | 'ui';
    steps: TestStep[];
    generatedBy: 'cortex-r';
  }
  
  // UI state
  interface OverlayState {
    visible: boolean;
    position: { x: number; y: number };
    size: { width: number; height: number };
    logs: LogEntry[];
    currentPhase: AgentState;
  }
  ```
- [ ] Define IPC message types for overlay ↔ extension communication
- [ ] Define IDE chat message types
- [ ] Export all types from index.ts
- [ ] Add JSDoc documentation

**Acceptance Criteria:**
- All types are defined and documented
- Types are importable from any package
- No circular dependencies

---

### Task 1.1.3: Configuration System
**Estimate:** 2 hours  
**Description:** Build flexible configuration management.

**Subtasks:**
- [ ] Define configuration schema:
  ```typescript
  interface VibeShieldConfig {
    // General
    enabled: boolean;
    
    // IDE
    ide: 'cursor' | 'vscode';
    chatPermissionGranted: boolean;
    
    // Project
    projectRoot: string;
    startCommand: string;
    buildCommand?: string;
    
    // Cortex-R
    cortexEndpoint?: string;  // If using remote
    cortexModel?: string;
    
    // Overlay
    overlay: {
      position: 'right' | 'bottom' | 'floating';
      opacity: number;
      showLogs: boolean;
      maxLogLines: number;
    };
    
    // Timeouts
    serverStartTimeout: number;
    testTimeout: number;
  }
  ```
- [ ] Support `vibeshield.config.json`
- [ ] Support VS Code settings
- [ ] Auto-detect project settings from package.json
- [ ] Provide sensible defaults
- [ ] Validate configuration

**Acceptance Criteria:**
- Config loads correctly
- Validation catches errors
- Defaults work for common projects

---

## Epic 1.2: Overlay UI
**Owner:** Member A  
**Labels:** `overlay-ui`, `priority-critical`, `week-1`

### Task 1.2.1: Overlay Window Framework
**Estimate:** 5 hours  
**Description:** Create the always-on-top overlay window.

**Subtasks:**
- [ ] Choose framework: Electron (recommended) or Tauri
- [ ] Create overlay window with:
  - Always on top behavior
  - Transparent background capability
  - Frameless window
  - Resizable with drag handles
  - Minimize/collapse capability
- [ ] Position overlay relative to IDE window
- [ ] Handle multiple monitors
- [ ] Handle IDE window move/resize
- [ ] Implement window dragging
- [ ] Save window position preference
- [ ] Add keyboard shortcuts (toggle visibility, etc.)

**Acceptance Criteria:**
- Overlay stays on top of IDE
- Can be moved and resized
- Doesn't interfere with IDE usage

---

### Task 1.2.2: Overlay UI Components
**Estimate:** 5 hours  
**Description:** Build the overlay UI components.

**Subtasks:**
- [ ] Set up React + Tailwind in overlay package
- [ ] Create main layout:
  ```
  ┌─────────────────────────────────────────┐
  │ VibeShield 🛡️              [_][□][×]   │
  ├─────────────────────────────────────────┤
  │ Status: ● Running    Phase: Terminal   │
  ├─────────────────────────────────────────┤
  │ ┌─────────────────────────────────────┐ │
  │ │          Live Log View              │ │
  │ │  [Scrollable, auto-scroll option]   │ │
  │ │                                     │ │
  │ └─────────────────────────────────────┘ │
  ├─────────────────────────────────────────┤
  │ Current Action: Analyzing logs...      │
  │ [━━━━━━━━━━░░░░░░░░░░] 45%            │
  ├─────────────────────────────────────────┤
  │ [▶ Start] [⏹ Stop] [⚙ Settings]       │
  └─────────────────────────────────────────┘
  ```
- [ ] Create StatusBar component (phase, status indicator)
- [ ] Create LogViewer component:
  - Color-coded log levels
  - Auto-scroll with pause on hover
  - Search/filter capability
  - Timestamp display toggle
- [ ] Create ProgressIndicator component
- [ ] Create ActionButtons component
- [ ] Create SettingsPanel (slide-out or modal)
- [ ] Add dark/light theme support
- [ ] Add animations for state changes

**Acceptance Criteria:**
- UI is clean and readable
- Logs display in real-time
- Controls are intuitive

---

### Task 1.2.3: Overlay State Management
**Estimate:** 3 hours  
**Description:** Manage overlay state and sync with core engine.

**Subtasks:**
- [ ] Set up Zustand or Redux for state management
- [ ] Create stores:
  - `agentStore` - current agent state, phase
  - `logStore` - log entries, filters
  - `configStore` - user preferences
- [ ] Implement state persistence (window position, preferences)
- [ ] Create state selectors for components
- [ ] Add state debugging tools (dev mode)

**Acceptance Criteria:**
- State updates reflect in UI immediately
- State persists across restarts
- No unnecessary re-renders

---

### Task 1.2.4: Overlay ↔ Extension IPC
**Estimate:** 4 hours  
**Description:** Communication between overlay and VS Code extension.

**Subtasks:**
- [ ] Choose IPC method:
  - WebSocket (recommended for Electron)
  - Or: VS Code's built-in messaging if using webview
- [ ] Define message protocol:
  ```typescript
  type IPCMessage = 
    | { type: 'state_update'; state: AgentState }
    | { type: 'log_entry'; entry: LogEntry }
    | { type: 'command'; command: 'start' | 'stop' | 'restart' }
    | { type: 'config_update'; config: Partial<Config> };
  ```
- [ ] Implement message sender/receiver in overlay
- [ ] Implement message sender/receiver in extension
- [ ] Handle connection lifecycle
- [ ] Handle reconnection on disconnect
- [ ] Add message queuing for reliability

**Acceptance Criteria:**
- Overlay receives real-time updates
- Commands from overlay reach extension
- Handles disconnection gracefully

---

## Epic 1.3: IDE Extension & Chat Integration
**Owner:** Member A  
**Labels:** `ide-integration`, `priority-critical`, `week-1`

### Task 1.3.1: VS Code Extension Shell
**Estimate:** 3 hours  
**Description:** Create the VS Code extension.

**Subtasks:**
- [ ] Initialize extension with `yo code`
- [ ] Configure activation events
- [ ] Set up extension bundling
- [ ] Register commands:
  - `VibeShield: Start`
  - `VibeShield: Stop`
  - `VibeShield: Toggle Overlay`
  - `VibeShield: Grant Chat Permission`
  - `VibeShield: Revoke Chat Permission`
- [ ] Create status bar item
- [ ] Launch overlay on activation
- [ ] Handle extension deactivation (cleanup)

**Acceptance Criteria:**
- Extension activates correctly
- Overlay launches on start
- Commands work

---

### Task 1.3.2: Detect IDE "Done" Signal
**Estimate:** 4 hours  
**Description:** Detect when AI assistant completes implementation.

**Subtasks:**
- [ ] Hook into file save events (`onDidSaveTextDocument`)
- [ ] Implement debounce logic:
  - AI often saves multiple files rapidly
  - Wait 2-3 seconds after last save
- [ ] Track file change patterns
- [ ] Detect terminal commands finishing
- [ ] Create unified "done" event
- [ ] Allow manual trigger via command
- [ ] Send event to overlay for display

**Acceptance Criteria:**
- Correctly detects AI completion
- Minimal false positives
- Overlay shows detection

---

### Task 1.3.3: IDE Chat Access & Permission
**Estimate:** 5 hours  
**Description:** Access IDE chat for sending feedback (with permission).

**Subtasks:**
- [ ] **Permission Flow:**
  - On first run, prompt user for chat permission
  - Explain what VibeShield will do
  - Store permission in config
  - Allow revoking permission anytime
- [ ] **For Cursor:**
  - Research Cursor's chat API/extension points
  - Find method to send messages to chat
  - Handle case: no API available → clipboard fallback
- [ ] **For VS Code + Copilot:**
  - Research Copilot Chat extension
  - Try to trigger inline chat programmatically
  - Fallback: open chat panel with pre-filled text
- [ ] Create unified `sendToChat(message)` function
- [ ] Track message sent status
- [ ] Show in overlay when sending to chat

**Acceptance Criteria:**
- Permission is requested clearly
- Can send feedback to IDE chat
- User is always in control

---

### Task 1.3.4: Chat Context Extraction
**Estimate:** 4 hours  
**Description:** Get recent conversation for context.

**Subtasks:**
- [ ] **For Cursor:**
  - Locate chat storage (~/.cursor/)
  - Parse conversation history
  - Extract recent messages
- [ ] **For Copilot:**
  - Check VS Code state for chat history
  - Implement fallback if not accessible
- [ ] Create unified extraction interface
- [ ] Extract only recent relevant messages
- [ ] Extract code blocks from messages
- [ ] Get file references mentioned in chat

**Acceptance Criteria:**
- Chat context is extracted
- Works with Cursor and Copilot
- Graceful fallback if unavailable

---

### Task 1.3.5: Code Diff Capture
**Estimate:** 3 hours  
**Description:** Capture what changed during implementation.

**Subtasks:**
- [ ] Track file state before AI starts
- [ ] Compare state after AI completes
- [ ] Generate diff for changed files
- [ ] Track new/deleted files
- [ ] Create summary of changes
- [ ] Send diff info to Cortex-R for context

**Acceptance Criteria:**
- Accurate diff captured
- New files tracked
- Diff available for Cortex-R

---

## Epic 1.4: Process Management & Log Capture
**Owner:** Member B  
**Labels:** `execution`, `priority-critical`, `week-1`

### Task 1.4.1: Process Manager
**Estimate:** 4 hours  
**Description:** Start, stop, and restart the application.

**Subtasks:**
- [ ] Create ProcessManager class
- [ ] Implement `start(command)`:
  - Spawn child process
  - Capture stdout/stderr
  - Track PID
- [ ] Implement `stop()`:
  - Graceful kill (SIGTERM)
  - Force kill after timeout (SIGKILL)
  - Kill process tree
- [ ] Implement `restart()`
- [ ] Handle port conflicts
- [ ] Emit events: started, stopped, crashed
- [ ] Send status updates to overlay

**Acceptance Criteria:**
- Can start any dev server
- Clean stop without orphans
- Restart works reliably

---

### Task 1.4.2: Log Capture System
**Estimate:** 4 hours  
**Description:** Capture all terminal output.

**Subtasks:**
- [ ] Create LogCapture class
- [ ] Capture stdout in real-time
- [ ] Capture stderr in real-time
- [ ] Tag each line (stdout/stderr, timestamp)
- [ ] Stream logs to overlay in real-time
- [ ] Implement log buffer (configurable size)
- [ ] Handle ANSI codes (strip for analysis, keep for display)
- [ ] Create log export functionality

**Acceptance Criteria:**
- All output captured
- Overlay shows real-time logs
- Buffer prevents memory issues

---

### Task 1.4.3: Log Selection for Cortex-R
**Estimate:** 5 hours  
**Description:** Intelligently select which logs to send to Cortex-R.

**Subtasks:**
- [ ] **Selection strategies:**
  - Last N lines after process start
  - Lines containing "error", "Error", "ERROR"
  - Lines around timestamp of suspected error
  - Stderr lines (higher priority)
  - Stack traces (detect and include full trace)
- [ ] Create LogSelector class with configurable rules
- [ ] Implement smart truncation:
  - Don't exceed token limit for LLM
  - Preserve context around errors
  - Remove repetitive lines
- [ ] Add markers to indicate truncation
- [ ] Create summary of what was omitted
- [ ] Allow Cortex-R to request more context

**Acceptance Criteria:**
- Relevant logs are selected
- Stays within token limits
- Error context is preserved

---

## Epic 1.5: Cortex-R Integration (Phase 1)
**Owner:** Member C  
**Labels:** `cortex-r`, `priority-critical`, `week-1`

### Task 1.5.1: Cortex-R Bridge Setup
**Estimate:** 4 hours  
**Description:** Set up communication with Cortex-R.

**Subtasks:**
- [ ] Create cortex-bridge package
- [ ] Define Cortex-R interface:
  ```typescript
  interface CortexBridge {
    analyzeLog(logs: LogEntry[]): Promise<LogAnalysisResult>;
    extractIntent(chat: ChatMessage[], diff: CodeDiff): Promise<Intent>;
    planTests(intent: Intent, context: ProjectContext): Promise<TestPlan>;
    analyzeTestResults(results: TestResult[]): Promise<Analysis>;
    generateFeedback(analysis: Analysis): Promise<FeedbackMessage>;
  }
  ```
- [ ] Implement connection to Cortex-R:
  - Local instance
  - Remote API (if applicable)
- [ ] Handle authentication if needed
- [ ] Implement retry logic
- [ ] Handle Cortex-R unavailable

**Acceptance Criteria:**
- Can communicate with Cortex-R
- Handles errors gracefully
- Retry works

---

### Task 1.5.2: Log Analysis via Cortex-R
**Estimate:** 4 hours  
**Description:** Use Cortex-R to analyze logs for errors.

**Subtasks:**
- [ ] Create prompt template for log analysis:
  ```
  Analyze the following terminal output and determine:
  1. Are there any errors? (Yes/No)
  2. If yes, what type of error? (module_not_found, syntax, type, runtime, build, other)
  3. What is the error message?
  4. What file/line is affected?
  5. What is the likely cause?
  6. What is the suggested fix?
  
  Terminal output:
  {selected_logs}
  ```
- [ ] Parse Cortex-R response into structured format
- [ ] Handle ambiguous responses
- [ ] Handle "no error" response
- [ ] Display analysis in overlay
- [ ] Track analysis confidence

**Acceptance Criteria:**
- Cortex-R accurately detects errors
- Response is parsed correctly
- Overlay shows analysis results

---

### Task 1.5.3: Server Ready Detection via Cortex-R
**Estimate:** 3 hours  
**Description:** Use Cortex-R to detect when server is ready.

**Subtasks:**
- [ ] Create prompt for ready detection:
  ```
  Based on this terminal output, is the development server ready?
  Look for patterns like:
  - "ready on http://..."
  - "listening on port..."
  - "compiled successfully"
  
  Output:
  {recent_logs}
  
  Is server ready? (yes/no)
  If yes, what is the URL/port?
  ```
- [ ] Parse response
- [ ] Emit server_ready event
- [ ] Handle timeout (server never ready)
- [ ] Display status in overlay

**Acceptance Criteria:**
- Cortex-R detects server ready
- URL/port is extracted
- Timeout is handled

---

## Epic 1.6: Terminal Loop Integration
**Owner:** All  
**Labels:** `integration`, `priority-critical`, `week-1`

### Task 1.6.1: Main Agent Loop (Terminal Phase)
**Estimate:** 5 hours  
**Description:** Wire up the complete terminal health check loop.

**Subtasks:**
- [ ] Create main Agent class
- [ ] Implement terminal health loop:
  ```
  1. Wait for IDE "done" signal
  2. Start/restart application (ProcessManager)
  3. Capture logs (LogCapture)
  4. Select relevant logs (LogSelector)
  5. Send to Cortex-R for analysis
  6. If error detected:
     a. Display error in overlay
     b. Generate feedback (Cortex-R)
     c. Send feedback to IDE chat
     d. Wait for new "done" signal
     e. Go to step 2
  7. If server ready:
     a. Display success in overlay
     b. Proceed to Phase 2 (functional testing)
  ```
- [ ] Update overlay at each step
- [ ] Handle timeouts at each phase
- [ ] Track attempt count
- [ ] Implement max retries

**Acceptance Criteria:**
- Full loop works end-to-end
- Overlay shows all steps
- Errors trigger feedback to chat

---

### Task 1.6.2: Feedback Generation & Chat Delivery
**Estimate:** 4 hours  
**Description:** Generate and send feedback to IDE chat.

**Subtasks:**
- [ ] Create prompt for feedback generation:
  ```
  Based on this error analysis, generate a message for the AI coding assistant.
  The message should:
  - Clearly state what error occurred
  - Include the relevant file/line
  - Suggest a fix
  - Be concise and actionable
  
  Error analysis:
  {cortex_analysis}
  ```
- [ ] Format feedback for chat
- [ ] Check chat permission before sending
- [ ] Send via IDE chat interface
- [ ] Show "feedback sent" in overlay
- [ ] Track if feedback was acknowledged

**Acceptance Criteria:**
- Feedback is clear and actionable
- Sent to IDE chat correctly
- Overlay shows delivery status

---

### Task 1.6.3: End-to-End Testing (Week 1)
**Estimate:** 4 hours  
**Description:** Test the complete Week 1 flow.

**Subtasks:**
- [ ] Test with React project:
  - Introduce module not found error
  - Verify detection via Cortex-R
  - Verify feedback in chat
- [ ] Test with Next.js project
- [ ] Test with Node.js/Express project
- [ ] Test overlay shows all steps
- [ ] Test error recovery
- [ ] Document bugs found
- [ ] Fix critical bugs

**Acceptance Criteria:**
- Full flow works with real projects
- Overlay displays correctly
- Chat feedback works

---

# WEEK 2: CLI & API Testing via Cortex-R

**Goal:** Extend to functional testing after terminal is healthy

## Epic 2.1: Intent & Test Planning
**Owner:** Member C  
**Labels:** `cortex-r`, `priority-critical`, `week-2`

### Task 2.1.1: Intent Extraction via Cortex-R
**Estimate:** 4 hours  
**Description:** Use Cortex-R to understand what was implemented.

**Subtasks:**
- [ ] Create intent extraction prompt:
  ```
  Based on the following:
  1. Recent chat conversation: {chat_history}
  2. Code changes: {diff_summary}
  
  Determine:
  - What feature was implemented?
  - What type of testing is needed? (cli/api/ui/none)
  - What specific things should be tested?
  - What commands or endpoints are involved?
  ```
- [ ] Send chat context + diff to Cortex-R
- [ ] Parse intent response
- [ ] Display intent in overlay
- [ ] Handle unclear/ambiguous intent

**Acceptance Criteria:**
- Cortex-R extracts intent correctly
- Test type is determined
- Overlay shows extracted intent

---

### Task 2.1.2: Test Plan Generation via Cortex-R
**Estimate:** 4 hours  
**Description:** Have Cortex-R generate the test plan.

**Subtasks:**
- [ ] Create test planning prompt:
  ```
  Based on this intent:
  {extracted_intent}
  
  And this project context:
  - Framework: {framework}
  - Available commands: {npm_scripts}
  - Recent changes: {diff}
  
  Generate a test plan with specific steps:
  - For CLI: commands to run, expected output
  - For API: endpoints to call, methods, expected responses
  - For UI: pages to visit, actions to perform, expected results
  ```
- [ ] Parse test plan response into TestPlan structure
- [ ] Validate test plan is executable
- [ ] Display plan in overlay
- [ ] Allow user to approve/modify (optional)

**Acceptance Criteria:**
- Cortex-R generates valid test plans
- Plans are executable
- Overlay shows the plan

---

## Epic 2.2: CLI Test Execution
**Owner:** Member B  
**Labels:** `cli`, `execution`, `priority-critical`, `week-2`

### Task 2.2.1: CLI Command Executor
**Estimate:** 3 hours  
**Description:** Execute CLI commands from test plan.

**Subtasks:**
- [ ] Create CLIExecutor class
- [ ] Execute commands in project directory
- [ ] Capture stdout/stderr
- [ ] Handle exit codes
- [ ] Support timeout
- [ ] Support environment variables
- [ ] Stream output to overlay
- [ ] Support command chaining

**Acceptance Criteria:**
- Commands execute correctly
- Output is captured
- Overlay shows execution

---

### Task 2.2.2: CLI Result Analysis via Cortex-R
**Estimate:** 3 hours  
**Description:** Have Cortex-R analyze CLI output.

**Subtasks:**
- [ ] Create CLI analysis prompt:
  ```
  The following command was executed:
  Command: {command}
  Expected: {expected_from_plan}
  
  Actual output:
  {stdout}
  
  Exit code: {exit_code}
  
  Did the test pass? Why or why not?
  ```
- [ ] Parse analysis response
- [ ] Determine pass/fail
- [ ] Display result in overlay

**Acceptance Criteria:**
- Cortex-R correctly determines pass/fail
- Analysis explains why
- Results shown in overlay

---

## Epic 2.3: API Test Execution
**Owner:** Member B  
**Labels:** `api`, `execution`, `priority-critical`, `week-2`

### Task 2.3.1: HTTP Request Executor
**Estimate:** 4 hours  
**Description:** Execute HTTP requests from test plan.

**Subtasks:**
- [ ] Create HTTPExecutor class
- [ ] Support all HTTP methods
- [ ] Support headers, body, query params
- [ ] Support authentication
- [ ] Capture full response (status, headers, body)
- [ ] Measure response time
- [ ] Handle timeouts
- [ ] Stream progress to overlay

**Acceptance Criteria:**
- Can make any HTTP request
- Full response captured
- Overlay shows progress

---

### Task 2.3.2: API Result Analysis via Cortex-R
**Estimate:** 3 hours  
**Description:** Have Cortex-R analyze API responses.

**Subtasks:**
- [ ] Create API analysis prompt:
  ```
  API request:
  {method} {url}
  Headers: {headers}
  Body: {body}
  
  Expected (from test plan):
  {expected}
  
  Actual response:
  Status: {status}
  Body: {response_body}
  Time: {response_time}ms
  
  Did the test pass? Explain.
  ```
- [ ] Parse analysis response
- [ ] Determine pass/fail
- [ ] Display in overlay

**Acceptance Criteria:**
- Cortex-R correctly analyzes responses
- Clear pass/fail with reasoning
- Results in overlay

---

## Epic 2.4: Test Results & Feedback
**Owner:** Member A  
**Labels:** `feedback`, `priority-critical`, `week-2`

### Task 2.4.1: Test Results Aggregation
**Estimate:** 3 hours  
**Description:** Aggregate and display test results.

**Subtasks:**
- [ ] Create TestResultAggregator
- [ ] Combine results from CLI and API tests
- [ ] Calculate summary (passed, failed, total)
- [ ] Track timing
- [ ] Generate overall verdict
- [ ] Display comprehensive results in overlay

**Acceptance Criteria:**
- Results are aggregated
- Summary is clear
- Overlay shows all results

---

### Task 2.4.2: Test Failure Feedback via Cortex-R
**Estimate:** 4 hours  
**Description:** Generate and send feedback for test failures.

**Subtasks:**
- [ ] Create failure feedback prompt:
  ```
  The following tests failed:
  {failed_tests_with_analysis}
  
  Generate feedback for the AI assistant to fix these issues.
  Include:
  - What failed
  - Why it failed
  - Suggested fix
  ```
- [ ] Format feedback for IDE chat
- [ ] Send to chat (with permission)
- [ ] Display in overlay
- [ ] Track feedback delivery

**Acceptance Criteria:**
- Feedback clearly explains failures
- Sent to IDE chat
- Overlay shows status

---

### Task 2.4.3: Overlay Test Results View
**Estimate:** 3 hours  
**Description:** Enhanced overlay UI for test results.

**Subtasks:**
- [ ] Create TestResultsPanel component:
  - List of tests with pass/fail status
  - Expandable details for each test
  - Timing information
  - Error details for failures
- [ ] Add test history view
- [ ] Add re-run button for individual tests
- [ ] Add export results option

**Acceptance Criteria:**
- Results view is clear and detailed
- Can see individual test details
- Re-run works

---

# WEEK 3: UI Testing (Playwright + browser-use)

**Goal:** Full browser automation with visual testing

## Epic 3.1: Browser Automation
**Owner:** Member C  
**Labels:** `ui-testing`, `priority-critical`, `week-3`

### Task 3.1.1: Playwright Setup
**Estimate:** 3 hours  
**Description:** Set up Playwright for browser control.

**Subtasks:**
- [ ] Add Playwright dependency
- [ ] Create BrowserManager class
- [ ] Configure browser options (headless, viewport, etc.)
- [ ] Implement launch/close/newPage
- [ ] Handle browser crashes
- [ ] Browser reuse for performance

**Acceptance Criteria:**
- Playwright works
- Browser launches and navigates
- Clean shutdown

---

### Task 3.1.2: browser-use Integration
**Estimate:** 5 hours  
**Description:** Integrate browser-use for AI-driven interaction.

**Subtasks:**
- [ ] Add browser-use dependency
- [ ] Create BrowserAgent class
- [ ] Configure with LLM (can use Cortex-R as backend)
- [ ] Implement natural language actions:
  ```typescript
  await agent.execute("Click the login button");
  await agent.execute("Fill in the username field with 'test@example.com'");
  ```
- [ ] Capture screenshots after each action
- [ ] Log all actions taken
- [ ] Stream progress to overlay
- [ ] Handle browser-use errors

**Acceptance Criteria:**
- browser-use executes commands
- Actions are logged
- Screenshots captured

---

### Task 3.1.3: UI Test Execution via Cortex-R
**Estimate:** 5 hours  
**Description:** Execute UI tests with Cortex-R driving browser-use.

**Subtasks:**
- [ ] Create UI test execution flow:
  ```
  1. Cortex-R generates UI test steps (natural language)
  2. Each step sent to browser-use
  3. Screenshot captured after each step
  4. Result sent to Cortex-R for verification
  5. Continue or report failure
  ```
- [ ] Handle step failures with retry
- [ ] Capture video (optional)
- [ ] Stream all activity to overlay

**Acceptance Criteria:**
- UI tests execute end-to-end
- Cortex-R verifies each step
- Overlay shows progress

---

### Task 3.1.4: Visual Capture & Evidence
**Estimate:** 4 hours  
**Description:** Capture visual evidence during UI tests.

**Subtasks:**
- [ ] Implement screenshot capture (full page, element)
- [ ] Implement video recording
- [ ] Capture console logs from browser
- [ ] Capture network requests
- [ ] Store evidence with timestamps
- [ ] Display screenshots in overlay
- [ ] Clean up old evidence

**Acceptance Criteria:**
- Evidence is captured
- Viewable in overlay
- Storage is managed

---

## Epic 3.2: UI Analysis & Feedback
**Owner:** Member A  
**Labels:** `ui-testing`, `feedback`, `week-3`

### Task 3.2.1: UI State Analysis via Cortex-R
**Estimate:** 4 hours  
**Description:** Have Cortex-R analyze UI screenshots.

**Subtasks:**
- [ ] Create UI analysis prompt (with image):
  ```
  Here is a screenshot of the UI after the action: "{action}"
  Expected result: {expected}
  
  Analyze the screenshot:
  1. Does the UI show the expected state?
  2. Are there any visible errors?
  3. Is the layout correct?
  4. Any issues visible?
  ```
- [ ] Send screenshot to Cortex-R (if supports vision)
- [ ] Alternative: send DOM snapshot for analysis
- [ ] Parse analysis response
- [ ] Determine pass/fail

**Acceptance Criteria:**
- Cortex-R can analyze UI state
- Detects errors and issues
- Pass/fail determined

---

### Task 3.2.2: UI Test Results & Feedback
**Estimate:** 4 hours  
**Description:** Display UI test results and send feedback.

**Subtasks:**
- [ ] Create UI test results panel in overlay:
  - Step-by-step results with screenshots
  - Pass/fail for each step
  - Error details
- [ ] Generate feedback for UI failures via Cortex-R
- [ ] Include screenshot in feedback (if chat supports)
- [ ] Send to IDE chat
- [ ] Display delivery status

**Acceptance Criteria:**
- Results with screenshots in overlay
- Feedback sent to chat
- Visual evidence included

---

### Task 3.2.3: Visual Regression (Optional)
**Estimate:** 4 hours  
**Description:** Detect unintended visual changes.

**Subtasks:**
- [ ] Implement baseline screenshot storage
- [ ] Create visual diff comparison
- [ ] Send diff to Cortex-R for analysis
- [ ] Determine if change is intentional
- [ ] Display diff in overlay
- [ ] Allow baseline update

**Acceptance Criteria:**
- Visual changes detected
- Cortex-R determines significance
- Baseline can be updated

---

# WEEK 4: Polish, Reliability & Production Ready

**Goal:** Make VibeShield production-ready

## Epic 4.1: Reliability
**Owner:** Member B  
**Labels:** `reliability`, `priority-high`, `week-4`

### Task 4.1.1: Error Recovery System
**Estimate:** 4 hours  
**Description:** Handle errors gracefully throughout the system.

**Subtasks:**
- [ ] Global error handler
- [ ] Recover from browser crashes
- [ ] Recover from process crashes
- [ ] Handle Cortex-R unavailable
- [ ] Handle network failures
- [ ] Retry with exponential backoff
- [ ] User notification for unrecoverable errors
- [ ] Error logging for debugging

**Acceptance Criteria:**
- Agent doesn't crash
- Recovers when possible
- User is informed

---

### Task 4.1.2: Resource Management
**Estimate:** 3 hours  
**Description:** Clean resource management.

**Subtasks:**
- [ ] Track all processes, browsers, handles
- [ ] Cleanup on extension deactivation
- [ ] Cleanup on crash
- [ ] Handle orphaned resources
- [ ] Memory leak prevention
- [ ] Resource usage monitoring

**Acceptance Criteria:**
- No resource leaks
- Clean shutdown
- Memory stays stable

---

### Task 4.1.3: Performance Optimization
**Estimate:** 4 hours  
**Description:** Optimize speed and efficiency.

**Subtasks:**
- [ ] Profile extension activation
- [ ] Lazy load components
- [ ] Cache Cortex-R responses where appropriate
- [ ] Reuse browser instances
- [ ] Optimize log streaming
- [ ] Minimize overlay render cycles

**Acceptance Criteria:**
- Fast activation
- Low resource usage
- Smooth overlay

---

## Epic 4.2: Enhanced Overlay UX
**Owner:** Member A  
**Labels:** `overlay-ui`, `ux`, `week-4`

### Task 4.2.1: Polish Overlay UI
**Estimate:** 4 hours  
**Description:** Polish the overlay for great UX.

**Subtasks:**
- [ ] Smooth animations
- [ ] Loading states for all operations
- [ ] Error states with helpful messages
- [ ] Success celebrations (subtle)
- [ ] Keyboard shortcuts
- [ ] Accessibility (a11y) improvements
- [ ] Mobile/small viewport handling

**Acceptance Criteria:**
- Overlay feels polished
- Animations are smooth
- Accessible

---

### Task 4.2.2: Test History & Analytics
**Estimate:** 3 hours  
**Description:** Show test history and patterns.

**Subtasks:**
- [ ] Store test run history
- [ ] Create history view in overlay:
  - Past runs with results
  - Timing trends
  - Common failures
- [ ] Export history
- [ ] Clear history option

**Acceptance Criteria:**
- History is stored
- Viewable in overlay
- Insights available

---

### Task 4.2.3: Settings & Configuration UI
**Estimate:** 3 hours  
**Description:** User-friendly settings in overlay.

**Subtasks:**
- [ ] Settings panel in overlay
- [ ] All config options accessible
- [ ] Live preview of changes
- [ ] Reset to defaults
- [ ] Import/export settings
- [ ] Permission management

**Acceptance Criteria:**
- Settings are accessible
- Changes apply immediately
- Easy to use

---

## Epic 4.3: Documentation & Onboarding
**Owner:** All  
**Labels:** `documentation`, `week-4`

### Task 4.3.1: User Documentation
**Estimate:** 4 hours  
**Description:** Create comprehensive user docs.

**Subtasks:**
- [ ] README with:
  - What is VibeShield
  - Installation
  - Quick start
  - Configuration
- [ ] Troubleshooting guide
- [ ] FAQ
- [ ] Supported project types
- [ ] Cortex-R requirements

**Acceptance Criteria:**
- Users can get started
- Issues are documented
- Clear instructions

---

### Task 4.3.2: First-Run Onboarding
**Estimate:** 3 hours  
**Description:** Onboarding experience for new users.

**Subtasks:**
- [ ] First-run detection
- [ ] Welcome screen in overlay
- [ ] Permission request flow
- [ ] Configuration wizard
- [ ] Quick tutorial
- [ ] Skip option

**Acceptance Criteria:**
- New users are guided
- Permissions are clear
- Can be skipped

---

## Epic 4.4: Quality Assurance
**Owner:** All  
**Labels:** `testing`, `quality`, `week-4`

### Task 4.4.1: Unit & Integration Tests
**Estimate:** 5 hours  
**Description:** Test the agent itself.

**Subtasks:**
- [ ] Unit tests for:
  - LogSelector
  - ProcessManager
  - HTTP Executor
  - Test result aggregation
- [ ] Integration tests for:
  - Full terminal loop
  - CLI test execution
  - API test execution
- [ ] Mock Cortex-R for tests
- [ ] Achieve 70%+ coverage

**Acceptance Criteria:**
- Core logic tested
- Coverage > 70%
- Tests pass

---

### Task 4.4.2: Real Project Testing
**Estimate:** 4 hours  
**Description:** Test with real projects.

**Subtasks:**
- [ ] Test with React project
- [ ] Test with Next.js project
- [ ] Test with Express API
- [ ] Test with Vue project
- [ ] Test with full-stack project
- [ ] Test overlay with different themes
- [ ] Document issues
- [ ] Fix critical bugs

**Acceptance Criteria:**
- Works with common projects
- Overlay works everywhere
- Bugs fixed

---

### Task 4.4.3: Performance & Load Testing
**Estimate:** 3 hours  
**Description:** Ensure performance under load.

**Subtasks:**
- [ ] Test with large log output
- [ ] Test with many rapid changes
- [ ] Test long-running sessions
- [ ] Measure memory over time
- [ ] Measure CPU usage
- [ ] Fix performance issues

**Acceptance Criteria:**
- Handles large logs
- Stable over time
- Resource efficient

---

# Summary

## Task Count by Week

| Week | Focus | Tasks | Est. Hours |
|------|-------|-------|------------|
| 1 | Foundation + Overlay + Terminal Loop | 18 | ~68h |
| 2 | CLI & API Testing | 8 | ~27h |
| 3 | UI Testing (Playwright + browser-use) | 7 | ~29h |
| 4 | Polish, Reliability, Docs | 12 | ~40h |
| **Total** | | **45** | **~164h** |

## Key Architecture Points

1. **Overlay UI** - Always on top, shows everything happening
2. **Cortex-R** - Does ALL analysis, planning, and reasoning
3. **Log Selection** - Our job: pick what logs to send to Cortex-R
4. **IDE Chat** - Feedback goes through existing chat (with permission)
5. **No Manual Testing** - Everything automated via Cortex-R + browser-use

## Deliverables

| End of Week | Deliverable |
|-------------|-------------|
| Week 1 | Working overlay showing terminal error detection via Cortex-R |
| Week 2 | CLI and API testing automated via Cortex-R |
| Week 3 | Full UI testing with Playwright + browser-use |
| Week 4 | Production-ready, polished, documented |
