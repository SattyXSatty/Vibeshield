import { useState, useEffect } from 'react';
import { useAgentStore } from '../../store/useAgentStore';
import toast from 'react-hot-toast';
import './SettingsView.css';

export function SettingsView() {
    const { settings, autoModeConfig, setAutoModeConfig } = useAgentStore();

    // VibeShield Required Config
    const [apiKey, setApiKey] = useState(settings?.apiKey || '');
    const [defaultTestUrl, setDefaultTestUrl] = useState(settings?.defaultTestUrl || '');
    const [headless, setHeadless] = useState(settings?.headless ?? true);

    // Automation Config
    const [preflightCommand, setPreflightCommand] = useState(autoModeConfig?.preflightCommand || '');
    const [autoExtract, setAutoExtract] = useState(autoModeConfig?.autoExtract ?? true);
    const [autoGenerate, setAutoGenerate] = useState(autoModeConfig?.autoGenerate ?? true);
    const [autoRun, setAutoRun] = useState(autoModeConfig?.autoRun ?? false);

    // Fetch config on mount
    useEffect(() => {
        if (!settings) {
            if ((window as any).electronAPI) {
                (window as any).electronAPI.sendMessage({ type: 'command', timestamp: new Date().toISOString(), payload: { action: 'get_settings' } } as any);
            }
        } else {
            setApiKey(settings.apiKey || '');
            setDefaultTestUrl(settings.defaultTestUrl || '');
            setHeadless(settings.headless ?? true);
        }

        // Sync local form state if autoModeConfig updates from store elsewhere
        setPreflightCommand(autoModeConfig?.preflightCommand || '');
        setAutoExtract(autoModeConfig?.autoExtract ?? true);
        setAutoGenerate(autoModeConfig?.autoGenerate ?? true);
        setAutoRun(autoModeConfig?.autoRun ?? false);
    }, [settings, autoModeConfig]);

    const handleSave = () => {
        // Save VS Code settings
        if ((window as any).electronAPI) {
            (window as any).electronAPI.sendMessage({
                type: 'command',
                timestamp: new Date().toISOString(),
                payload: {
                    action: 'update_settings',
                    settings: { apiKey, defaultTestUrl, headless }
                }
            } as any);
        }

        // Save local UI Automation Settings
        setAutoModeConfig({
            preflightCommand,
            autoExtract,
            autoGenerate,
            autoRun
        });

        toast.success('Settings saved successfully', { position: 'bottom-center' });
    };

    return (
        <div className="settings-container">
            <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2>Settings</h2>
                    <span className="settings-subtitle">Configure VibeShield behavior</span>
                </div>
                <button
                    onClick={handleSave}
                    style={{ backgroundColor: 'var(--color-bg-hover)', color: 'var(--color-text-bright)', padding: '8px 16px', borderRadius: '4px', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '13px' }}
                >
                    Save Changes
                </button>
            </div>

            {/* Automation Section */}
            <div className="settings-section">
                <h3>Automation</h3>
                <div className="settings-card">
                    <div className="settings-row">
                        <div className="settings-info">
                            <h4>Auto-extract Intent</h4>
                            <p>Extract intent on code changes</p>
                        </div>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={autoExtract} onChange={(e) => setAutoExtract(e.target.checked)} />
                            <span className="slider"></span>
                        </label>
                    </div>
                    <div className="settings-row">
                        <div className="settings-info">
                            <h4>Auto-generate Tests</h4>
                            <p>Generate tests after extraction</p>
                        </div>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} />
                            <span className="slider"></span>
                        </label>
                    </div>
                    <div className="settings-row">
                        <div className="settings-info">
                            <h4>Auto-run Tests</h4>
                            <p>Run tests after generation</p>
                        </div>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
                            <span className="slider"></span>
                        </label>
                    </div>
                    <div className="settings-row border-none input-group" style={{ paddingBottom: 0 }}>
                        <div className="input-wrap" style={{ width: '100%', marginTop: '12px' }}>
                            <label>Pre-flight Command (optional)</label>
                            <input
                                type="text"
                                placeholder="e.g. npm run build, docker-compose up -d"
                                value={preflightCommand}
                                onChange={(e) => setPreflightCommand(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* API Configuration Section */}
            <div className="settings-section">
                <h3>Agent Configuration</h3>
                <div className="settings-card input-group">
                    <div className="input-wrap">
                        <label>Gemini API Key</label>
                        <input
                            type="password"
                            placeholder="AIzaSy..."
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                        />
                    </div>
                    <div className="input-wrap">
                        <label>Default Test URL</label>
                        <input
                            type="text"
                            placeholder="http://localhost:3000"
                            value={defaultTestUrl}
                            onChange={(e) => setDefaultTestUrl(e.target.value)}
                        />
                    </div>
                    <div className="settings-row border-none" style={{ padding: '0', border: 'none', marginTop: '8px' }}>
                        <div className="settings-info">
                            <h4>Headless Mode</h4>
                            <p>Run tests invisibly in the background</p>
                        </div>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={headless} onChange={(e) => setHeadless(e.target.checked)} />
                            <span className="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

        </div >
    );
}
