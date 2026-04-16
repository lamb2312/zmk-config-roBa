// フラッシュサービス
// Windows の USB ドライブを監視して XIAO BLE のブートローダーを検知し、UF2 を自動コピー

const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');

// XIAO BLE のブートローダーで出現するボリュームラベル
const BOOTLOADER_LABELS = ['XIAO-SENSE', 'NRF52BOOT', 'XIAO_BLE', 'NICENANO'];
const POLL_INTERVAL_MS = 1000;

class FlashService {
  constructor() {
    this.polling = false;
    this.pollTimer = null;
    this.onDriveDetected = null;
    this.onFlashComplete = null;
    this.onFlashError = null;
    this.knownDrives = new Set();
  }

  /**
   * USB ドライブの監視を開始
   * @param {object} callbacks
   */
  startWatching({ onDriveDetected, onFlashComplete, onFlashError }) {
    this.onDriveDetected = onDriveDetected;
    this.onFlashComplete = onFlashComplete;
    this.onFlashError = onFlashError;
    this.polling = true;

    // 初期ドライブ一覧を取得（既存ドライブを除外するため）
    this.knownDrives = new Set(this.getAllDrives().map(d => d.letter));

    console.log('[Flash] USB ドライブ監視を開始しました');
    this._poll();
  }

  /**
   * 監視を停止
   */
  stopWatching() {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('[Flash] USB ドライブ監視を停止しました');
  }

  /**
   * ポーリングループ
   */
  async _poll() {
    if (!this.polling) return;

    try {
      const drives = this.getAllDrives();
      for (const drive of drives) {
        if (!this.knownDrives.has(drive.letter)) {
          // 新しいドライブを検知
          this.knownDrives.add(drive.letter);
          const isBootloader = BOOTLOADER_LABELS.some(
            label => drive.label.toUpperCase().includes(label)
          );
          if (isBootloader) {
            console.log(`[Flash] ブートローダードライブ検知: ${drive.letter} (${drive.label})`);
            if (this.onDriveDetected) this.onDriveDetected(drive);
          }
        }
      }

      // 消えたドライブをリストから削除
      const currentLetters = new Set(drives.map(d => d.letter));
      for (const letter of this.knownDrives) {
        if (!currentLetters.has(letter)) {
          this.knownDrives.delete(letter);
        }
      }
    } catch (e) {
      console.error('[Flash] ポーリングエラー:', e);
    }

    this.pollTimer = setTimeout(() => this._poll(), POLL_INTERVAL_MS);
  }

  /**
   * Windows の全ドライブ一覧を取得
   * @returns {Array<{letter: string, label: string, type: string}>}
   */
  getAllDrives() {
    try {
      // PowerShell で USB ドライブを取得
      const output = execSync(
        `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ` +
        `Get-Volume | Where-Object {$_.DriveType -eq 'Removable' -or $_.DriveType -eq 'Fixed'} | ` +
        `Select-Object DriveLetter, FileSystemLabel, DriveType | ConvertTo-Json`,
        { shell: 'powershell.exe', encoding: 'utf8', timeout: 3000 }
      );
      const data = JSON.parse(output);
      const items = Array.isArray(data) ? data : [data];
      return items
        .filter(d => d.DriveLetter)
        .map(d => ({
          letter: d.DriveLetter + ':',
          label: d.FileSystemLabel || '',
          type: d.DriveType,
        }));
    } catch (e) {
      return [];
    }
  }

  /**
   * UF2 ファイルをブートローダードライブにコピー
   * @param {string} uf2Path - コピー元 UF2 ファイルパス
   * @param {string} driveLetter - コピー先ドライブレター (例: "E:")
   * @returns {Promise<void>}
   */
  async flashUf2(uf2Path, driveLetter) {
    const destPath = path.join(driveLetter, path.basename(uf2Path));
    console.log(`[Flash] フラッシュ開始: ${uf2Path} → ${destPath}`);

    return new Promise((resolve, reject) => {
      // xcopy を使ってコピー（エラーを無視: XIAO はコピー後すぐリセットするため）
      exec(
        `xcopy /Y "${uf2Path}" "${driveLetter}\\"`,
        { shell: 'cmd.exe' },
        (error, stdout, stderr) => {
          // XIAO は書き込み後即座に切断するため、エラーは正常
          console.log(`[Flash] コピー完了 (切断エラーは正常): ${stdout}`);
          resolve();
        }
      );
    });
  }

