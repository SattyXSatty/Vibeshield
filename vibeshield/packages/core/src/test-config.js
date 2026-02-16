"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const manager_1 = require("./config/manager");
async function test() {
    console.log("🔍 Testing ConfigManager...");
    const manager = new manager_1.ConfigManager();
    const config = await manager.initialize();
    console.log("✅ Config Loaded Successfully!");
    console.log("--------------------------------");
    console.log("Enabled:", config.enabled);
    console.log("Project Root:", config.projectRoot);
    console.log("Start Command:", config.startCommand);
    console.log("Cortex Endpoint:", config.cortex.endpoint);
    console.log("Overlay Position:", config.overlay.position);
    console.log("--------------------------------");
    if (config.startCommand === "npm run dev") {
        console.log("Note: 'npm run dev' is the default. If you had a package.json here, it might have been auto-detected.");
    }
}
test().catch(console.error);
//# sourceMappingURL=test-config.js.map