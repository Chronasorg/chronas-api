import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * backup_dir in infra/api-edge/lib.sh, where every api-edge script writes its
 * snapshots: infra/backups/api-edge/ by default, or EDGE_BACKUP_DIR. It runs
 * from a copy of lib.sh and constants.sh in a throwaway git repository, so
 * this checkout and its infra/backups/ are never touched. Git sees no global
 * or system configuration, and no repository above the temporary directory.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const has = tool => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0;
const hasTools = ['bash', 'git'].every(has);
const STAMPED = /^\d{8}T\d{6}Z-probe$/;

describe('## infra/api-edge/lib.sh backup_dir', function () {
  this.timeout(20000);
  let dir;
  let repo;
  let outside;
  let gitEnv;

  const git = (...args) => {
    const r = spawnSync('git', args, { env: gitEnv, encoding: 'utf8' });
    expect(r.status, r.stderr).to.equal(0);
  };
  const ignore = rules => fs.writeFileSync(path.join(repo, '.gitignore'), rules);
  const stamped = d => fs.readdirSync(d).filter(name => STAMPED.test(name));

  // Sources the copied lib.sh and calls backup_dir; out is the directory it printed.
  function backupDir(env = {}) {
    const r = spawnSync('bash', ['-c', 'source "$1/infra/api-edge/lib.sh"; backup_dir probe', 'bash', repo], {
      env: { ...gitEnv, ...env },
      encoding: 'utf8'
    });
    return { code: r.status, out: r.stdout.trim(), err: r.stderr };
  }

  before(function () {
    if (!hasTools) this.skip();
    // The physical path: backup_dir resolves EDGE_BACKUP_DIR with pwd -P.
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'backup-dir-test-')));
    fs.mkdirSync(path.join(dir, 'home'));
    gitEnv = {
      PATH: process.env.PATH,
      HOME: path.join(dir, 'home'),
      XDG_CONFIG_HOME: path.join(dir, 'home'),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CEILING_DIRECTORIES: dir
    };
    repo = path.join(dir, 'repo');
    fs.mkdirSync(path.join(repo, 'infra/api-edge'), { recursive: true });
    for (const file of ['lib.sh', 'constants.sh']) {
      fs.copyFileSync(path.join(ROOT, 'infra/api-edge', file), path.join(repo, 'infra/api-edge', file));
    }
    fs.mkdirSync(path.join(repo, 'docs'));
    fs.mkdirSync(path.join(repo, 'infra/backups/custom'), { recursive: true });
    git('init', '-q', repo);
    outside = path.join(dir, 'outside');
    fs.mkdirSync(outside);
  });

  after(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('defaults to the gitignored infra/backups/api-edge/, also when EDGE_BACKUP_DIR is empty', () => {
    ignore('infra/backups/\n');
    for (const env of [{}, { EDGE_BACKUP_DIR: '' }]) {
      const r = backupDir(env);
      expect(r.code, r.err).to.equal(0);
      expect(path.dirname(r.out)).to.equal(path.join(repo, 'infra/backups/api-edge'));
      expect(path.basename(r.out)).to.match(STAMPED);
      expect(fs.statSync(r.out).isDirectory()).to.equal(true);
    }
  });

  it('refuses infra/backups/ when it is not gitignored, before creating anything', () => {
    ignore('');
    fs.rmSync(path.join(repo, 'infra/backups/api-edge'), { recursive: true, force: true });
    const r = backupDir();
    expect(r.code).to.equal(1);
    expect(r.out).to.equal('');
    expect(r.err).to.contain('infra/backups/ must be gitignored');
    expect(fs.existsSync(path.join(repo, 'infra/backups/api-edge'))).to.equal(false);
  });

  it('uses EDGE_BACKUP_DIR outside any git work tree as it is', () => {
    ignore('');
    const r = backupDir({ EDGE_BACKUP_DIR: outside });
    expect(r.code, r.err).to.equal(0);
    expect(path.dirname(r.out)).to.equal(outside);
    expect(path.basename(r.out)).to.match(STAMPED);
    expect(fs.existsSync(path.join(repo, 'infra/backups/api-edge'))).to.equal(false);
  });

  it('accepts EDGE_BACKUP_DIR inside the repository when it is gitignored', () => {
    ignore('infra/backups/\n');
    const custom = path.join(repo, 'infra/backups/custom');
    const r = backupDir({ EDGE_BACKUP_DIR: custom });
    expect(r.code, r.err).to.equal(0);
    expect(path.dirname(r.out)).to.equal(custom);
    expect(path.basename(r.out)).to.match(STAMPED);
  });

  it('refuses EDGE_BACKUP_DIR inside the repository when it is not gitignored, also through a symlink', () => {
    ignore('infra/backups/\n');
    const link = path.join(dir, 'link-to-docs');
    fs.symlinkSync(path.join(repo, 'docs'), link);
    for (const target of [path.join(repo, 'docs'), link, repo]) {
      const r = backupDir({ EDGE_BACKUP_DIR: target });
      expect(r.code, target).to.equal(1);
      expect(r.out).to.equal('');
      expect(r.err).to.contain('is in a git work tree and not gitignored');
    }
    expect(stamped(path.join(repo, 'docs'))).to.deep.equal([]);
    expect(stamped(repo)).to.deep.equal([]);
  });

  it('refuses EDGE_BACKUP_DIR in another git work tree unless it is gitignored there', () => {
    const other = path.join(dir, 'other');
    fs.mkdirSync(path.join(other, 'ignored'), { recursive: true });
    git('init', '-q', other);
    fs.writeFileSync(path.join(other, '.gitignore'), 'ignored/\n');
    const refused = backupDir({ EDGE_BACKUP_DIR: other });
    expect(refused.code).to.equal(1);
    expect(refused.err).to.contain(`EDGE_BACKUP_DIR ${other} is in a git work tree and not gitignored`);
    expect(stamped(other)).to.deep.equal([]);
    const accepted = backupDir({ EDGE_BACKUP_DIR: path.join(other, 'ignored') });
    expect(accepted.code, accepted.err).to.equal(0);
    expect(path.dirname(accepted.out)).to.equal(path.join(other, 'ignored'));
  });

  it('refuses an EDGE_BACKUP_DIR that is not an existing directory', () => {
    const missing = path.join(dir, 'missing');
    const r = backupDir({ EDGE_BACKUP_DIR: missing });
    expect(r.code).to.equal(1);
    expect(r.err).to.contain(`EDGE_BACKUP_DIR is not a directory: ${missing}`);
    expect(fs.existsSync(missing)).to.equal(false);
  });
});
