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

                    vscode.window.showInformationMessage(
                        'VibeShield: Thinking about ' +
                        (extractedContext ? extractedContext.fileName : 'global context') +
                        '...'
                    );

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

    public isViewReady(): boolean {
        return !!this._view;
    }

    public sendSystemMessage(content: string, type: 'info' | 'error' = 'info'): boolean {
        if (this._view) {
            this._view.webview.postMessage({ type: 'systemMessage', content, level: type });
            return true;
        }
        return false;
    }

    private _getHtmlForWebview(_webview: vscode.Webview) {
        // Build HTML as a regular string to avoid template literal escaping issues
        const html = [
            '<!DOCTYPE html>',
            '<html lang="en">',
            '<head>',
            '  <meta charset="UTF-8">',
            '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '  <title>VibeShield Chat</title>',
            '  <style>',
            '    body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-editor-foreground); }',
            '    .chat-container { display: flex; flex-direction: column; height: 100vh; }',
            '    .messages { flex: 1; overflow-y: auto; margin-bottom: 10px; border: 1px solid var(--vscode-widget-border); padding: 5px; }',
            '    .input-area { display: flex; gap: 5px; }',
            '    input { flex: 1; padding: 5px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }',
            '    button { padding: 5px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; }',
            '    button:hover { background: var(--vscode-button-hoverBackground); }',
            '    .msg-system {',
            '      font-style: italic;',
            '      margin: 5px 0;',
            '      padding: 8px;',
            '      border-left: 3px solid var(--vscode-textBlockQuote-border);',
            '      background: var(--vscode-textBlockQuote-background);',
            '      line-height: 1.4;',
            '    }',
            '    .msg-error {',
            '      border-left-color: var(--vscode-errorForeground);',
            '      color: var(--vscode-errorForeground);',
            '    }',
            '    .msg-user {',
            '      text-align: right;',
            '      margin: 5px 0;',
            '      font-weight: bold;',
            '    }',
            '    .msg-info {',
            '      border-left-color: var(--vscode-charts-blue);',
            '      color: var(--vscode-editor-foreground);',
            '    }',
            '  </style>',
            '</head>',
            '<body>',
            '  <div class="chat-container">',
            '    <div class="messages" id="messages">',
            '      <div style="opacity: 0.7; font-style: italic; margin-bottom: 10px;">Welcome to VibeShield.</div>',
            '    </div>',
            '    <div class="input-area">',
            '      <input type="text" id="chatInput" placeholder="Ask VibeShield..." />',
            '      <button id="sendBtn">Send</button>',
            '    </div>',
            '  </div>',
            '  <script>',
            '    const vscode = acquireVsCodeApi();',
            '    const chatInput = document.getElementById("chatInput");',
            '    const sendBtn = document.getElementById("sendBtn");',
            '    const messagesEl = document.getElementById("messages");',
            '',
            '    function addMessage(text, className) {',
            '      const msgDiv = document.createElement("div");',
            '      // Simple markdown: **bold** and *italic*',
            '      var html = text;',
            '      html = html.replace(/\\*\\*([^*]+)\\*\\*/g, "<b>$1</b>");',
            '      html = html.replace(/\\*([^*]+)\\*/g, "<i>$1</i>");',
            '      html = html.replace(/\\n/g, "<br>");',
            '      msgDiv.innerHTML = html;',
            '      if (className) msgDiv.className = className;',
            '      messagesEl.appendChild(msgDiv);',
            '      messagesEl.scrollTop = messagesEl.scrollHeight;',
            '    }',
            '',
            '    window.addEventListener("message", function(event) {',
            '      var message = event.data;',
            '      if (message.type === "systemMessage") {',
            '        var cls = message.level === "error" ? "msg-system msg-error" : "msg-system msg-info";',
            '        addMessage(message.content, cls);',
            '      }',
            '    });',
            '',
            '    function sendMessage() {',
            '      var text = chatInput.value;',
            '      if (text) {',
            '        vscode.postMessage({ type: "sendMessage", value: text });',
            '        addMessage(text, "msg-user");',
            '        chatInput.value = "";',
            '      }',
            '    }',
            '',
            '    sendBtn.addEventListener("click", sendMessage);',
            '    chatInput.addEventListener("keypress", function(e) {',
            '      if (e.key === "Enter") sendMessage();',
            '    });',
            '  </script>',
            '</body>',
            '</html>',
        ].join('\n');

        return html;
    }
}
