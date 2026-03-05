import { chromium, Browser, Page } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

export interface BrowserAgentConfig {
    apiKey: string;
    headless?: boolean;
    artifactsPath?: string;
}

export interface StepAction {
    action: 'goto' | 'click' | 'type' | 'wait' | 'finish' | 'error';
    selector?: string;
    text?: string;
    url?: string;
    reason?: string;
}

export class BrowserAgent {
    private genAI: GoogleGenerativeAI;
    private browser: Browser | null = null;
    private page: Page | null = null;
    private config: BrowserAgentConfig;

    constructor(config: BrowserAgentConfig) {
        this.config = {
            headless: false,
            artifactsPath: path.join(process.cwd(), 'artifacts'),
            ...config
        };
        this.genAI = new GoogleGenerativeAI(config.apiKey);

        if (!fs.existsSync(this.config.artifactsPath!)) {
            fs.mkdirSync(this.config.artifactsPath!, { recursive: true });
        } else {
            this.cleanupOldArtifacts();
        }
    }

    /**
     * Keep only the latest 5 execution folders/files to save disk space
     */
    private cleanupOldArtifacts() {
        if (!this.config.artifactsPath) return;
        try {
            const files = fs.readdirSync(this.config.artifactsPath)
                .map(name => ({ name, time: fs.statSync(path.join(this.config.artifactsPath!, name)).mtime.getTime() }))
                .sort((a, b) => b.time - a.time); // newest first

            // Keep the newest 5 items
            const toDelete = files.slice(5);
            for (const file of toDelete) {
                const fullPath = path.join(this.config.artifactsPath, file.name);
                fs.rmSync(fullPath, { recursive: true, force: true });
            }
        } catch (e) {
            console.warn(`[BrowserAgent] Failed to cleanup old artifacts:`, e);
        }
    }

    public async start(): Promise<void> {
        this.browser = await chromium.launch({ headless: this.config.headless });
        this.page = await this.browser.newPage();
    }

    public async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    public async getLastScreenshot(): Promise<string | null> {
        if (!this.page) return null;
        const filename = path.join(this.config.artifactsPath!, 'final_state.png');
        await this.page.screenshot({ path: filename, fullPage: false });
        const buf = fs.readFileSync(filename);
        return buf.toString('base64');
    }

    private async takeScreenshot(step: number): Promise<string> {
        if (!this.page) throw new Error("Browser page not initialized");
        const filename = path.join(this.config.artifactsPath!, `step_${step}.png`);
        await this.page.screenshot({ path: filename, fullPage: false });
        const buf = fs.readFileSync(filename);
        return buf.toString('base64');
    }

    /**
     * Inject a visible red cursor dot into the page for visual feedback.
     * Must be called AFTER each navigation since navigating replaces the DOM.
     */
    private async injectCursor(): Promise<void> {
        if (!this.page) return;
        try {
            await this.page.evaluate(() => {
                // Don't inject twice
                if (document.getElementById('__vibeshield_cursor__')) return;

                const cursor = document.createElement('div');
                cursor.id = '__vibeshield_cursor__';
                cursor.style.cssText = `
                    width: 24px; height: 24px; border-radius: 50%;
                    background-color: rgba(255, 60, 60, 0.5);
                    border: 2px solid rgba(255, 0, 0, 0.9);
                    position: fixed; pointer-events: none; z-index: 9999999;
                    transition: transform 0.15s ease-out, background-color 0.15s ease-out;
                    transform: translate(-50%, -50%);
                    left: 50%; top: 50%;
                `;
                document.body.appendChild(cursor);

                document.addEventListener('mousemove', (e) => {
                    cursor.style.left = `${e.clientX}px`;
                    cursor.style.top = `${e.clientY}px`;
                });

                document.addEventListener('mousedown', () => {
                    cursor.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
                    cursor.style.transform = 'translate(-50%, -50%) scale(0.6)';
                });

                document.addEventListener('mouseup', () => {
                    cursor.style.backgroundColor = 'rgba(255, 60, 60, 0.5)';
                    cursor.style.transform = 'translate(-50%, -50%) scale(1)';
                });
            });
        } catch {
            // Page might not be ready
        }
    }

