import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface VisualDiffResult {
    isRegression: boolean;
    baselineBase64?: string;
    diffBase64?: string;
    mismatchPercentage?: number;
}

export class VisualRegressionTracker {
    private baselineDir: string;

    constructor() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.baselineDir = path.join(workspaceFolders[0].uri.fsPath, '.vibeshield', 'baselines');
        } else {
            // Fallback for no workspace
            this.baselineDir = path.join(process.cwd(), '.vibeshield', 'baselines');
        }

        if (!fs.existsSync(this.baselineDir)) {
            fs.mkdirSync(this.baselineDir, { recursive: true });
        }
    }

    private getBaselinePath(testName: string): string {
        // Sanitize test name for filesystem
        const sanitized = testName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        return path.join(this.baselineDir, `${sanitized}.png`);
    }

    public async compare(testName: string, currentScreenshotBase64: string): Promise<VisualDiffResult> {
        const baselinePath = this.getBaselinePath(testName);
        const currentBuffer = Buffer.from(currentScreenshotBase64, 'base64');

        if (!fs.existsSync(baselinePath)) {
            // No baseline exists, save current as baseline
            fs.writeFileSync(baselinePath, currentBuffer);
            return {
                isRegression: false,
                baselineBase64: currentScreenshotBase64
            };
        }

        // Baseline exists, perform diff
        const baselineBuffer = fs.readFileSync(baselinePath);
        const baselinePng = PNG.sync.read(baselineBuffer);
        const currentPng = PNG.sync.read(currentBuffer);

        const { width, height } = baselinePng;
        const diffPng = new PNG({ width, height });

        // If sizes don't match exactly, pixelmatch will throw or we just consider it a severe regression
        if (baselinePng.width !== currentPng.width || baselinePng.height !== currentPng.height) {
            return {
                isRegression: true,
                baselineBase64: baselineBuffer.toString('base64'),
                mismatchPercentage: 100 // Size mismatch is a complete regression
            };
        }

        const numDiffPixels = pixelmatch(
            baselinePng.data,
            currentPng.data,
            diffPng.data,
            width,
            height,
            { threshold: 0.1 }
        );

        const mismatchPercentage = (numDiffPixels / (width * height)) * 100;
        const diffBuffer = PNG.sync.write(diffPng);
        const diffBase64 = diffBuffer.toString('base64');

        // We consider it a regression if more than 1% of pixels changed
        // This threshold might need tweaking or making adjustable in settings
        const isRegression = mismatchPercentage > 1.0;

        return {
            isRegression,
            baselineBase64: baselineBuffer.toString('base64'),
            diffBase64,
            mismatchPercentage
        };
    }

    public updateBaseline(testName: string, newScreenshotBase64: string): void {
        const baselinePath = this.getBaselinePath(testName);
        fs.writeFileSync(baselinePath, Buffer.from(newScreenshotBase64, 'base64'));
    }
}
