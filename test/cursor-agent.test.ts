import assert from 'node:assert/strict';
import { basename, isAbsolute } from 'node:path';
import { describe, it } from 'node:test';

import { ensureCursorRipgrepPath } from '../src/cursor-agent.js';

describe('ensureCursorRipgrepPath', () => {
    it('configures the bundled ripgrep binary when the environment is empty', () => {
        const previous = process.env.CURSOR_RIPGREP_PATH;
        delete process.env.CURSOR_RIPGREP_PATH;

        try {
            ensureCursorRipgrepPath();

            assert.ok(process.env.CURSOR_RIPGREP_PATH);
            assert.equal(isAbsolute(process.env.CURSOR_RIPGREP_PATH), true);
            assert.equal(basename(process.env.CURSOR_RIPGREP_PATH), 'rg');
        } finally {
            if (previous === undefined) {
                delete process.env.CURSOR_RIPGREP_PATH;
            } else {
                process.env.CURSOR_RIPGREP_PATH = previous;
            }
        }
    });
});
