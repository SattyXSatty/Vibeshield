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
2. If yes, what type of error? (module_not_found, syntax, type, runtime, build, other)
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

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Clean up potentially dirty JSON (Gemini sometimes adds markdown)
            const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();

            return JSON.parse(cleanJson) as LogAnalysisResult;
        } catch (error: any) {
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

    public async extractIntent(_diff: string) {
        // TODO: Implement for Epic 2.1
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
