# 🛡️ VibeShield
**The AI-Native E2E Test & Debug Agent for VS Code**

VibeShield is an autonomous, context-aware AI agent that lives directly inside your IDE. Unlike traditional testing frameworks where you write brittle scripts, VibeShield *watches* you code, understands your intent, and autonomously executes UI/API tests to ensure you haven't broken anything.

## ✨ Key Features
- **🧠 IDE Native Intelligence:** Monitors your terminal, active file edits, and git diffs to automatically build deep context about your work.
- **👁️ Autonomous UI Testing (Playwright):** Translates high-level goals ("Test the login page") into atomic browser clicks, form fills, and navigation events using a vision-capable LLM.
- **🖼️ Visual Regression Tracking:** Automatically captures UI state baselines and detects visual changes pixel-by-pixel across test runs. 
- **🖥️ Floating Overlay UI:** A heads-up Electron dashboard that overlays your code, showing live execution logs, AI reasoning, and test results without cluttering your workspace.
- **🔄 Self-Healing Test Execution:** When the UI changes, VibeShield doesn't crash. It looks at the new DOM, figures out where the element moved to, and keeps going.
- **💾 Smart Memory:** Remembers important project architecture and context across sessions.

## 📂 Architecture Overview
VibeShield is built as a monorepo utilizing `pnpm`:
- **`@vibeshield/ide-extension`**: The VS Code Extension. The nervous system that tracks IDE activity, spawns the local dev server, and handles context extraction.
- **`@vibeshield/overlay-ui`**: The Electron + React application. The Heads Up Display showing live test results, agent logic, and visual diffs.
- **`@vibeshield/browser-agent`**: The Playwright automation core. Uses Google Gemini 2.5 Pro Vision to dynamically interact with web pages.
- **`@vibeshield/shared`**: Shared TypeScript types and IPC structures.

## 🚀 Getting Started

### Prerequisites
- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0
- **Google Gemini API Key** (Required for the `Cortex-R` reasoning engine)

### Installation
1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/your-org/vibeshield-monorepo.git
   cd vibeshield-monorepo
   pnpm install
   ```
2. Build the shared packages:
   ```bash
   pnpm run build
   ```

### Running Locally
You need to run the Overlay UI and the VS Code Extension simultaneously.

1. **Start the Overlay UI**
   ```bash
   cd packages/overlay-ui
   pnpm run dev
   ```
2. **Start the VS Code Extension**
   Open the repository in VS Code, go to the Run and Debug panel (`Cmd+Shift+D`), and launch the **"Extension"** configuration.

3. **Configure Settings**
   Once the Extension Development Host window opens, click the ⚙️ gear icon in the VibeShield Overlay (or go to VS Code Settings) and enter your `Gemini API Key` and the `Default Test URL` of the application you are building.

## 🛠️ Usage Workflow
VibeShield acts as a pair programmer:
1. **Build your app:** Make code changes, run your Next.js/Vite server, and chat with the AI in the VibeShield sidebar about what you're trying to build.
2. **Extract Intent:** Click `Extract Intent` in the Overlay. VibeShield reads your chat history and git diffs to figure out what you just did.
3. **Generate Plan:** Click `Gen TestPlan`. VibeShield creates a robust testing strategy (API or UI) to validate your work.
4. **Execute:** Click `Run Tests`. Watch the browser agent boot up, navigate your app, and visually verify the success of your implementation.

## 🤝 Contributing
- Follow the overarching architecture laid out in [`ARCHITECTURE.md`](ARCHITECTURE.md).
- Create a feature branch and submit a PR. 
- Run tests (once added) via `pnpm test`.

## 📜 License
MIT
