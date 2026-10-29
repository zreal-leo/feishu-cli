import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CrazyThursdaySkill } from '../core/crazy-thursday.ts';
import type { CrazyThursdaySkillProvider } from '../ports/crazy-thursday-skill.ts';

export function createFileSystemCrazyThursdaySkillProvider(options: { directory?: string } = {}): CrazyThursdaySkillProvider {
    // 打包后模块位于 dist/index.js；开发时则从源文件定位共享 skill，避免依赖启动目录。
    const directories = options.directory ? [options.directory] : [fileURLToPath(new URL('./skills/crazy-thursday/', import.meta.url)), fileURLToPath(new URL('../../.agents/skills/crazy-thursday/', import.meta.url))];

    return {
        async load() {
            let missingFileError: unknown;
            for (const directory of directories) {
                try {
                    return await readSkill(directory);
                } catch (error) {
                    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
                        throw error;
                    }
                    missingFileError = error;
                }
            }

            throw missingFileError;
        }
    };
}

async function readSkill(directory: string): Promise<CrazyThursdaySkill> {
    const [instructions, examples] = await Promise.all([readFile(join(directory, 'SKILL.md'), 'utf8'), readFile(join(directory, 'references', 'examples.md'), 'utf8')]);
    if (!instructions.trim() || !examples.trim()) {
        throw new Error('Crazy Thursday skill instructions and examples must not be empty.');
    }

    return { instructions, examples };
}
