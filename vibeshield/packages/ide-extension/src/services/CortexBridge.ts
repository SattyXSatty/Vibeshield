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

            if (attempt < 3) {
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                return this.analyzeLogs(logs, attempt + 1);
            }

            // Fallback result
            return {
                hasError: false,
                errorMessage: 'Failed to analyze logs via Cortex-R after retries.'
            };
        }
    }

    public async extractIntent(chatHistory: string, diffSummary: string, smartMemory: string): Promise<any> {
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
CRITICAL INSTRUCTION: If the developer provides an explicit command or explicitly asks to test a specific thing in the recent chat conversation (e.g. "Call the PokeAPI..." or "Test the login button"), THAT is the PRIMARY intent. You MUST ignore older background context if it distracts from the user's explicit request!

3. Code changes (Git Diff summary):
${diffSummary || '(None provided)'}

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

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const logOut = '\n=== CORTEX-R INTENT OUTPUT ===\n' + text + '\n==============================\n';
            debugChannel.appendLine(logOut);
            console.log(logOut); // Print to terminal

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (error) {
            console.error('[VibeShield] Cortex-R Intent Extraction Failed:', error);
            return {
                developerIntent: 'Extraction Failed',
                testingType: 'none',
                scenariosToTest: [],
                edgeCases: [],
                isUnclear: true
            };
        }
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
- For UI: include pages to visit, specific elements to interact with, and expected visual/state changes.

Return strictly valid JSON. Do not include markdown formatting.
Format:
{
  "testType": "e2e" | "api" | "ui" | "unit" | "none",
  "planName": "string",
  "description": "string",
  "steps": [
    {
      "stepName": "string",
      "action": "string",
      "cliCommand": "string", // OPTIONAL. ONLY provide this if an exact, fully automatable bash/terminal command can execute this step.
      "apiRequest": { // OPTIONAL. ONLY provide this if the step is an HTTP request.
        "method": "GET | POST | PUT | DELETE",
        "url": "string",
        "headers": { "key": "value" }, 
        "body": {} // Object or string
      },
      "expectedResult": "string"
    }
  ]
}
`;

        const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
        const logPrompt = '\n=== CORTEX-R TEST PLAN PROMPT ===\n' + prompt + '\n=================================\n';
        debugChannel.appendLine(logPrompt);
        console.log(logPrompt); // Print to terminal

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const logOut = '\n=== CORTEX-R TEST PLAN OUTPUT ===\n' + text + '\n=================================\n';
            debugChannel.appendLine(logOut);
            console.log(logOut); // Print to terminal

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (error) {
            console.error('[VibeShield] Cortex-R Test Plan Generation Failed:', error);
            return {
                testType: 'none',
                planName: 'Generation Failed',
                description: 'An error occurred while calling Cortex-R.',
                steps: []
            };
        }
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

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const logOut = '\n=== CORTEX-R TEST ANALYSIS OUTPUT ===\n' + text + '\n=====================================\n';
            debugChannel.appendLine(logOut);
            console.log(logOut); // Print to terminal

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (error: any) {
            console.error('[VibeShield] Cortex-R Test Analysis Failed:', error);
            return {
                passed: false,
                analysis: 'Analysis failed due to Cortex-R error: ' + error.message,
                rootCause: 'Unknown'
            };
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

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            const logOut = '\n=== CORTEX-R API TEST ANALYSIS OUTPUT ===\n' + text + '\n=========================================\n';
            debugChannel.appendLine(logOut);
            console.log(logOut); // Print to terminal

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const cleanJson = jsonMatch ? jsonMatch[0] : text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanJson);
        } catch (error: any) {
            console.error('[VibeShield] Cortex-R API Test Analysis Failed:', error);
            return {
                passed: false,
                analysis: 'Analysis failed due to Cortex-R error: ' + error.message,
                rootCause: 'Unknown'
            };
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

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const updatedMemoryText = response.text().trim();

            const logOut = '\n=== CORTEX-R SMART MEMORY OUTPUT ===\n' + updatedMemoryText + '\n====================================\n';
            debugChannel.appendLine(logOut);
            console.log(logOut); // Print to terminal

            return updatedMemoryText;
        } catch (error) {
            console.error('[VibeShield] Cortex-R Smart Memory Update Failed:', error);
            return currentMemory; // Fallback to current memory if update fails
        }
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

Keep it concise and format the output cleanly (using basic markdown for readability). Do NOT wrap the entire response in a \`\`\`markdown JSON block, just output the plain text.
`;
        const debugChannel = vscode.window.createOutputChannel("VibeShield Debug");
        const logPrompt = '\n=== CORTEX-R FAILURE FEEDBACK PROMPT ===\n' + prompt + '\n=========================================\n';
        debugChannel.appendLine(logPrompt);
        console.log(logPrompt);

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error: any) {
            console.error('[VibeShield] Cortex-R Failure Feedback Generation Failed:', error);
            return 'Failed to generate feedback due to an API error: ' + error.message;
        }
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

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();
            return text;
        } catch (error) {
            console.error('[VibeShield] Failed to generate chat response:', error);
            // Fallback to structured message if generation fails
            return `🔴 **Error**: ${analysis.errorMessage}. **Fix**: ${analysis.fix}`;
        }
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
        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text().trim();
        } catch (error) {
            console.error('[VibeShield] Failed to respond to chat:', error);
            return "Sorry, I had trouble processing your request.";
        }
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
