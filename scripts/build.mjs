import { rm, mkdir } from 'node:fs/promises';

import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

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
