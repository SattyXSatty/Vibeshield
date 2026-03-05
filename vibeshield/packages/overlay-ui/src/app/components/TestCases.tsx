import { useState } from 'react';
import { Plus, Edit2, Trash2, Save, X, PlayCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';

type TestCase = {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  steps: string[];
};

const initialTestCases: TestCase[] = [
  {
    id: '1',
    title: 'Verify Email Validation',
    description: 'Test that the email field validates correct and incorrect email formats',
    status: 'passed',
    steps: [
      'Navigate to signup page',
      'Enter invalid email format',
      'Verify error message displays',
      'Enter valid email format',
      'Verify no error message'
    ]
  },
  {
    id: '2',
    title: 'Test Password Requirements',
    description: 'Ensure password meets minimum security requirements',
    status: 'passed',
    steps: [
      'Enter password with less than 8 characters',
      'Verify error message',
      'Enter password without special character',
      'Verify error message',
      'Enter valid password',
      'Verify acceptance'
    ]
  },
  {
    id: '3',
    title: 'Successful Login Flow',
    description: 'Verify complete login workflow with valid credentials',
    status: 'pending',
    steps: [
      'Enter valid email',
      'Enter valid password',
      'Click login button',
      'Verify redirect to dashboard',
      'Verify user session created'
    ]
  }
];

export function TestCases() {
  const [testCases, setTestCases] = useState<TestCase[]>(initialTestCases);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newTest, setNewTest] = useState({ title: '', description: '', steps: '' });

  const handleEdit = (id: string) => {
    setEditingId(id);
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    setTestCases(prev => prev.filter(tc => tc.id !== id));
    toast.success('Test deleted');
  };

  const handleSave = (id: string, updates: Partial<TestCase>) => {
    setTestCases(prev =>
      prev.map(tc => (tc.id === id ? { ...tc, ...updates } : tc))
    );
    setEditingId(null);
    toast.success('Test updated');
  };

  const handleAddNew = () => {
    if (!newTest.title.trim()) {
      toast.error('Enter test title');
      return;
    }

    const newTestCase: TestCase = {
      id: Date.now().toString(),
      title: newTest.title,
      description: newTest.description,
      status: 'pending',
      steps: newTest.steps.split('\n').filter(s => s.trim())
    };

    setTestCases(prev => [...prev, newTestCase]);
    setNewTest({ title: '', description: '', steps: '' });
    setIsAdding(false);
    toast.success('Test added');
  };

  const handleRunTest = (id: string) => {
    setTestCases(prev =>
      prev.map(tc => (tc.id === id ? { ...tc, status: 'running' } : tc))
    );

    // Simulate test run
    setTimeout(() => {
      setTestCases(prev =>
        prev.map(tc => (tc.id === id ? { ...tc, status: Math.random() > 0.3 ? 'passed' : 'failed' } : tc))
      );
    }, 2000);
  };

  const handleRunAll = () => {
    toast.info('Running tests...');
    testCases.forEach((tc, index) => {
      setTimeout(() => handleRunTest(tc.id), index * 500);
    });
  };

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">Test Cases</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            {testCases.length} tests · {testCases.filter(tc => tc.status === 'passed').length} passed
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            onClick={handleRunAll}
            size="sm"
            className="h-6 text-[10px] px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          >
            <PlayCircle className="size-3 mr-1" />
            Run All
          </Button>
          <Button
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
            }}
            size="sm"
            className="h-6 text-[10px] px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
          >
            <Plus className="size-3 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Add New Test Form */}
      {isAdding && (
        <Card className="bg-zinc-900/30 border-zinc-800/50 p-3">
          <p className="text-xs font-medium mb-2">New Test</p>
          <div className="space-y-2">
            <Input
              value={newTest.title}
              onChange={(e) => setNewTest(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Test title..."
              className="bg-zinc-800 border-zinc-700 h-7 text-xs"
            />
            <Textarea
              value={newTest.description}
              onChange={(e) => setNewTest(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description..."
              className="bg-zinc-800 border-zinc-700 text-xs min-h-16"
            />
            <Textarea
              value={newTest.steps}
              onChange={(e) => setNewTest(prev => ({ ...prev, steps: e.target.value }))}
              placeholder="Steps (one per line)..."
              className="bg-zinc-800 border-zinc-700 text-xs min-h-20"
            />
            <div className="flex gap-1">
              <Button onClick={handleAddNew} size="sm" className="h-6 text-[10px] px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300">
                <Save className="size-3 mr-1" />
                Save
              </Button>
              <Button
                onClick={() => {
                  setIsAdding(false);
                  setNewTest({ title: '', description: '', steps: '' });
                }}
                size="sm"
                className="h-6 text-[10px] px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >
                <X className="size-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Test Cases List */}
      <ScrollArea className="h-[calc(100vh-180px)]">
        <div className="space-y-2">
          {testCases.map((testCase) => (
            <TestCaseCard
              key={testCase.id}
              testCase={testCase}
              isEditing={editingId === testCase.id}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSave={handleSave}
              onRun={handleRunTest}
              onCancel={() => setEditingId(null)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function TestCaseCard({
  testCase,
  isEditing,
  onEdit,
  onDelete,
  onSave,
  onRun,
  onCancel
}: {
  testCase: TestCase;
  isEditing: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (id: string, updates: Partial<TestCase>) => void;
  onRun: (id: string) => void;
  onCancel: () => void;
}) {
  const [editData, setEditData] = useState({
    title: testCase.title,
    description: testCase.description,
    steps: testCase.steps.join('\n')
  });

  const getStatusIndicator = () => {
    switch (testCase.status) {
      case 'passed': return <span className="size-1.5 rounded-full bg-green-500" />;
      case 'failed': return <span className="size-1.5 rounded-full bg-red-500" />;
      case 'running': return <span className="size-1.5 rounded-full bg-blue-400 animate-pulse" />;
      default: return <span className="size-1.5 rounded-full bg-zinc-700" />;
    }
  };

  if (isEditing) {
    return (
      <Card className="bg-zinc-900/30 border-zinc-800/50 p-3">
        <div className="space-y-2">
          <Input
            value={editData.title}
            onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
            className="bg-zinc-800 border-zinc-700 h-7 text-xs"
          />
          <Textarea
            value={editData.description}
            onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
            className="bg-zinc-800 border-zinc-700 text-xs min-h-16"
          />
          <Textarea
            value={editData.steps}
            onChange={(e) => setEditData(prev => ({ ...prev, steps: e.target.value }))}
            className="bg-zinc-800 border-zinc-700 text-xs min-h-20"
          />
          <div className="flex gap-1">
            <Button
              onClick={() => onSave(testCase.id, {
                title: editData.title,
                description: editData.description,
                steps: editData.steps.split('\n').filter(s => s.trim())
              })}
              size="sm"
              className="h-6 text-[10px] px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              <Save className="size-3 mr-1" />
              Save
            </Button>
            <Button
              onClick={onCancel}
              size="sm"
              className="h-6 text-[10px] px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              <X className="size-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/30 border-zinc-800/50 p-3 hover:border-zinc-700/50 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIndicator()}
            <h3 className="text-xs font-medium text-zinc-300">{testCase.title}</h3>
          </div>
          <p className="text-[10px] text-zinc-500">{testCase.description}</p>
        </div>
        <div className="flex gap-1">
          <Button
            onClick={() => onRun(testCase.id)}
            size="sm"
            className="h-5 w-5 p-0 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400"
            disabled={testCase.status === 'running'}
          >
            <PlayCircle className="size-3" />
          </Button>
          <Button
            onClick={() => onEdit(testCase.id)}
            size="sm"
            className="h-5 w-5 p-0 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400"
          >
            <Edit2 className="size-3" />
          </Button>
          <Button
            onClick={() => onDelete(testCase.id)}
            size="sm"
            className="h-5 w-5 p-0 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {testCase.steps.length > 0 && (
        <div className="mt-2 pt-2 border-t border-zinc-800/50">
          <p className="text-[9px] text-zinc-600 mb-1 uppercase tracking-wide">Steps</p>
          <ol className="space-y-0.5 list-decimal list-inside">
            {testCase.steps.map((step, index) => (
              <li key={index} className="text-[10px] text-zinc-500">
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}