import * as vscode from 'vscode';
import * as path from 'path';

export interface CodeContext {
    filePath: string;
    fileName: string;
    content: string;
    selection?: string;
    cursorLine: number;
    language: string;
}

import { ChatContextExtractor } from './ChatContextExtractor';
import { LogSelector } from './LogSelector';
import { ActivityTracker } from './ActivityTracker';

export class ContextExtractor {
    constructor(
        private logSelector: LogSelector,
        private activityTracker: ActivityTracker,
        private chatExtractor: ChatContextExtractor
    ) { }

    public getCurrentContext(): CodeContext | null {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            return null;
        }

        const document = editor.document;
        const selection = editor.selection;
        const fileName = path.basename(document.fileName);

        let selectedText = '';
        if (!selection.isEmpty) {
            selectedText = document.getText(selection);
        }

        const content = document.getText();

        return {
            filePath: document.fileName,
            fileName: fileName,
            content: content,
            selection: selectedText || undefined,
            cursorLine: selection.active.line + 1, // 1-based index for humans
            language: document.languageId
        };
    }

    public async assemblePromptContext() {
        const logs = this.logSelector.selectLogsForAnalysis();
        const chatHistory = await this.chatExtractor.getRecentChatHistory(3);

        return {
            logs,
            chatHistory
        };
    }

    /**
     * Gathers comprehensive context for Intent Extraction (Week 2).
     */
    public async getIntentContext() {
        const logs = this.logSelector.selectLogsForAnalysis();
        const chatHistory = await this.chatExtractor.getRecentChatHistory(5);
        // TBD: File changes from ChangeTracker

        return {
            logs,
            chatHistory: chatHistory.join('\n---\n'),
            fileContext: this.getCurrentContext()
        };
    }
}
