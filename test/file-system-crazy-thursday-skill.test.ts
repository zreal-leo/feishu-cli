import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { createFileSystemCrazyThursdaySkillProvider } from '../src/adapters/file-system-crazy-thursday-skill.ts';

describe('createFileSystemCrazyThursdaySkillProvider', () => {
    it('loads the shared skill and its original examples without a configured directory', async () => {
        const provider = createFileSystemCrazyThursdaySkillProvider();
        const skill = await provider.load();

        assert.equal(skill.instructions, await readFile(new URL('../.agents/skills/crazy-thursday/SKILL.md', import.meta.url), 'utf8'));
        assert.equal(skill.examples, await readFile(new URL('../.agents/skills/crazy-thursday/references/examples.md', import.meta.url), 'utf8'));
    });

    it('uses updated files on the next request', async context => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-crazy-thursday-'));
        context.after(() => rm(directory, { recursive: true, force: true }));
        await mkdir(join(directory, 'references'));
        await writeFile(join(directory, 'SKILL.md'), '第一版写作规则', 'utf8');
        await writeFile(join(directory, 'references', 'examples.md'), '第一版原创示例', 'utf8');
        const provider = createFileSystemCrazyThursdaySkillProvider({ directory });

        assert.deepEqual(await provider.load(), { instructions: '第一版写作规则', examples: '第一版原创示例' });

        await writeFile(join(directory, 'SKILL.md'), '更新后的写作规则', 'utf8');
        assert.deepEqual(await provider.load(), { instructions: '更新后的写作规则', examples: '第一版原创示例' });
    });

    it('rejects a skill with missing examples instead of silently dropping the reference', async context => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-crazy-thursday-'));
        context.after(() => rm(directory, { recursive: true, force: true }));
        await writeFile(join(directory, 'SKILL.md'), '写作规则', 'utf8');

        await assert.rejects(createFileSystemCrazyThursdaySkillProvider({ directory }).load(), { code: 'ENOENT' });
    });

    it('rejects empty writing instructions', async context => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-crazy-thursday-'));
        context.after(() => rm(directory, { recursive: true, force: true }));
        await mkdir(join(directory, 'references'));
        await writeFile(join(directory, 'SKILL.md'), '\n ', 'utf8');
        await writeFile(join(directory, 'references', 'examples.md'), '原创示例', 'utf8');

        await assert.rejects(createFileSystemCrazyThursdaySkillProvider({ directory }).load(), /must not be empty/);
    });
});
