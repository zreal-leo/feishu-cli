#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const remote = process.argv[2] ?? 'origin';

function runGit(args, options = {}) {
    const result = spawnSync('git', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (options.allowFailure) {
        return result;
    }

    if (result.status !== 0) {
        throw new Error(`git ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
    }

    return result.stdout.trim();
}

function refExists(ref) {
    return runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { allowFailure: true }).status === 0;
}

function findMainRef() {
    const candidates = [`refs/remotes/${remote}/main`, 'refs/heads/main'];

    for (const ref of candidates) {
        if (refExists(ref)) {
            return ref;
        }
    }

    throw new Error(`Cannot find main branch locally or on remote "${remote}".`);
}

function currentBranch() {
    return runGit(['branch', '--show-current']);
}

function goneLocalBranches() {
    const output = runGit(['for-each-ref', '--format=%(refname:short)%00%(upstream:track)', 'refs/heads']);

    if (output.length === 0) {
        return [];
    }

    return output
        .split('\n')
        .map(line => {
            const [branch = '', tracking = ''] = line.split('\0');
            return { branch, tracking };
        })
        .filter(({ branch, tracking }) => branch.length > 0 && tracking.includes('gone'))
        .map(({ branch }) => branch);
}

function isMergedInto(branch, mainRef) {
    return runGit(['merge-base', '--is-ancestor', `refs/heads/${branch}`, mainRef], { allowFailure: true }).status === 0;
}

function deleteLocalBranch(branch) {
    // `git branch -d` checks against the current HEAD/upstream; this script checks main explicitly first.
    runGit(['branch', '-D', '--', branch]);
}

console.log(`Fetching ${remote} and pruning stale remote-tracking refs...`);
runGit(['fetch', remote, '--prune']);

const mainRef = findMainRef();
const current = currentBranch();
let deleted = 0;
let skipped = 0;

const branches = goneLocalBranches();

if (branches.length === 0) {
    console.log('No gone local branches found.');
    process.exit(0);
}

console.log(`Using merge target: ${mainRef}`);

for (const branch of branches) {
    if (branch === 'main' || branch === 'master' || branch === current) {
        console.log(`Skip protected branch: ${branch}`);
        skipped += 1;
        continue;
    }

    if (!isMergedInto(branch, mainRef)) {
        console.log(`Skip unmerged branch: ${branch}`);
        skipped += 1;
        continue;
    }

    console.log(`Delete local branch: ${branch}`);
    deleteLocalBranch(branch);
    deleted += 1;
}

console.log(`Done. Deleted: ${deleted}, skipped: ${skipped}`);
