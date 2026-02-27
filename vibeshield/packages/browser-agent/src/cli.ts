import { BrowserAgent } from './BrowserAgent';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env explicitly if provided
// We are in packages/browser-agent, but .env is in the root (vibeshield directory)
dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function main() {
    const goal = process.argv.slice(2).join(' ') || 'Navigate to https://example.com and tell me what the main heading is. Then finish.';

    // In production, Cortex-R API key comes from VS Code settings. But for this CLI, we use an env var.
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("Please provide GEMINI_API_KEY as an environment variable.");
        process.exit(1);
    }

    const agent = new BrowserAgent({
        apiKey,
        headless: false, // Make it visible during testing
        artifactsPath: path.join(process.cwd(), 'artifacts', 'cli_run_' + Date.now())
    });

    console.log(`Starting Browser Agent with goal: "${goal}"`);
    try {
        await agent.execute(goal, 15);
    } catch (err) {
        console.error("Error executing goal:", err);
    } finally {
        await agent.close();
    }
}

main().catch(console.error);
