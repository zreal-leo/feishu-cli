import assert from 'node:assert/strict';
import { basename, isAbsolute, sep } from 'node:path';
import { describe, it } from 'node:test';

import { ensureCursorRipgrepPath, getCursorSdkPlatformPackageName, getRipgrepExecutableName } from '../src/adapters/cursor/cursor-agent.ts';

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
            const ripgrepPath = process.env.CURSOR_RIPGREP_PATH ?? '';
            assert.notEqual(ripgrepPath, '');
            assert.equal(isAbsolute(ripgrepPath), true);
            assert.equal(basename(ripgrepPath), getRipgrepExecutableName());
            if (platformPackageName) {
                assert.equal(ripgrepPath.includes(platformPackageName) || ripgrepPath.includes(platformPackageName.replace('/', '+')), true);
            }
            assert.equal(ripgrepPath.split(sep).at(-2), 'bin');
        } finally {
            if (previous === undefined) {
                delete process.env.CURSOR_RIPGREP_PATH;
            } else {
                process.env.CURSOR_RIPGREP_PATH = previous;
            }
        }
    });
});
