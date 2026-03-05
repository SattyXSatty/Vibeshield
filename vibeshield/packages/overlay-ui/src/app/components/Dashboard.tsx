import { useState } from 'react';
import { Play, RefreshCw, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';

type Status = 'idle' | 'extracting' | 'generating' | 'running' | 'success' | 'failed';

export function Dashboard() {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [extractedIntent, setExtractedIntent] = useState('');

  const handleExtractIntent = () => {
    setStatus('extracting');
    setProgress(0);
    toast.info('Extracting intent...');

    // Simulate extraction
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setStatus('idle');
          setExtractedIntent('Verify that the user authentication feature allows users to sign up with email and password, validates input fields correctly, and redirects to dashboard on successful login.');
          toast.success('Intent extracted');
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const handleGenerateTests = () => {
    if (!extractedIntent) {
      toast.error('Extract intent first');
      return;
    }

    setStatus('generating');
    setProgress(0);
    toast.info('Generating tests...');

    // Simulate generation
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setStatus('idle');
          toast.success('Tests generated');
          return 100;
        }
        return prev + 8;
      });
    }, 200);
  };

  const handleRunTests = () => {
    if (!extractedIntent) {
      toast.error('Extract intent first');
      return;
    }

    setStatus('running');
    setProgress(0);
    toast.info('Running tests...');

    // Simulate test run
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setStatus('success');
          toast.success('Tests passed');
          return 100;
        }
        return prev + 5;
      });
    }, 250);
  };

  const getStatusText = () => {
    switch (status) {
      case 'extracting': return 'Extracting...';
      case 'generating': return 'Generating...';
      case 'running': return 'Running...';
      case 'success': return 'Passed';
      case 'failed': return 'Failed';
      default: return 'Idle';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'failed': return 'text-red-400';
      default: return 'text-zinc-300';
    }
  };

  return (
    <div className="p-3 space-y-3">
      {/* Status */}
      <Card className="bg-zinc-900/30 border-zinc-800/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-400">Status</span>
          <span className={`text-xs ${getStatusColor()}`}>{getStatusText()}</span>
        </div>
        {(status === 'extracting' || status === 'generating' || status === 'running') && (
          <Progress value={progress} className="h-1" />
        )}
      </Card>

      {/* Controls */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          onClick={handleExtractIntent}
          disabled={status !== 'idle' && status !== 'success' && status !== 'failed'}
          size="sm"
          className="h-7 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <RefreshCw className="size-3 mr-1" />
          Extract
        </Button>

        <Button
          onClick={handleGenerateTests}
          disabled={!extractedIntent || (status !== 'idle' && status !== 'success' && status !== 'failed')}
          size="sm"
          className="h-7 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <Zap className="size-3 mr-1" />
          Generate
        </Button>

        <Button
          onClick={handleRunTests}
          disabled={!extractedIntent || (status !== 'idle' && status !== 'success' && status !== 'failed')}
          size="sm"
          className="h-7 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
        >
          <Play className="size-3 mr-1" />
          Run
        </Button>
      </div>

      {/* Extracted Intent */}
      {extractedIntent && (
        <Card className="bg-zinc-900/30 border-zinc-800/50 p-3">
          <p className="text-[10px] text-zinc-500 mb-1.5 uppercase tracking-wide">Intent</p>
          <ScrollArea className="max-h-32">
            <p className="text-xs text-zinc-400 leading-relaxed">
              {extractedIntent}
            </p>
          </ScrollArea>
        </Card>
      )}

      {/* Activity Log */}
      <Card className="bg-zinc-900/30 border-zinc-800/50 p-3">
        <p className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wide">Activity</p>
        <ScrollArea className="h-48">
          <div className="space-y-2">
            {status === 'success' && (
              <ActivityItem
                title="Tests Passed"
                description="12 test cases executed"
                time="Now"
              />
            )}
            {extractedIntent && (
              <ActivityItem
                title="Intent Extracted"
                description="Parsed from IDE context"
                time="2m"
              />
            )}
            <ActivityItem
              title="Waiting"
              description="Click Extract to begin"
              time="Idle"
            />
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

function ActivityItem({
  title,
  description,
  time
}: {
  title: string;
  description: string;
  time: string;
}) {
  return (
    <div className="flex justify-between items-start p-2 rounded hover:bg-zinc-800/30 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-zinc-300">{title}</p>
        <p className="text-[10px] text-zinc-500 mt-0.5">{description}</p>
      </div>
      <span className="text-[10px] text-zinc-600 ml-2">{time}</span>
    </div>
  );
}