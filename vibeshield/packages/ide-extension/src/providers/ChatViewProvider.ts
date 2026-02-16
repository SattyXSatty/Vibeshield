import * as vscode from 'vscode';
import { OverlayConnector } from '../services/OverlayConnector';

import { ContextExtractor } from '../services/ContextExtractor';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vibeshield.chat';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private connector: OverlayConnector,
        private contextExtractor: ContextExtractor
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'sendMessage': {
                    const extractedContext = this.contextExtractor.getCurrentContext();

                    vscode.window.showInformationMessage(`VibeShield: Thinking about ${extractedContext ? extractedContext.fileName : 'global context'}...`);

                    // Forward to Overlay as a real 'chat_message' now
                    this.connector.sendMessageToOverlay({
                        type: 'chat_message',
                        timestamp: new Date().toISOString(),
                        payload: {
                            id: Date.now().toString(),
                            role: 'user',
                            content: data.value,
                            context: extractedContext || undefined
                        }
                    } as any);
                    break;
                }
            }
        });
    }

    public sendSystemMessage(content: string, type: 'info' | 'error' = 'info') {
        if (this._view) {
            this._view.webview.postMessage({ type: 'systemMessage', content, level: type });
        }
    }

    private _getHtmlForWebview(_webview: vscode.Webview) {
        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>VibeShield Chat</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-editor-foreground); }
                    .chat-container { display: flex; flex-direction: column; height: 100vh; }
                    .messages { flex: 1; overflow-y: auto; margin-bottom: 10px; border: 1px solid var(--vscode-widget-border); padding: 5px; }
                    .input-area { display: flex; gap: 5px; }
                    input { flex: 1; padding: 5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
                    button { padding: 5px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                    
                    .msg-system { 
                        font-style: italic; 
                        margin: 5px 0; 
                        padding: 5px; 
                        border-left: 3px solid var(--vscode-textBlockQuote-border);
                        background: var(--vscode-textBlockQuote-background);
                    }
                    .msg-error {
                        border-left-color: var(--vscode-errorForeground);
                        color: var(--vscode-errorForeground);
                    }
                    .msg-user {
                        text-align: right;
                        margin: 5px 0;
                        font-weight: bold;
                    }
                </style>
			</head>
			<body>
				<div class="chat-container">
                    <div class="messages" id="messages">
                        <div style="opacity: 0.7; font-style: italic; margin-bottom: 10px;">Welcome to VibeShield.</div>
                    </div>
                    <div class="input-area">
                        <input type="text" id="chatInput" placeholder="Ask VibeShield..." />
                        <button id="sendBtn">Send</button>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const input = document.getElementById('chatInput');
                    const sendBtn = document.getElementById('sendBtn');
                    const messagesElement = document.getElementById('messages');

                    function addMessage(text, className) {
                        const msgDiv = document.createElement('div');
                        msgDiv.textContent = text;
                        if(className) msgDiv.className = className;
                        messagesElement.appendChild(msgDiv);
                        messagesElement.scrollTop = messagesElement.scrollHeight;
                    }

                    // Handle messages from the extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'systemMessage':
                                const cls = message.level === 'error' ? 'msg-system msg-error' : 'msg-system';
                                addMessage(message.content, cls);
                                break;
                        }
                    });

                    function sendMessage() {
                        const text = input.value;
                        if (text) {
                            vscode.postMessage({ type: 'sendMessage', value: text });
                            addMessage(text, 'msg-user');
                            input.value = '';
                        }
                    }

                    sendBtn.addEventListener('click', sendMessage);
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') sendMessage();
                    });
                </script>
			</body>
			</html>`;
    }
}