    private async buildPrompt(goal: string, domSummary: string, pageUrl: string, previousActions: string[]): Promise<string> {
        const historyBlock = previousActions.length > 0
            ? `\nActions already completed in this execution:\n${previousActions.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}\n`
            : '';

        return `
You are an autonomous UI testing agent running via Playwright.
Your goal is: "${goal}"
Current Page URL: ${pageUrl}
${historyBlock}
You have been provided with a screenshot of the current browser state and a summary of the interactive elements (DOM).

Determine the VERY NEXT SINGLE action to take to progress toward achieving the goal.
CRITICAL RULES:
1. If the goal mentions clicking a SPECIFIC button (e.g., "Click the '+' button"), find the matching selector in the DOM Summary below and click it. Then output a 'finish' action.
2. For calculators or keypads: use 'click' on individual buttons. NEVER 'type' into the display.
3. If the current URL is already the target URL, DO NOT emit a 'goto' action.
4. If you have completed the goal, output a 'finish' action.
5. NEVER repeat the same action you already did (see actions completed above). If you see you are looping, output 'finish'.
6. IMPORTANT: Selectors in the DOM Summary use SINGLE quotes inside attribute values (e.g., button[data-number='5']). Copy them EXACTLY into your JSON response. Do NOT change the quotes.

Respond strictly in JSON format. No markdown blocks. No extra keys.

{
  "action": "goto" | "click" | "type" | "wait" | "finish" | "error",
  "selector": "Copy the exact selector string from DOM Summary below",
  "text": "Text to type (for type action only)",
  "url": "URL to navigate (for goto action only)",
  "reason": "Brief explanation"
}

Interactive DOM Summary:
${domSummary}
`;
    }

