import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const scriptPath = fileURLToPath(new URL('../scripts/prune-gone-branches.mjs', import.meta.url));

function git(cwd: string, args: string[]): string {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

async function commitFile(repo: string, fileName: string, content: string, message: string) {
    await writeFile(join(repo, fileName), content);
    git(repo, ['add', fileName]);
    git(repo, ['commit', '-m', message]);
}

function localBranches(repo: string): string[] {
    return git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).trim().split('\n').filter(Boolean);
}

function remoteBranchExists(repo: string, remote: string, branch: string): boolean {
    return git(repo, ['ls-remote', '--heads', remote, branch]).includes(`refs/heads/${branch}`);
}

describe('prune-gone-branches script', () => {
    it('is invoked through Node so it works in macOS and Windows npm scripts', async () => {
        const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

        assert.equal(packageJson.scripts['git:prune-branches'], 'node scripts/prune-gone-branches.mjs');
    });

    it('deletes only local gone branches that are merged into main', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'lark-cli-prune-'));
        const origin = join(directory, 'origin.git');
        const repo = join(directory, 'repo');

        git(directory, ['init', '--bare', origin]);
        git(directory, ['clone', origin, repo]);
        git(repo, ['checkout', '-b', 'main']);
        git(repo, ['config', 'user.name', 'Test User']);
        git(repo, ['config', 'user.email', 'test@example.com']);

        await commitFile(repo, 'base.txt', 'base\n', 'initial commit');
        git(repo, ['push', '-u', 'origin', 'main']);

        git(repo, ['checkout', '-b', 'merged-gone']);
        await commitFile(repo, 'merged.txt', 'merged\n', 'merged branch commit');
        git(repo, ['push', '-u', 'origin', 'merged-gone']);
        git(repo, ['checkout', 'main']);
        git(repo, ['merge', '--no-ff', 'merged-gone', '-m', 'merge merged-gone']);
        git(repo, ['push', 'origin', 'main']);
        git(repo, ['push', 'origin', '--delete', 'merged-gone']);

        git(repo, ['checkout', '-b', 'unmerged-gone', 'main']);
        await commitFile(repo, 'unmerged.txt', 'unmerged\n', 'unmerged branch commit');
        git(repo, ['push', '-u', 'origin', 'unmerged-gone']);
        git(repo, ['checkout', 'main']);
        git(repo, ['push', 'origin', '--delete', 'unmerged-gone']);

        git(repo, ['checkout', '-b', 'remote-kept', 'main']);
        await commitFile(repo, 'remote-kept.txt', 'remote kept\n', 'remote kept branch commit');
        git(repo, ['push', '-u', 'origin', 'remote-kept']);
        git(repo, ['checkout', 'main']);

        const output = execFileSync(process.execPath, [scriptPath], {
            cwd: repo,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const branches = localBranches(repo);
        assert.equal(branches.includes('merged-gone'), false);
        assert.equal(branches.includes('unmerged-gone'), true);
        assert.equal(branches.includes('remote-kept'), true);
        assert.equal(remoteBranchExists(repo, 'origin', 'remote-kept'), true);
        assert.match(output, /Delete local branch: merged-gone/);
        assert.match(output, /Skip unmerged branch: unmerged-gone/);
    });
});
