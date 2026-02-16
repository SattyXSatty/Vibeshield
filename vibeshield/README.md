# VibeShield

VibeShield is a production-grade AI agent that integrates directly into your editor workflow. It consists of a VS Code extension for tracking and analysis, and a floating Overlay UI for real-time feedback and interaction.

## 📂 Project Structure

This project is a monorepo managed with `pnpm`.

- **`packages/ide-extension`**: The VS Code Extension. Handles file tracking, terminal monitoring, log capture, and communication with the overlay.
- **`packages/overlay-ui`**: A standalone Electron + React application that provides a "Heads Up Display" for the AI agent.
- **`packages/shared`**: Shared TypeScript types, utilities, and interfaces used by both the extension and the UI.
- **`packages/core`** (Internal): Core logic and configuration management.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-org/vibeshield-monorepo.git
    cd vibeshield-monorepo
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Build shared packages:**
    It is recommended to build the shared packages first to ensure types are generated.
    ```bash
    pnpm --filter @vibeshield/shared run build
    # Or simply build everything:
    pnpm run build
    ```

## 🛠️ Development Workflow

To develop VibeShield effectively, you typically need to run two processes: the Overlay UI (to see whats happening) and the VS Code Extension (to trigger events).

### 1. Start the Overlay UI
This runs the Electron application with Vite hot-module replacement.

```bash
cd packages/overlay-ui
pnpm run dev
```
*   **Output:** You should see `IPC Server started on port 54321`. This means the UI is ready to receive data from VS Code.

### 2. Run the VS Code Extension
You can run the extension in debug mode to see logs and hit breakpoints.

1.  Open the project in VS Code:
    ```bash
    code .
    ```
2.  Go to the **Run and Debug** view (Ctrl+Shift+D).
3.  Select **"Run Extension"** (or similar) from the dropdown.
4.  Press **F5**.

A new **Extension Development Host** window will open. In this window, VibeShield is active.
*   **Verify Connection:** Check the Debug Console in the primary VS Code window. You should see `[VibeShield] Connected to Overlay`.

### Manual Compilation (Optional)
If you need to verify the extension build without launching the debugger:

```bash
cd packages/ide-extension
npm run compile
```

## ⚙️ Configuration

VibeShield has customizable settings in VS Code (`Cmd+,`):

*   **`vibeshield.apiKey`**: Your Google Gemini API Key for Cortex-R log analysis.
*   **`vibeshield.enableAccessibilityScraper`**: (Experimental) Enables advanced context gathering via macOS accessibility APIs.

## 🤝 Contributing

1.  **Branching:** Create a feature branch for your changes.
2.  **Linting:** Run `pnpm run lint` to ensure code quality.
3.  **Formatting:** Run `pnpm run format` to auto-format code with Prettier.

### Important Dependencies
*   **Electron**: Used for the Overlay UI.
*   **esbuild**: Used to bundle the VS Code extension.
*   **React + Vite**: Used for the Overlay frontend.
*   **ws**: WebSocket library for IPC between Extension and Overlay.

## 📜 License

[Add License Here]
