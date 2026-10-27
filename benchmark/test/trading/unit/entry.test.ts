import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tradingCommands } from '../../../src/trading/cli.js';
test('trading stays separate from browser commands', () => assert.deepEqual(tradingCommands, ['setup', 'migrate', 'serve', 'generate', 'import']));
