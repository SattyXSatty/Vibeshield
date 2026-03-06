import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Define result types here or import from shared if/when available
export interface LogAnalysisResult {
    hasError: boolean;
    errorType?: string;
    errorMessage?: string;
    affectedFile?: string;
    line?: number;
    cause?: string;
    fix?: string;
}

export class CortexBridge {
    private genAI: GoogleGenerativeAI | null = null;
    private model: any = null;

    constructor() {
        this.updateConfig();
    }

    public updateConfig() {
        const apiKey = vscode.workspace.getConfiguration('vibeshield').get<string>('apiKey');
        console.log('[VibeShield] Cortex-R API Key detected:', apiKey ? 'YES' : 'NO');
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        } else {
            console.warn('[VibeShield] No API Key set for Cortex-R');
            this.model = null; // Clear if revoked
        }
    }

    public isReady(): boolean {
        return !!this.model;
    }

    /**
     * Convert raw API errors into clean, user-friendly messages.
     * Hides internal URLs, error codes, and API jargon.
     */
    private friendlyError(error: any): string {
        const msg = error?.message || String(error);

        // Handle explicit internet dropouts
        if (msg.includes('fetch failed') || msg.includes('Failed to fetch')) {
            return 'Network error: Connection lost. Please check your internet connection and try again.';
        }

        if (msg.includes('429') || msg.includes('Resource exhausted')) {
            return 'API rate limit reached. The free-tier Gemini API has usage limits — please wait a minute and try again, or upgrade to a paid API key for uninterrupted usage.';
        }
        if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
            return 'API key does not have permission. Please check your Gemini API key in Settings.';
        }
        if (msg.includes('401') || msg.includes('UNAUTHENTICATED')) {
            return 'Invalid API key. Please update your Gemini API key in VibeShield Settings.';
        }
        if (msg.includes('Timeout') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED')) {
            return 'Network timeout — could not reach the AI service. Check your internet connection and try again.';
        }
        // Generic fallback — strip URLs and keep it short
        return msg.replace(/https?:\/\/[^\s]+/g, '[API]').substring(0, 200);
    }

    /** Compute delay for retries. 429 errors get longer cooldowns. */
    private retryDelay(attempt: number, error?: any): number {
        const is429 = error?.message?.includes('429') || error?.message?.includes('Resource exhausted');
        return is429 ? attempt * 12000 : attempt * 4000; // 12s/24s/36s for 429; 4s/8s/12s for others
    }

    public async analyzeLogs(logs: string, attempt = 1): Promise<LogAnalysisResult> {
        if (!this.model) {
            this.updateConfig(); // Try to load config again (maybe user added key recently)
        }

        if (!this.model) {
            return {
                hasError: false,
                errorMessage: 'Cortex-R not configured (missing API key)'
            };
        }

        const prompt = `
Analyze the following terminal output and determine:
1. Are there any errors? (Yes/No)
   - logic errors, syntax errors, type errors
   - "command not found", "module not found", "ENOENT"
   - unexpected non-zero exit codes indicated in logs
2. If yes, what type of error? (module_not_found, syntax, type, runtime, build, configuration, other)
3. What is the error message?
4. What file/line is affected?
5. What is the likely cause?
6. What is the suggested fix?

Return the result as a strictly valid JSON object. Do not include markdown formatting (like \`\`\`json).
Format:
{
  "hasError": boolean,
  "errorType": "string",
  "errorMessage": "string",
  "affectedFile": "string",
  "line": number,
  "cause": "string",
  "fix": "string"
}

Terminal output:
${logs}
`;

        // Create Debug Channel (don't auto-show to avoid stealing focus from chat automation)
        const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
        // debugChannel.show(true); // Disabled: was stealing focus from native chat paste
        debugChannel.appendLine('\n--- CORTEX-R INPUT PROMPT ---');
        debugChannel.appendLine(prompt);
        debugChannel.appendLine('-----------------------------\n');

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            debugChannel.appendLine('\n--- CORTEX-R RAW OUTPUT ---');
            debugChannel.appendLine(text);
            debugChannel.appendLine('---------------------------\n');

            // Clean up potentially dirty JSON (Gemini sometimes adds markdown)
            const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();

            return JSON.parse(cleanJson) as LogAnalysisResult;
        } catch (error: any) {
            debugChannel.appendLine(`[Error] Cortex-R Analysis Failed: ${error}`);
            console.error(`[VibeShield] Cortex-R Analysis Failed (Attempt ${attempt}):`, error);

            if (attempt < 3 && !error?.message?.includes('fetch failed') && !error?.message?.includes('Failed to fetch')) {
                const delay = this.retryDelay(attempt, error);
                console.log(`[VibeShield] Waiting ${delay}ms before retrying log analysis...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.analyzeLogs(logs, attempt + 1);
            }

            // Fallback result
            return {
                hasError: false,
                errorMessage: this.friendlyError(error)
            };
        }
    }

    public async extractIntent(chatHistory: string, diffSummary: string, smartMemory: string, fileContext: any): Promise<any> {
        if (!this.model) {
            this.updateConfig();
        }

        if (!this.model) {
            return {
                developerIntent: 'Unknown (Cortex-R unavailable)',
                testingType: 'none',
                scenariosToTest: [],
                edgeCases: [],
                isUnclear: true
            };
        }

        const prompt = `
You are a QA automation architect analyzing a developer's recent coding session.
Based on the following contextual inputs, we need to prepare testing tasks for the upcoming QA phase:

1. Current Project Smart Memory (summarized context):
${smartMemory || '(None provided)'}

2. Recent chat conversation (IDE/Developer activity):
${chatHistory || '(None provided)'}
CRITICAL INSTRUCTION: If the developer provides an explicit command or explicitly asks to test a specific thing in the recent chat conversation (e.g. "Call the PokeAPI..." or "Test the login button"), THAT is the PRIMARY intent. You MUST ignore older background context if it distracts from the user's explicit request! Keep in mind background logs might contain internal commands like "forceFile", ignore them.

3. Code changes (Git Diff summary):
${diffSummary || '(None provided)'}

4. Active IDE File (The file the developer is looking at right now):
File Name: ${fileContext?.fileName || 'None'}
Content Snippet (max 3000 chars): ${fileContext?.content?.substring(0, 3000) || 'None'}

CRITICAL INSTRUCTION: If there is no specific chat request and no git diffs, but there is an Active IDE File, ASSUME the developer simply wants to test the Active IDE File and generate test cases for whatever logical functions/UI you see in that file. DO NOT return "intent is unclear" if you have a valid active file.

Determine:
- What is the primary "Developer Intent"? (Briefly summarize what exactly they are trying to build/fix).
- What type of testing is most appropriate? (e2e/api/ui/unit/none)
- Provide a list of concrete "Scenarios to Test" (actionable test names you'd assign to a QA engineer).
- Provide a list of "Edge Cases" that the developer might have missed or should be explicitly verified.
- Is the intent too unclear to generate test cases? (boolean)

Return strictly valid JSON. Do not include markdown formatting.
Format:
{
  "developerIntent": "string",
  "testingType": "e2e" | "api" | "ui" | "unit" | "none",
  "scenariosToTest": ["string"],
  "edgeCases": ["string"],
  "isUnclear": boolean
}
`;

        const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
        const logPrompt = '\n=== CORTEX-R INTENT EXTRACT PROMPT ===\n' + prompt + '\n======================================\n';
        debugChannel.appendLine(logPrompt);
        console.log(logPrompt); // Print to terminal

        const maxRetries = 5;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                const logOut = '\n=== CORTEX-R INTENT OUTPUT (Attempt ' + attempt + ') ===\n' + text + '\n==============================\n';
                debugChannel.appendLine(logOut);
                console.log(logOut); // Print to terminal

                const jsonMatch = text.match(/\{[\s\S]*\}/);
                const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
                return JSON.parse(cleanJson);
            } catch (error: any) {
                console.error(`[VibeShield] Cortex-R Intent Extraction Attempt ${attempt} Failed:`, error);
                if (attempt === maxRetries || error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) {
                    return {
                        developerIntent: this.friendlyError(error),
                        testingType: 'none',
                        scenariosToTest: [],
                        edgeCases: [],
                        isUnclear: true
                    };
                }
                const delayMs = this.retryDelay(attempt, error);
                console.log(`[VibeShield] Waiting ${delayMs}ms before retrying intent extraction...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    public async hasIntentChanged(oldIntent: any, newIntent: any): Promise<boolean> {
        if (!this.model) {
            this.updateConfig();
        }

        if (!this.model) {
            return true; // Safe fallback: generate new tests if we can't check
        }

        // Fast path: Exact string match
        if (JSON.stringify(oldIntent) === JSON.stringify(newIntent)) {
            return false;
        }

        const prompt = `
You are an expert QA Automation Engineer evaluating developer intents to decide if tests need to be regenerated.
Compare the PREVIOUS intent with the NEW intent.
Determine if there is any meaningful change in the testing goals, scenarios, edge cases, or features to test.
If the wording is slightly different but the literal testing goals and steps are functionally identical, respond FALSE (intent has not changed).
If the new intent asks to test something new, changes existing requirements, or has different scenarios, respond TRUE (intent has changed).

PREVIOUS INTENT:
${JSON.stringify(oldIntent, null, 2)}

NEW INTENT:
${JSON.stringify(newIntent, null, 2)}

Respond with STRICTLY valid JSON:
{
  "changed": boolean,
  "reason": "string"
}
`;

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                const jsonMatch = text.match(/\{[\s\S]*\}/);
                const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(cleanJson);
                return !!parsed.changed;
            } catch (error: any) {
                console.error(`[VibeShield] Cortex-R Intent Change Check Attempt ${attempt} Failed:`, error);
                if (attempt === maxRetries) {
                    return true; // Fallback to regenerating tests on total failure
                }
                const delayMs = this.retryDelay(attempt, error);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return true;
    }

    public async generateTestPlan(intent: any, projectContext: string): Promise<any> {
        if (!this.model) {
            this.updateConfig();
        }

        if (!this.model) {
            return {
                testType: 'none',
                planName: 'Cortex-R Unavailable',
                description: 'Could not generate test plan due to missing API configuration.',
                steps: []
            };
        }

        const prompt = `
You are a senior QA Automation Engineer.
Based on the following explicit developer intent and project context, generate a robust test plan.

1. Extracted Intent:
${JSON.stringify(intent, null, 2)}

2. Project Context (Framework, Commands, Structure):
${projectContext || '(None provided)'}

Generate a clear, ordered test plan with specific steps.
- For CLI: include exact commands and expected terminal output.
- For API: include endpoints, HTTP methods, and expected JSON shapes/status codes.
- For UI (including end-to-end browser tests): YOU MUST GENERATE EXTREMELY GRANULAR, ATOMIC MICRO-STEPS. 
    - DO NOT group multiple actions into one step. EACH step object in the JSON array MUST represent exactly ONE atomic action (e.g., ONE click, ONE type sequence, ONE wait).
    - Example of CORRECT step breakdown: 
      [
        {"stepName": "Click 5", "action": "Click the '5' button."},
        {"stepName": "Click Plus", "action": "Click the '+' button."},
        {"stepName": "Click 3", "action": "Click the '3' button."},
        {"stepName": "Click Equals", "action": "Click the '=' button."},
        {"stepName": "Verify Result", "action": "Verify display is 8.", "expectedResult": "Display shows 8"}
      ]
    - If interacting with a browser, always use "ui" as the testType.

Return strictly valid JSON. Do not include markdown formatting.
Format:
{
  "testType": "ui" | "api" | "cli" | "unit" | "none",
  "planName": "string",
  "description": "string",
  "steps": [
    {
      "stepName": "string", // Short descriptive name
      "action": "string", // CRITICAL: This MUST be a SINGLE, ATOMIC action (e.g., "Click 'Submit'", NOT a numbered list).
      "cliCommand": "string", // OPTIONAL
      "apiRequest": { // OPTIONAL
        "method": "GET | POST | PUT | DELETE",
        "url": "string",
        "headers": { "key": "value" }, 
        "body": {}
      },
      "expectedResult": "string" // Expected state AFTER this atomic action
    }
  ]
}
`;

        const maxRetries = 5;
        let lastError: any = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            let currentPrompt = prompt;
            if (attempt > 1) {
                currentPrompt += `\n\n[SYSTEM ERROR IN PREVIOUS ATTEMPT]: The previous JSON generation failed to parse. Error: ${lastError?.message || 'Invalid JSON format'}.\nCRITICAL: Please ensure output is STRICTLY valid JSON, with all keys and string values properly double-quoted. Do not include markdown \`\`\`json wrappers.`;
            }

            const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
            const logPrompt = `\n=== CORTEX-R TEST PLAN PROMPT (Attempt ${attempt}/${maxRetries}) ===\n` + currentPrompt + '\n=================================\n';
            debugChannel.appendLine(logPrompt);
            console.log(logPrompt);

            try {
                // Add explicit timeout to the fetch call inside Gemini SDK if possible, or wrap in a timeout promise
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('LLM Generation Timeout (30s)')), 30000);
                });

                const apiCall = this.model.generateContent(currentPrompt);
                const result = await Promise.race([apiCall, timeoutPromise]) as any;

                const response = await result.response;
                const text = response.text();

                const logOut = `\n=== CORTEX-R TEST PLAN OUTPUT (Attempt ${attempt}) ===\n` + text + '\n=================================\n';
                debugChannel.appendLine(logOut);
                console.log(logOut);

                const jsonMatch = text.match(/\{[\s\S]*\}/);
                const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
                let parsed = JSON.parse(cleanJson);

                // Helper to recursively unwrap any weird keys the LLM puts the plan inside
                const unwrapPlan = (obj: any): any => {
                    if (!obj || typeof obj !== 'object') return obj;
                    if (obj.planName || obj.steps || obj.testType) return obj;
                    for (const key in obj) {
                        const nested = unwrapPlan(obj[key]);
                        if (nested && typeof nested === 'object' && (nested.planName || nested.steps || nested.testType)) {
                            return nested;
                        }
                    }
                    return obj;
                };

                parsed = unwrapPlan(parsed);

                // If it STILL doesn't look like a valid test plan, throw so the retry loop catches it
                if (!parsed.testType && !parsed.steps) {
                    throw new Error('AI returned a structured JSON object, but it missed the required testType and steps fields.');
                }

                // SUCCESS
                return {
                    testType: parsed.testType || 'none',
                    planName: parsed.planName || parsed.name || 'Unnamed Test Plan',
                    description: parsed.description || parsed.desc || 'No description provided.',
                    steps: Array.isArray(parsed.steps) ? parsed.steps : (parsed.testSteps ? parsed.testSteps : [])
                };

            } catch (error: any) {
                lastError = error;
                console.warn(`[VibeShield] Cortex-R Test Plan Attempt ${attempt} Failed:`, error.message);
                if (attempt === maxRetries || error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) {
                    console.error('[VibeShield] Cortex-R Exhausted all retries.');
                    break;
                }
                const delayMs = this.retryDelay(attempt, error);
                console.log(`[VibeShield] Waiting ${delayMs}ms before retrying test plan generation...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        // ONLY reachable if all retries failed
        return {
            testType: 'none',
            planName: 'Generation Failed',
            description: this.friendlyError(lastError),
            steps: []
        };
    }

    public async analyzeTestResult(command: string, expectedOutput: string, stdout: string, stderr: string, exitCode: number | null): Promise<any> {
        if (!this.model) {
            this.updateConfig();
        }

        if (!this.model) {
            return {
                passed: false,
                analysis: 'Cortex-R Unavailable',
                rootCause: 'Cannot reach Cortex-R',
            };
        }

        const prompt = `
You are a senior QA Automation Engineer analyzing a CLI test execution.

The following command was executed:
Command: ${command}
Expected Result: ${expectedOutput || 'Success'}

Actual Output:
STDOUT:
${stdout || '(Empty)'}

STDERR:
${stderr || '(Empty)'}

Exit Code: ${exitCode}

Analyze the result and determine:
1. Did the test pass based exactly on the expected result?
2. What is the analysis of the output? Provide a short explanation.
3. If it failed, what is the root cause? Provide a short specific reason.

Return strictly valid JSON. Do not include markdown formatting.
Format:
{
  "passed": boolean,
  "analysis": "string",
  "rootCause": "string"
}
`;

        const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
        const logPrompt = '\n=== CORTEX-R TEST ANALYSIS PROMPT ===\n' + prompt + '\n=====================================\n';
        debugChannel.appendLine(logPrompt);
        console.log(logPrompt); // Print to terminal

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                const logOut = '\n=== CORTEX-R TEST ANALYSIS OUTPUT (Attempt ' + attempt + ') ===\n' + text + '\n=====================================\n';
                debugChannel.appendLine(logOut);
                console.log(logOut); // Print to terminal

                const jsonMatch = text.match(/\{[\s\S]*\}/);
                const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
                return JSON.parse(cleanJson);
            } catch (error: any) {
                console.error(`[VibeShield] Cortex-R Test Analysis Attempt ${attempt} Failed:`, error);
                if (attempt === maxRetries || error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) {
                    return {
                        passed: false,
                        analysis: this.friendlyError(error),
                        rootCause: 'Cortex-R analysis unavailable'
                    };
                }
                const delayMs = this.retryDelay(attempt, error);
                console.log(`[VibeShield] Waiting ${delayMs}ms before retrying CLI analysis...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    public async analyzeAPIResult(
        requestUrl: string,
        method: string,
        requestHeaders: any,
        requestBody: any,
        expectedResult: string,
        status: number,
        responseHeaders: any,
        responseData: any,
        responseTimeMs?: number
    ): Promise<any> {
        if (!this.model) {
            this.updateConfig();
        }

        if (!this.model) {
            return {
                passed: false,
                analysis: 'Cortex-R Unavailable',
                rootCause: 'Cannot reach Cortex-R',
            };
        }

        const prompt = `
API request:
${method} ${requestUrl}
Headers: ${JSON.stringify(requestHeaders || {}, null, 2)}
Body: ${typeof requestBody === 'object' ? JSON.stringify(requestBody, null, 2) : requestBody || '(Empty)'}

Expected (from test plan):
${expectedResult || 'Success'}

Actual response:
Status: ${status}
Headers: ${JSON.stringify(responseHeaders || {}, null, 2)}
Body: ${typeof responseData === 'object' ? JSON.stringify(responseData, null, 2) : responseData || '(Empty)'}
Time: ${responseTimeMs || 'Unknown'}ms

Did the test pass? Explain.

Return strictly valid JSON. Do not include markdown formatting.
Format:
{
  "passed": boolean,
  "analysis": "string",
  "rootCause": "string"
}
`;

        const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
        const logPrompt = '\n=== CORTEX-R API TEST ANALYSIS PROMPT ===\n' + prompt + '\n=========================================\n';
        debugChannel.appendLine(logPrompt);
        console.log(logPrompt); // Print to terminal

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                const logOut = '\n=== CORTEX-R API TEST ANALYSIS OUTPUT (Attempt ' + attempt + ') ===\n' + text + '\n=========================================\n';
                debugChannel.appendLine(logOut);
                console.log(logOut); // Print to terminal

                const jsonMatch = text.match(/\{[\s\S]*\}/);
                const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
                return JSON.parse(cleanJson);
            } catch (error: any) {
                console.error(`[VibeShield] Cortex-R API Test Analysis Attempt ${attempt} Failed:`, error);
                if (attempt === maxRetries || error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) {
                    return {
                        passed: false,
                        analysis: this.friendlyError(error),
                        rootCause: 'Cortex-R analysis unavailable'
                    };
                }
                const delayMs = this.retryDelay(attempt, error);
                console.log(`[VibeShield] Waiting ${delayMs}ms before retrying API analysis...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    public async analyzeUIState(
        screenshotBase64: string,
        expectedResult: string,
        diffBase64?: string
    ): Promise<any> {
        if (!this.model) {
            this.updateConfig();
        }

        if (!this.model) {
            return {
                passed: false,
                analysis: 'Cortex-R Unavailable',
                rootCause: 'Cannot reach Cortex-R',
            };
        }

        let prompt = `
You are a senior QA Automation Engineer analyzing a UI test state.
Expected Result: ${expectedResult || 'The UI should be in the correct state.'}

Analyze the provided screenshot(s) and determine:
1. Does the UI show the expected state based on the expected result?
2. Are there any visible errors on the screen?
3. If it failed, what is the root cause? Provide a short specific reason based on what you see.
`;

        if (diffBase64) {
            prompt += `\nAdditionally, you have been provided with a visual diff image showing the differences between the baseline and the current state. Red pixels indicate differences. Is this a regression or an intentional change based on the expected result?\n`;
        }

        prompt += `
Return strictly valid JSON. Do not include markdown formatting.
Format:
{
  "passed": boolean,
  "analysis": "string",
  "rootCause": "string"
}
`;

        const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
        const logPrompt = '\n=== CORTEX-R UI STATE ANALYSIS PROMPT ===\n' + prompt + '\n=========================================\n';
        debugChannel.appendLine(logPrompt);
        console.log(logPrompt);

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const parts: any[] = [prompt];

                // Current screenshot
                parts.push({
                    inlineData: {
                        data: screenshotBase64,
                        mimeType: "image/png"
                    }
                });

                // Diff screenshot if available
                if (diffBase64) {
                    parts.push({
                        inlineData: {
                            data: diffBase64,
                            mimeType: "image/png"
                        }
                    });
                }

                const result = await this.model.generateContent(parts);
                const response = await result.response;
                const text = response.text();

                const logOut = '\n=== CORTEX-R UI STATE ANALYSIS OUTPUT (Attempt ' + attempt + ') ===\n' + text + '\n=========================================\n';
                debugChannel.appendLine(logOut);
                console.log(logOut);

                const jsonMatch = text.match(/\{[\s\S]*\}/);
                const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
                return JSON.parse(cleanJson);
            } catch (error: any) {
                console.error(`[VibeShield] Cortex-R UI State Analysis Attempt ${attempt} Failed:`, error);
                if (attempt === maxRetries || error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) {
                    return {
                        passed: false,
                        analysis: this.friendlyError(error),
                        rootCause: 'Cortex-R analysis unavailable'
                    };
                }
                const delayMs = this.retryDelay(attempt, error);
                console.log(`[VibeShield] Waiting ${delayMs}ms before retrying UI analysis...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    public async updateSmartMemory(currentMemory: string, newChatHistory: string): Promise<string> {
        if (!this.model) {
            this.updateConfig();
        }
        if (!this.model) return currentMemory;

        const prompt = `
You are an advanced memory manager for an AI coding assistant.
Your task is to update the current "Smart Memory" with new information extracted from recent chat histories or events.
Distill the new chat logs and merge any NEW features, concepts, or intentions into the existing memory string.
IGNORE redundant information that is already present.
Keep the memory concise (under 1000 words), well-structured (bullet points preferred), and maintain critical project context.

CURRENT MEMORY:
${currentMemory || "(Empty)"}

NEW CHAT HISTORY TO PROCESS:
${newChatHistory || "(None)"}

Respond ONLY with the completely updated new memory content. DO NOT include any markdown blocks (like \`\`\` or \`\`\`markdown), greetings, or explanations. If the new chat contains no useful new information, you should simply return the exact CURRENT MEMORY.
`;
        const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
        const logPrompt = '\n=== CORTEX-R SMART MEMORY UPDATE PROMPT ===\n' + prompt + '\n===========================================\n';
        debugChannel.appendLine(logPrompt);
        console.log(logPrompt); // Print to terminal

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const updatedMemoryText = response.text().trim();

                const logOut = '\n=== CORTEX-R SMART MEMORY OUTPUT (Attempt ' + attempt + ') ===\n' + updatedMemoryText + '\n====================================\n';
                debugChannel.appendLine(logOut);
                console.log(logOut); // Print to terminal

                return updatedMemoryText;
            } catch (error: any) {
                console.error(`[VibeShield] Cortex-R Smart Memory Update Attempt ${attempt} Failed:`, error);
                if (attempt === maxRetries || error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) return currentMemory;

                const delayMs = this.retryDelay(attempt, error);
                console.log(`[VibeShield] Waiting ${delayMs}ms before retrying Smart Memory update...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return currentMemory;
    }

    public async generateFailureFeedback(failedTestsLog: string): Promise<string> {
        if (!this.model) {
            this.updateConfig();
        }
        if (!this.model) return 'Feedback generation unavailable (Cortex-R not configured).';

        const prompt = `
You are a senior QA Automation Engineer analyzing a recently failed suite of automated tests.
The following tests failed execution:

${failedTestsLog}

Generate actionable, developer-friendly feedback to help fix these issues. 
Include:
- What specifically failed in plain English.
- Why it likely failed based on the logs/analysis.
- A concrete suggested fix (code, configuration, or structural).
- IF the failure was due to a visual regression or unexpected UI state, explicitly mention that the UI does not match the expected state.

Keep it concise and format the output cleanly (using basic markdown for readability). Do NOT wrap the entire response in a \`\`\`markdown JSON block, just output the plain text.
`;
        const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
        const logPrompt = '\n=== CORTEX-R FAILURE FEEDBACK PROMPT ===\n' + prompt + '\n=========================================\n';
        debugChannel.appendLine(logPrompt);
        console.log(logPrompt);

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                return response.text().trim();
            } catch (error: any) {
                console.error(`[VibeShield] Cortex-R Failure Feedback Generation Attempt ${attempt} Failed:`, error);
                if (attempt === maxRetries || error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) {
                    return '⚠️ ' + this.friendlyError(error);
                }
                const delayMs = this.retryDelay(attempt, error);
                console.log(`[VibeShield] Waiting ${delayMs}ms before retrying feedback generation...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return '⚠️ Could not generate AI feedback after multiple attempts.';
    }

    public async generateChatResponse(analysis: LogAnalysisResult): Promise<string> {
        if (!this.model) {
            this.updateConfig();
        }
        if (!this.model) {
            return "I noticed an error but couldn't analyze the details (Cortex-R unavailable). Please check the logs.";
        }

        const prompt = `
You are a helpful coding assistant. A process just failed with the following error analysis:
${JSON.stringify(analysis, null, 2)}

Write a short, friendly, and actionable message to the developer explaining what went wrong and how to fix it.
Keep it under 3 sentences. Do not use complex markdown headers, but you can use *bold* or \`code\`.
Reply directly with the message.
`;

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text().trim();
                return text;
            } catch (error: any) {
                console.error(`[VibeShield] Failed to generate chat response (Attempt ${attempt}):`, error);
                if (attempt === maxRetries || error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) {
                    return `🔴 **Error**: ${analysis.errorMessage}. **Fix**: ${analysis.fix}`;
                }
                const delayMs = this.retryDelay(attempt, error);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return `🔴 **Error**: ${analysis.errorMessage}. **Fix**: ${analysis.fix}`;
    }

    public async respondToChat(userMessage: string, chatHistory: string, context?: any): Promise<string> {
        if (!this.model) {
            this.updateConfig();
        }
        if (!this.model) {
            return "I'm offline because my connection to Cortex-R isn't configured.";
        }

        const prompt = `
You are VibeShield, an intelligent QA and testing agent living inside the user's IDE.
The user just sent you a message. 
If the user is asking you to generate a test plan or extract intent, politely inform them that you have noted their request in the context, and they should click the "Extract Intent" -> "Generate Test Plan" buttons in the Overlay Action Bar to proceed with the generation!

Recent chat history:
${chatHistory}

Context File (if any):
${context ? JSON.stringify(context, null, 2) : 'None'}

User Message:
${userMessage}

Respond naturally, concisely, and helpfully. You can use markdown for formatting.
`;
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                return response.text().trim();
            } catch (error: any) {
                console.error(`[VibeShield] Failed to respond to chat (Attempt ${attempt}):`, error);
                if (attempt === maxRetries || error?.message?.includes('fetch failed') || error?.message?.includes('Failed to fetch')) {
                    return `Sorry, I'm having trouble right now. ${this.friendlyError(error)}`;
                }
                const delayMs = this.retryDelay(attempt, error);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return "Sorry, I'm having trouble analyzing that request right now.";
    }

    public async checkServerReadiness(logs: string): Promise<ServerReadinessResult> {
        if (!this.model) {
            this.updateConfig();
        }

        if (!this.model) {
            return { isReady: false };
        }

        const prompt = `
Analyze the following terminal output and determine if the development server is fully up and running.
Look for indicators like:
- "ready on http://..."
- "listening on port..."
- "compiled successfully"
- "built in ...ms"

Output strictly valid JSON:
{
  "isReady": boolean,
  "url": "string" (optional, e.g. http://localhost:3000),
  "port": number (optional)
}

Terminal output:
${logs.substring(logs.length - 2000)}
`;
        // Optimization: only send last 2000 chars

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson) as ServerReadinessResult;
        } catch (error) {
            console.error('[VibeShield] Cortex-R Readiness Check Failed:', error);
            return { isReady: false };
        }
    }
}

export interface ServerReadinessResult {
    isReady: boolean;
    url?: string;
    port?: number;
}
