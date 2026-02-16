// 1. Mock VS Code API
const listeners: any = {};
let activeEditor: any = null;

const vscode = {
    window: {
        get activeTextEditor() { return activeEditor; }
    },
    Range: class { },
    Selection: class { }
};

// 2. Mock require
import module from 'module';
const originalRequire = module.prototype.require;
// @ts-ignore
module.prototype.require = function (path: string) {
    if (path === 'vscode') return vscode;
    // @ts-ignore
    return originalRequire.apply(this, arguments);
};

// 3. Import ContextExtractor
import { ContextExtractor } from './src/services/ContextExtractor';

async function testContextExtraction() {
    console.log('--- Testing Context Extraction ---');

    const extractor = new ContextExtractor();

    // TEST 1: No file open
    console.log('\nTest 1: No file open');
    activeEditor = null;
    let context = extractor.getCurrentContext();
    if (context === null) {
        console.log('✅ Correctly handled no active editor');
    } else {
        console.error('❌ Failed: Should return null');
    }

    // TEST 2: File open, no selection
    console.log('\nTest 2: File open (main.ts), cursor at line 10');
    activeEditor = {
        document: {
            fileName: '/users/dev/project/main.ts',
            languageId: 'typescript',
            getText: (range?: any) => range ? 'selected_code' : 'full_file_content'
        },
        selection: {
            isEmpty: true,
            active: { line: 9 } // 0-indexed
        }
    };

    context = extractor.getCurrentContext();
    if (context && context.fileName === 'main.ts' && context.cursorLine === 10) {
        console.log('✅ Correctly extracted file info');
        console.log(`   File: ${context.fileName}`);
        console.log(`   Cursor: Line ${context.cursorLine}`);
        console.log(`   Content: ${context.content}`);
    } else {
        console.error('❌ Failed to extract context');
    }

    // TEST 3: With Selection
    console.log('\nTest 3: Text Selected');
    activeEditor.selection.isEmpty = false;
    // Mock getText to return specific string when selection passed
    activeEditor.document.getText = (selection: any) => {
        return selection ? 'const x = 1;' : 'full_file_content';
    };

    context = extractor.getCurrentContext();
    if (context && context.selection === 'const x = 1;') {
        console.log('✅ Correctly extracted selection');
        console.log(`   Selection: "${context.selection}"`);
    } else {
        console.error('❌ Failed to extract selection');
    }

    console.log('\n--- Test Complete ---');
}

testContextExtraction().catch(console.error);
