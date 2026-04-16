// Git 操作サービス
// キーマップ変更の自動 commit & push

const path = require('path');
const { execSync } = require('child_process');

class GitService {
  constructor(repoPath) {
    this.repoPath = repoPath;
  }

  /**
   * git コマンドを実行
   */
  _git(command) {
    return execSync(`git ${command}`, {
      cwd: this.repoPath,
      encoding: 'utf8',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    }).trim();
  }

  /**
   * 現在のブランチ名を取得
   */
  getCurrentBranch() {
    return this._git('rev-parse --abbrev-ref HEAD');
  }

  /**
   * 変更されたファイルを確認
   */
  getStatus() {
    return this._git('status --short');
  }

  /**
   * キーマップ変更を commit & push
   * @param {string} message - コミットメッセージ
   */
  async commitAndPush(message = 'キーマップを更新') {
    const keymapRelPath = 'config/roBa.keymap';

    console.log('[Git] 変更をステージング...');
    this._git(`add "${keymapRelPath}"`);

    // ステージングされた差分があるか確認
    let hasDiff = false;
    try {
      const diff = this._git('diff --cached --name-only');
      hasDiff = diff.length > 0;
    } catch (e) {
      hasDiff = false;
    }

    if (!hasDiff) {
      console.log('[Git] 変更なし - スキップ');
      return { changed: false };
    }

    console.log('[Git] コミット中...');
    this._git(`commit -m "${message}"`);

    const branch = this.getCurrentBranch();

    // リモートの最新を取り込んでからプッシュ
    console.log(`[Git] リモートから pull --rebase 中 (${branch})...`);
    try {
      this._git(`pull --rebase origin ${branch}`);
    } catch (pullErr) {
      // pull 失敗時もプッシュを試みる (初回など)
      console.warn('[Git] pull --rebase スキップ:', pullErr.message);
    }

    console.log(`[Git] プッシュ中 (${branch})...`);
    this._git(`push origin ${branch}`);

    console.log('[Git] プッシュ完了');
    return { changed: true, branch };
  }

  /**
   * リモートのオーナーとリポジトリ名を取得
   */
  getRemoteInfo() {
    try {
      const remoteUrl = this._git('remote get-url origin');
      // HTTPS: https://github.com/owner/repo.git
      // SSH: git@github.com:owner/repo.git
      const httpsMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
      if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2] };
      }
    } catch (e) {
      console.error('[Git] リモート情報取得失敗:', e);
    }
    return null;
  }
}

module.exports = GitService;