  /**
   * 左右両方を順番にフラッシュするワークフロー
   * @param {string[]} uf2Files - [left_uf2_path, right_uf2_path]
   * @param {function} onStatus - ステータスコールバック
   */
  async flashBothSides(uf2Files, onStatus) {
    // settings_reset など不要な UF2 を除外
    const firmwareFiles = uf2Files.filter(f => {
      const name = path.basename(f).toLowerCase();
      return !name.includes('settings_reset');
    });

    if (firmwareFiles.length === 0) {
      throw new Error('フラッシュ対象の UF2 ファイルが見つかりません');
    }

    const sides = this.classifyUf2Files(firmwareFiles);

    for (const [side, uf2Path] of Object.entries(sides)) {
      if (!uf2Path) continue;

      onStatus({ phase: 'waiting', side, message: `${side} をリセットしてください（RST ダブルタップ）` });

      // ブートローダードライブを待機
      const drive = await this.waitForBootloaderDrive();

      onStatus({ phase: 'flashing', side, drive: drive.letter, message: `${side} をフラッシュ中...` });

      await this.flashUf2(uf2Path, drive.letter);

      // ドライブが消えるまで待つ（フラッシュ完了確認）
      await this.waitForDriveDisappear(drive.letter);

      onStatus({ phase: 'done', side, message: `${side} のフラッシュ完了 ✓` });

      if (Object.keys(sides).indexOf(side) < Object.keys(sides).length - 1) {
        // 次の側がある場合: 少し待機
        await sleep(2000);
      }
    }
  }

  /**
   * ブートローダードライブが出現するまで待機
   * @returns {Promise<{letter: string, label: string}>}
   */
  waitForBootloaderDrive() {
    return new Promise((resolve) => {
      const check = () => {
        const drives = this.getAllDrives();
        for (const drive of drives) {
          if (!this.knownDrives.has(drive.letter)) {
            const isBootloader = BOOTLOADER_LABELS.some(
              label => drive.label.toUpperCase().includes(label)
            );
            if (isBootloader) {
              resolve(drive);
              return;
            }
          }
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  /**
   * ドライブが消えるまで待機
   * @param {string} driveLetter
   */
  waitForDriveDisappear(driveLetter) {
    return new Promise((resolve) => {
      const check = () => {
        const drives = this.getAllDrives();
        const exists = drives.some(d => d.letter === driveLetter);
        if (!exists) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      setTimeout(check, 1000);
    });
  }

  /**
   * UF2 ファイルを左右に分類
   * @param {string[]} uf2Files
   * @returns {{Left: string|null, Right: string|null}}
   */
  classifyUf2Files(uf2Files) {
    const result = { Left: null, Right: null };
    for (const f of uf2Files) {
      const basename = path.basename(f).toLowerCase();
      // _l- / left で左サイド、_r- / right で右サイド（_reset 等に誤マッチしないよう厳密化）
      if (basename.includes('_left') || /[_-]l[_.-]/.test(basename) || basename.startsWith('roba_l')) {
        result.Left = f;
      } else if (basename.includes('_right') || /[_-]r[_.-]/.test(basename) || basename.startsWith('roba_r')) {
        result.Right = f;
      }
    }
    // 分類できない場合は最初の2ファイルを割り当て
    if (!result.Left && !result.Right && uf2Files.length >= 2) {
      result.Left = uf2Files[0];
      result.Right = uf2Files[1];
    } else if (!result.Left && !result.Right && uf2Files.length === 1) {
      result.Right = uf2Files[0]; // roBa_R がメイン
    }

    console.log('[Flash] UF2 分類結果:', {
      Left: result.Left ? path.basename(result.Left) : null,
      Right: result.Right ? path.basename(result.Right) : null,
    });
    return result;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = FlashService;
