import { rm, mkdir, cp } from 'node:fs/promises';

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

// skill 在请求时读取，随构建产物交付才能让仅部署 dist 的机器人使用同一份规则。
await cp(new URL('../.agents/skills/crazy-thursday/', import.meta.url), new URL('../dist/skills/crazy-thursday/', import.meta.url), { recursive: true });
