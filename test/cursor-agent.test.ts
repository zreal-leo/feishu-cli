import assert from 'node:assert/strict';
import { basename, isAbsolute, sep } from 'node:path';
import { describe, it } from 'node:test';

import { ensureCursorRipgrepPath, getCursorSdkPlatformPackageName, getRipgrepExecutableName } from '../src/cursor-agent.js';

describe('getCursorSdkPlatformPackageName', () => {
    it('maps supported platforms to the SDK binary package', () => {
        assert.equal(getCursorSdkPlatformPackageName('win32', 'x64'), '@cursor/sdk-win32-x64');
        assert.equal(getCursorSdkPlatformPackageName('linux', 'x64'), '@cursor/sdk-linux-x64');
        assert.equal(getCursorSdkPlatformPackageName('darwin', 'arm64'), '@cursor/sdk-darwin-arm64');
    });

    it('returns undefined for unsupported SDK binary platforms', () => {
        assert.equal(getCursorSdkPlatformPackageName('win32', 'arm64'), undefined);
        assert.equal(getCursorSdkPlatformPackageName('freebsd', 'x64'), undefined);
    });
});

describe('getRipgrepExecutableName', () => {
    it('uses the Windows executable name on win32', () => {
        assert.equal(getRipgrepExecutableName('win32'), 'rg.exe');
    });

    it('uses the POSIX executable name on other platforms', () => {
        assert.equal(getRipgrepExecutableName('linux'), 'rg');
        assert.equal(getRipgrepExecutableName('darwin'), 'rg');
    });
});

describe('ensureCursorRipgrepPath', () => {
    it('configures the bundled ripgrep binary when the environment is empty', () => {
        const previous = process.env.CURSOR_RIPGREP_PATH;
        delete process.env.CURSOR_RIPGREP_PATH;

        try {
            ensureCursorRipgrepPath();

            const platformPackageName = getCursorSdkPlatformPackageName();
            assert.ok(process.env.CURSOR_RIPGREP_PATH);
            assert.equal(isAbsolute(process.env.CURSOR_RIPGREP_PATH), true);
            assert.equal(basename(process.env.CURSOR_RIPGREP_PATH), getRipgrepExecutableName());
            if (platformPackageName) {
                assert.match(process.env.CURSOR_RIPGREP_PATH, new RegExp(platformPackageName.replace('/', '[+/\\\\]')));
            }
            assert.equal(process.env.CURSOR_RIPGREP_PATH.split(sep).at(-2), 'bin');
        } finally {
            if (previous === undefined) {
                delete process.env.CURSOR_RIPGREP_PATH;
            } else {
                process.env.CURSOR_RIPGREP_PATH = previous;
            }
        }
    });
});
