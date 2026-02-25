import { OverlayConnector } from './OverlayConnector';

export interface HTTPRequestOptions {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
    queryParams?: Record<string, string>;
    timeoutMs?: number;
}

export interface HTTPResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: any;
    responseTimeMs: number;
    timedOut: boolean;
    error?: string;
}

export class HTTPExecutor {
    constructor(private connector: OverlayConnector) { }

    public async executeRequest(options: HTTPRequestOptions): Promise<HTTPResponse> {
        const startTime = Date.now();
        const timeout = options.timeoutMs || 10000; // default 10s for API requests
        let timedOut = false;

        // Build full URL with query params
        let urlObj: URL;
        try {
            urlObj = new URL(options.url);
            if (options.queryParams) {
                for (const [key, value] of Object.entries(options.queryParams)) {
                    urlObj.searchParams.append(key, value);
                }
            }
        } catch (e: any) {
            this.connector.sendLog({
                id: Date.now().toString() + Math.random().toString(),
                timestamp: new Date().toISOString(),
                source: 'system',
                level: 'error',
                content: `Invalid URL: ${options.url}`
            });
            return {
                status: 0,
                statusText: 'Invalid URL',
                headers: {},
                data: null,
                responseTimeMs: Date.now() - startTime,
                timedOut: false,
                error: e.message
            };
        }

        const urlString = urlObj.toString();
        const method = options.method.toUpperCase();

        this.connector.sendLog({
            id: Date.now().toString() + Math.random().toString(),
            timestamp: new Date().toISOString(),
            source: 'system',
            level: 'info',
            content: `> HTTP ${method} ${urlString}`
        });

        // Prepare fetch options
        const fetchOptions: RequestInit = {
            method,
            headers: options.headers || {},
        };

        if (options.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
            if (typeof options.body === 'object') {
                fetchOptions.body = JSON.stringify(options.body);
                if (!fetchOptions.headers) fetchOptions.headers = {};
                (fetchOptions.headers as any)['Content-Type'] = 'application/json';
            } else {
                fetchOptions.body = options.body.toString();
            }
        }

        // Timeout implementation via AbortController
        const controller = new AbortController();
        fetchOptions.signal = controller.signal;

        const timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeout);

        try {
            const response = await fetch(urlString, fetchOptions);
            clearTimeout(timeoutId);

            const endTime = Date.now();
            const responseTimeMs = endTime - startTime;

            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            let responseData: any;
            const text = await response.text();
            try {
                responseData = JSON.parse(text);
            } catch {
                responseData = text;
            }

            this.connector.sendLog({
                id: Date.now().toString() + Math.random().toString(),
                timestamp: new Date().toISOString(),
                source: 'stdout',
                level: response.ok ? 'info' : 'warn',
                content: `Response: ${response.status} ${response.statusText} (${responseTimeMs}ms)\n${typeof responseData === 'object' ? JSON.stringify(responseData, null, 2) : responseData}`
            });

            return {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                data: responseData,
                responseTimeMs,
                timedOut: false
            };

        } catch (err: any) {
            clearTimeout(timeoutId);
            const responseTimeMs = Date.now() - startTime;

            if (err.name === 'AbortError' || timedOut) {
                this.connector.sendLog({
                    id: Date.now().toString() + Math.random().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'stderr',
                    level: 'error',
                    content: `Request Timed Out after ${timeout}ms`
                });

                return {
                    status: 408,
                    statusText: 'Request Timeout',
                    headers: {},
                    data: null,
                    responseTimeMs,
                    timedOut: true,
                    error: 'Request Timeout'
                };
            } else {
                this.connector.sendLog({
                    id: Date.now().toString() + Math.random().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'stderr',
                    level: 'error',
                    content: `Request Failed: ${err.message}`
                });

                return {
                    status: 0,
                    statusText: 'Network Error',
                    headers: {},
                    data: null,
                    responseTimeMs,
                    timedOut: false,
                    error: err.message
                };
            }
        }
    }

    /**
     * Executes a chain of API requests. Stop if a request fails.
     */
    public async executeChain(requests: HTTPRequestOptions[]): Promise<{ success: boolean; results: HTTPResponse[] }> {
        const results: HTTPResponse[] = [];

        for (const req of requests) {
            const result = await this.executeRequest(req);
            results.push(result);

            // Abort chain on >= 400 or network error
            if (result.status >= 400 || result.status === 0) {
                this.connector.sendLog({
                    id: Date.now().toString() + Math.random().toString(),
                    timestamp: new Date().toISOString(),
                    source: 'system',
                    level: 'error',
                    content: `API Chain aborted. "${req.method} ${req.url}" failed with status ${result.status}.`
                });
                return { success: false, results };
            }
        }

        return { success: true, results };
    }
}
