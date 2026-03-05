# 🌐 Set the Default Test URL

VibeShield’s Browser Agent uses Playwright to autonomously navigate your UI. By default, it tries to detect open ports and running servers.

If you have a complex setup, or just want to guarantee where VibeShield starts its tests, configure your **Default Test Target URL**.

### How to set it up:
1. Open your VS Code Settings (`Cmd+,` or `Ctrl+,`).
2. Search for `vibeshield.defaultTestUrl`.
3. Enter the local URL where your app is running (e.g., `http://localhost:3000` or `http://127.0.0.1:5173`).

> **💡 Note:** You can also configure this directly inside the VibeShield Overlay UI by clicking the gear ⚙️ icon in the top right. This value is used as a fallback if the AI Test Plan doesn't explicitly specify a different starting page.
