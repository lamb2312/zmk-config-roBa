// GitHub Actions 連携サービス
// ビルドのトリガー、進捗監視、UF2 アーティファクトのダウンロード

const https = require('https');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

class GitHubService {
  constructor(token, owner, repo) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.baseUrl = 'https://api.github.com';
  }

  /**
   * GitHub API リクエストを送信
   */
  async request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: endpoint,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'roba-keymap-tool/1.0',
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data ? JSON.parse(data) : {});
          } else {
            reject(new Error(`GitHub API エラー: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  /**
   * workflow_dispatch でビルドをトリガー
   * @returns {Promise<string>} トリガー時刻（ランID特定用）
   */
  async triggerBuild(ref = 'main') {
    const triggerTime = new Date().toISOString();
    await this.request('POST', `/repos/${this.owner}/${this.repo}/actions/workflows/build.yml/dispatches`, {
      ref: ref,
    });
    console.log(`[GitHub] ビルドをトリガーしました (${triggerTime})`);
    return triggerTime;
  }

  /**
   * トリガー後に新しいランIDを取得（ポーリング）
   * @param {string} triggerTime - トリガー時刻
   * @returns {Promise<number>} ランID
   */
  async getLatestRunId(triggerTime) {
    // トリガー後少し待ってからポーリング
    await sleep(5000);

    for (let i = 0; i < 20; i++) {
      const data = await this.request('GET', `/repos/${this.owner}/${this.repo}/actions/runs?event=workflow_dispatch&per_page=5`);
      for (const run of data.workflow_runs || []) {
        if (new Date(run.created_at) >= new Date(triggerTime) - 10000) {
          console.log(`[GitHub] ランID取得: ${run.id}`);
          return run.id;
        }
      }
      await sleep(3000);
    }
    throw new Error('ランIDの取得タイムアウト');
  }

  /**
   * ビルドの完了を待機（進捗コールバック付き）
   * @param {number} runId
   * @param {function} onProgress - ({ status, conclusion, durationSec }) コールバック
   * @returns {Promise<string>} 'success' | 'failure'
   */
  async waitForBuild(runId, onProgress) {
    const startTime = Date.now();
    let prevStatus = null;

    while (true) {
      const data = await this.request('GET', `/repos/${this.owner}/${this.repo}/actions/runs/${runId}`);
      const { status, conclusion } = data;
      const durationSec = Math.floor((Date.now() - startTime) / 1000);

      if (status !== prevStatus) {
        console.log(`[GitHub] ビルド状態: ${status} (${durationSec}秒経過)`);
        prevStatus = status;
      }

      if (onProgress) {
        onProgress({ status, conclusion, durationSec });
      }

      if (status === 'completed') {
        return conclusion;
      }

      await sleep(8000);
    }
  }

  /**
   * ランのアーティファクト一覧を取得
   * @param {number} runId
   * @returns {Promise<Array>}
   */
  async listArtifacts(runId) {
    const data = await this.request('GET', `/repos/${this.owner}/${this.repo}/actions/runs/${runId}/artifacts`);
    return data.artifacts || [];
  }

  /**
   * アーティファクトをダウンロードして展開
   * @param {number} artifactId
   * @param {string} destDir - 保存先ディレクトリ
   * @returns {Promise<string>} 保存先パス
   */
  async downloadArtifact(artifactId, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    const zipPath = path.join(destDir, `artifact_${artifactId}.zip`);

    // リダイレクトURLを取得
    const redirectUrl = await this.getArtifactDownloadUrl(artifactId);

    // ダウンロード
    await this.downloadFile(redirectUrl, zipPath);

    // 展開
    const { execSync } = require('child_process');
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`);

    // UF2 ファイルを探す
    const uf2Files = this.findUf2Files(destDir);
    return { zipPath, uf2Files };
  }

  /**
   * アーティファクトのダウンロードURLを取得（リダイレクト先）
   */
  async getArtifactDownloadUrl(artifactId) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.owner}/${this.repo}/actions/artifacts/${artifactId}/zip`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'User-Agent': 'roba-keymap-tool/1.0',
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 302) {
          resolve(res.headers.location);
        } else {
          reject(new Error(`ダウンロードURLの取得失敗: ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * ファイルをダウンロード
   */
  async downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: { 'User-Agent': 'roba-keymap-tool/1.0' },
      };

      const file = fs.createWriteStream(destPath);
      const req = https.request(options, (res) => {
        if (res.statusCode === 302) {
          // 再リダイレクト対応
          file.close();
          this.downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
          return;
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      });
      req.on('error', reject);
      req.end();
    });
  }

  /**
   * ディレクトリ内の UF2 ファイルを列挙
   */
  findUf2Files(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.findUf2Files(fullPath));
      } else if (entry.name.endsWith('.uf2')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  /**
   * PAT の有効性を検証
   */
  async validateToken() {
    try {
      const data = await this.request('GET', '/user');
      return { valid: true, login: data.login };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = GitHubService;
