import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';

export function Settings() {
  const [settings, setSettings] = useState({
    autoExtract: true,
    autoGenerate: false,
    autoRun: false,
    idePath: '/path/to/ide',
    logPath: '/var/log/ide',
    testTimeout: '30',
    maxRetries: '3',
    verboseLogging: true,
    captureScreenshots: true,
    apiEndpoint: 'http://localhost:3000',
    webhookUrl: '',
    testFramework: 'jest',
    reportFormat: 'json'
  });

  const handleSave = () => {
    toast.success('Settings saved');
  };

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <ScrollArea className="h-[calc(100vh-80px)]">
      <div className="p-3 space-y-3">
        <div>
          <h2 className="text-sm font-medium">Settings</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            Configure VibeShield behavior
          </p>
        </div>

        {/* Automation Settings */}
        <Card className="bg-zinc-900/30 border-zinc-800/50 p-3">
          <p className="text-xs font-medium mb-3 text-zinc-300">Automation</p>
          <div className="space-y-3">
            <SettingSwitch
              label="Auto-extract Intent"
              description="Extract intent on code changes"
              checked={settings.autoExtract}
              onCheckedChange={(checked) => updateSetting('autoExtract', checked)}
            />
            <SettingSwitch
              label="Auto-generate Tests"
              description="Generate tests after extraction"
              checked={settings.autoGenerate}
              onCheckedChange={(checked) => updateSetting('autoGenerate', checked)}
            />
            <SettingSwitch
              label="Auto-run Tests"
              description="Run tests after generation"
              checked={settings.autoRun}
              onCheckedChange={(checked) => updateSetting('autoRun', checked)}
            />
          </div>
        </Card>

        {/* IDE Integration */}
        <Card className="bg-zinc-900/30 border-zinc-800/50 p-3">
          <p className="text-xs font-medium mb-3 text-zinc-300">IDE Integration</p>
          <div className="space-y-3">
            <div>
              <Label htmlFor="idePath" className="text-[10px] text-zinc-400">IDE Path</Label>
              <Input
                id="idePath"
                value={settings.idePath}
                onChange={(e) => updateSetting('idePath', e.target.value)}
                className="bg-zinc-800 border-zinc-700 mt-1 h-7 text-xs"
                placeholder="/path/to/ide"
              />
            </div>
            <div>
              <Label htmlFor="logPath" className="text-[10px] text-zinc-400">Log Path</Label>
              <Input
                id="logPath"
                value={settings.logPath}
                onChange={(e) => updateSetting('logPath', e.target.value)}
                className="bg-zinc-800 border-zinc-700 mt-1 h-7 text-xs"
                placeholder="/var/log/ide"
              />
            </div>
          </div>
        </Card>

        {/* Test Execution */}
        <Card className="bg-zinc-900/30 border-zinc-800/50 p-3">
          <p className="text-xs font-medium mb-3 text-zinc-300">Test Execution</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="testTimeout" className="text-[10px] text-zinc-400">Timeout (sec)</Label>
                <Input
                  id="testTimeout"
                  type="number"
                  value={settings.testTimeout}
                  onChange={(e) => updateSetting('testTimeout', e.target.value)}
                  className="bg-zinc-800 border-zinc-700 mt-1 h-7 text-xs"
                />
              </div>
              <div>
                <Label htmlFor="maxRetries" className="text-[10px] text-zinc-400">Max Retries</Label>
                <Input
                  id="maxRetries"
                  type="number"
                  value={settings.maxRetries}
                  onChange={(e) => updateSetting('maxRetries', e.target.value)}
                  className="bg-zinc-800 border-zinc-700 mt-1 h-7 text-xs"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="testFramework" className="text-[10px] text-zinc-400">Test Framework</Label>
              <Select value={settings.testFramework} onValueChange={(value) => updateSetting('testFramework', value)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jest">Jest</SelectItem>
                  <SelectItem value="vitest">Vitest</SelectItem>
                  <SelectItem value="mocha">Mocha</SelectItem>
                  <SelectItem value="playwright">Playwright</SelectItem>
                  <SelectItem value="cypress">Cypress</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="reportFormat" className="text-[10px] text-zinc-400">Report Format</Label>
              <Select value={settings.reportFormat} onValueChange={(value) => updateSetting('reportFormat', value)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 mt-1 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="html">HTML</SelectItem>
                  <SelectItem value="xml">XML</SelectItem>
                  <SelectItem value="markdown">Markdown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-zinc-800/50" />

            <SettingSwitch
              label="Verbose Logging"
              description="Detailed logs for debugging"
              checked={settings.verboseLogging}
              onCheckedChange={(checked) => updateSetting('verboseLogging', checked)}
            />
            <SettingSwitch
              label="Capture Screenshots"
              description="Screenshot during execution"
              checked={settings.captureScreenshots}
              onCheckedChange={(checked) => updateSetting('captureScreenshots', checked)}
            />
          </div>
        </Card>

        {/* API & Webhooks */}
        <Card className="bg-zinc-900/30 border-zinc-800/50 p-3">
          <p className="text-xs font-medium mb-3 text-zinc-300">API & Webhooks</p>
          <div className="space-y-3">
            <div>
              <Label htmlFor="apiEndpoint" className="text-[10px] text-zinc-400">API Endpoint</Label>
              <Input
                id="apiEndpoint"
                value={settings.apiEndpoint}
                onChange={(e) => updateSetting('apiEndpoint', e.target.value)}
                className="bg-zinc-800 border-zinc-700 mt-1 h-7 text-xs"
                placeholder="http://localhost:3000"
              />
            </div>
            <div>
              <Label htmlFor="webhookUrl" className="text-[10px] text-zinc-400">Webhook URL (Optional)</Label>
              <Input
                id="webhookUrl"
                value={settings.webhookUrl}
                onChange={(e) => updateSetting('webhookUrl', e.target.value)}
                className="bg-zinc-800 border-zinc-700 mt-1 h-7 text-xs"
                placeholder="https://webhook-url.com"
              />
            </div>
          </div>
        </Card>

        {/* Save Button */}
        <Button onClick={handleSave} size="sm" className="w-full h-7 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
          <Save className="size-3 mr-1" />
          Save Settings
        </Button>
      </div>
    </ScrollArea>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  onCheckedChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5 flex-1">
        <Label className="text-xs text-zinc-300">{label}</Label>
        <p className="text-[10px] text-zinc-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} className="scale-75" />
    </div>
  );
}