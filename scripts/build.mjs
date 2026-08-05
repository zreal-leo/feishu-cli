import { spawnSync } from 'node:child_process';
import { rm, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { build } from 'esbuild';

const require = createRequire(import.meta.url);

function runTypeCheck() {
    const typescriptRoot = dirname(require.resolve('typescript/package.json'));
    const tscBin = join(typescriptRoot, 'bin', 'tsc');
    const result = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.build.json', '--noEmit'], {
        stdio: 'inherit'
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
runTypeCheck();

await build({
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    packages: 'external',
    minify: true,
    treeShaking: true,
    legalComments: 'none',
    sourcemap: false,
    sourcesContent: false,
    logLevel: 'info'
});