    public async execute(goal: string, maxSteps = 15): Promise<boolean> {
        if (!this.page) await this.start();

        const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        console.log(`[BrowserAgent] Executing Goal: ${goal}`);
        const logFile = path.join(this.config.artifactsPath!, 'execution.log');
        fs.appendFileSync(logFile, `=== START EXECUTION ===\nGoal: ${goal}\n`);

        const previousActions: string[] = [];
        let consecutiveErrors = 0;

        for (let step = 1; step <= maxSteps; step++) {
            console.log(`[BrowserAgent] Step ${step}: Capturing state...`);

            // Only wait for load state on the first step (after navigation)
            if (step === 1) {
                await this.page!.waitForLoadState('domcontentloaded').catch(() => { });
                await this.injectCursor();
            }

            // Extract a summary of interactive elements, using SINGLE-QUOTED attribute selectors
            // to avoid JSON escaping nightmares when the LLM outputs them
            const domSummary = await this.page!.evaluate(() => {
                const elements = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"]'));
                return elements.map(el => {
                    const tag = el.tagName.toLowerCase();
                    const text = (el.textContent || '').substring(0, 50).trim().replace(/\n/g, ' ');

                    let bestSelector = tag;
                    if (el.id) {
                        bestSelector = `${tag}#${el.id}`;
                    } else {
                        // Use SINGLE quotes in attribute selectors to avoid JSON double-quote conflicts
                        const robustAttrs = ['data-action', 'data-operator', 'data-number', 'data-testid', 'name', 'aria-label'];
                        for (const attr of robustAttrs) {
                            if (el.hasAttribute(attr)) {
                                bestSelector = `${tag}[${attr}='${el.getAttribute(attr)}']`;
                                break;
                            }
                        }

                        // Fallback to classes
                        if (bestSelector === tag && el.className && typeof el.className === 'string') {
                            bestSelector += el.className.split(' ').filter(Boolean).map(c => `.${c}`).slice(0, 2).join('');
                        }
                    }

                    return `Selector: ${bestSelector} | Text: "${text}"`;
                }).join('\n');
            });

            const base64Img = await this.takeScreenshot(step);

            const prompt = await this.buildPrompt(goal, domSummary, this.page!.url(), previousActions);

            try {
                console.log(`[BrowserAgent] Cortex-R analyzing UI...`);
                // Add explicit timeout to prevent infinite hanging
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('LLM Generation Timeout (30s)')), 30000);
                });

                const apiCall = model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            data: base64Img,
                            mimeType: "image/png"
                        }
                    }
                ]);

                const result = await Promise.race([apiCall, timeoutPromise]) as any;

                let responseText = result.response.text();
                responseText = responseText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();

                const actionData = JSON.parse(responseText) as StepAction;
                console.log(`[BrowserAgent] Action Plan:`, actionData);
                fs.appendFileSync(logFile, `Step ${step}: ${JSON.stringify(actionData)}\n`);

                // Track what we've done to prevent infinite loops
                previousActions.push(`${actionData.action}: ${actionData.selector || actionData.url || actionData.reason || ''}`);

                await this.executeAction(actionData);

                if (actionData.action === 'finish') {
                    console.log(`[BrowserAgent] Goal achieved successfully.`);
                    return true;
                } else if (actionData.action === 'error') {
                    console.error(`[BrowserAgent] Goal failed or could not proceed.`);
                    return false;
                }

                // Reset consecutive errors on success
                consecutiveErrors = 0;

            } catch (error: any) {
                console.error(`[BrowserAgent] Error during Cortex-R generation or JSON parsing:`, error);
                fs.appendFileSync(logFile, `Error at step ${step}: ${error.message || error}\n`);
                previousActions.push(`ERROR: ${error.message || error}`);

                consecutiveErrors++;
                if (consecutiveErrors >= 3) {
                    console.error(`[BrowserAgent] Exceeded max consecutive errors (3). Forcing failure to prevent infinite loop.`);
                    return false;
                }
            }

            // Brief delay between actions
            await this.page!.waitForTimeout(500);
        }

        console.log(`[BrowserAgent] Reached max steps (${maxSteps}) without finishing.`);
        fs.appendFileSync(logFile, `Max steps reached.\n=== END EXECUTION ===\n`);
        return false;
    }

    private async executeAction(actionData: StepAction): Promise<void> {
        if (!this.page) return;

        switch (actionData.action) {
            case 'goto':
                if (actionData.url) {
                    await this.page.goto(actionData.url);
                    await this.page.waitForLoadState('load').catch(() => { });
                    // Re-inject cursor after navigation
                    await this.injectCursor();
                }
                break;
            case 'click':
                if (actionData.selector) {
                    try {
                        const loc = this.page.locator(actionData.selector).first();
                        const box = await loc.boundingBox();
                        if (box) {
                            // Smooth, human-like cursor glide to element center
                            await this.page.mouse.move(
                                box.x + box.width / 2,
                                box.y + box.height / 2,
                                { steps: 40 }  // 40 frames = slow, visible cursor movement
                            );
                            await this.page.waitForTimeout(600); // Visible pause before click
                        }
                        await loc.click({ timeout: 5000 });
                        await this.page.waitForTimeout(500); // Pause after click to see result
                    } catch (e) {
                        console.warn(`[BrowserAgent] Click failed on selector "${actionData.selector}". Trying text-based fallback...`);
                        // Try clicking by visible text as fallback
                        try {
                            await this.page.getByText(actionData.reason || '', { exact: false }).first().click({ timeout: 3000 });
                        } catch {
                            console.warn(`[BrowserAgent] Text fallback also failed.`);
                        }
                    }
                }
                break;
            case 'type':
                if (actionData.selector && actionData.text !== undefined) {
                    try {
                        const loc = this.page.locator(actionData.selector).first();
                        const box = await loc.boundingBox();
                        if (box) {
                            await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
                            await this.page.waitForTimeout(400);
                        }
                        await loc.click();
                        await this.page.waitForTimeout(200);
                        await loc.fill("");
                        await loc.pressSequentially(actionData.text, { delay: 60 });
                        await this.page.waitForTimeout(400);
                        await this.page.keyboard.press('Enter');
                    } catch (e) {
                        console.warn(`[BrowserAgent] Type failed on selector "${actionData.selector}".`);
                    }
                }
                break;
            case 'wait':
                await this.page.waitForTimeout(2000);
                break;
            case 'finish':
            case 'error':
                // Handled in the loop
                break;
            default:
                console.warn(`[BrowserAgent] Unknown action: ${actionData.action}`);
        }
    }
}
