# QA Record / Runbook

## 対象

| 項目 | 内容 |
| --- | --- |
| アプリ | 重複ファイル検出・ストレージ整理ツール |
| 構成 | Next.js App Router / Static Export |
| 安全モード | `plan-only`（ファイル削除・移動なし） |
| Hash | SHA-256 / 4 MiB incremental chunks / Web Worker |
| Production | `https://duplicate-file-storage-cleanup-tool.vercel.app` |
| GitHub | `https://github.com/shunsoco-stack/duplicate-file-storage-cleanup-tool` |
| 実施日 | 2026-08-24 |

本文のPass記録は実際に実行した確認にだけ付け、未実施項目は完了扱いにしません。

## 現在の検証状態

### コードレビューで確認済み

- File System Access APIはread modeでDirectory Handleを取得する。
- File Listは `webkitRelativePath` があれば相対Pathに使い、なければファイル名へFallbackする。
- 完全重複候補はサイズで事前Group化し、非空かつ同サイズが2件以上のファイルだけをHashする。
- Hash WorkerとWorker未対応Fallbackはどちらも4 MiBずつ読み、増分SHA-256を計算する。
- 完全重複Groupは非空ファイルのSHA-256一致だけで作る。
- 同名でHashが異なるファイルは完全重複Groupに入れない。
- `modifiedAt === 0` はOld判定から除外する。
- Cleanup Planの `safetyMode` は `plan-only`、`hashAlgorithm` は `SHA-256` に固定されている。
- Cleanup Planは明示的に判断されたファイルだけをitemにする。
- CSV / JSONは整理候補だけでなく保持判断とSHA-256も保持する。
- CSVの文字列が空白に続く `=` / `+` / `-` / `@` で始まる場合はapostropheを付け、spreadsheet formula injectionを無効化する。

### 自動テスト実行結果

2026-08-24に次を実行しました。

```bash
npm test -- --run src/lib/analyzer.test.ts src/lib/export-report.test.ts src/lib/sha256.test.ts
```

| 結果 | 内容 |
| --- | --- |
| Pass | 3 test files / 10 tests |
| Fail | 0 |

開発中に `launch_film_master.mov` のunderscoreがword boundaryを阻み、`master` が正規化で除去されないcaseをtestが検出しました。underscore / hyphenを空白へ正規化してからcopy markerを除去するよう修正し、CSV formula injectionのregression testも追加して、上記10 testsの再実行で成功を確認しました。

## デモ集計のコード照合

`src/lib/demo-data.ts` の40ファイルを2026-08-24 10:30 JST基準でコード集計した値です。

| 確認項目 | 期待値 | 根拠 |
| --- | ---: | --- |
| ファイル | 40 | `DEMO_FILES.length` |
| 合計容量 | 18.245302391 GiB | `Σ size` |
| 完全重複Group | 6 | 非空・同Hashが2件以上 |
| 重複参加ファイル | 15 | `Σ group.files.length` |
| 冗長Copy | 9 | `Σ (members - 1)` |
| 削減可能容量 | 3.418230438 GiB | `Σ (group total - 1 copy)` |
| 整理後の理論容量 | 14.827071953 GiB | total - reclaimable |
| Large | 12 | 500 MiB以上 |
| Old | 17 | 365日以上 |
| Empty | 3 | 0 byte |

UIでは表示桁に合わせて丸められます。テストは丸め後の文字列だけでなく、可能な範囲でbyte値または許容誤差つき数値も照合します。

## 最終自動検証

リリース候補に対して次を1コマンドで実行します。

```bash
npm run verify
```

| Command | 最終結果 |
| --- | --- |
| `npm run lint` | Pass（ESLint error 0） |
| `npm run typecheck` | Pass（Next route type生成、TypeScript error 0） |
| `npm run test` | Pass（3 test files / 10 tests） |
| `npm run build` | Pass（Next.js 16.3.0 Static Export、`out/`生成） |

Passとする条件:

- process exit codeが0である。
- ESLint error、TypeScript error、failed testが0である。
- Next.js Static Exportが完了し `out/` が生成される。
- build中にServer-only API依存やWorker bundle errorがない。

### 検証時の主要Package

`npm ls --depth=0` で確認したinstalled versionです。

| Package | Version |
| --- | --- |
| Next.js | 16.3.0 |
| React / ReactDOM | 19.2.8 |
| TypeScript | 5.9.3 |
| Vitest | 4.1.10 |
| Lucide React | 1.28.0 |
| ESLint | 9.39.5 |

## 実施済みProduction E2E

2026-08-24にVercel ProductionをHeadless Chromeで操作し、次を確認しました。

| 境界 | 結果 | 実測根拠 |
| --- | --- | --- |
| Production応答 | Pass | 本番aliasがHTTP 200、titleが「重複ファイル検出・ストレージ整理ツール」 |
| Demo 5画面 | Pass | Summary / Duplicate Groups / Storage Analysis / Large・Old / Cleanup Reviewを描画 |
| Human Review | Pass | 6 / 6Group、保持6件、整理候補9件、未判断0件、計画削減3.4 GB |
| Report Export | Pass | CSV headerを照合、JSONをparse、15 plan itemsを確認 |
| Browser error | Pass | Console error 0、page error 0、request failure 0 |
| Mobile | Pass | 390 × 844で `scrollWidth === clientWidth === 390`、Mobile Navigation開閉成功 |
| Vercel | Pass | 最終Deployment `dpl_BUfQATLcko7P7ZdNL4mvwiiXVXuP`、target production、status Ready |
| Runtime error log | Pass | 公開後1時間を `--level error` で照会し、静的Projectのため該当log 0件 |

実ファイル相当のfixture 4件もProductionの複数File Selectへ入力しました。

- `alpha.txt` と `alpha-copy.txt` は各72 byteで同一内容、`unique-note.txt` は88 byte、`empty.txt` は0 byte。
- 4件のMetadataを読み、同サイズ候補2件だけをHashし、完全重複1Group、削減可能72 byteを算出。
- Browser側のSHA-256 `a3d16cf9029588947909e90827be5c8ea1867b12bd24308dc08e575be49a14c1` がNode.js標準 `crypto` の独立計算と一致。
- Hash Workerの生成をBrowser eventで確認。
- スキャン開始後に観測した通信はiconとWorker用Static chunkのGETだけで、POST、Fetch、XHR、WebSocket、request body付き送信は0件。
- 同じProduction操作からJSON Cleanup Planを出力し、1Group・72 byte・4ファイルのSummaryと完全なSHA-256を再確認。

これは上記fixtureと検査時のBrowser環境に対する実測です。すべてのBrowser、拡張機能、端末管理ソフトの挙動を保証するものではありません。

## Manual Browser QA

### A. Demo / Scan Summary

1. 初期画面でLocal-first、非Upload、`plan-only`の説明を確認する。
2. `デモデータで試す` を実行する。
3. UI表示の40ファイル、18.2 GB、重複6Group、整理可能Copy 9件、削減可能3.4 GB、Large 12件、Old 17件、Empty 3件を確認する。丸め前のbyte値は上のコード照合表と一致すること。
4. サマリから重複Group、容量分析、整理候補、Reviewへ移動できることを確認する。

期待: 各KPIは同じanalysis stateから算出され、画面間で値が矛盾しない。

### B. 完全重複 / 同名 / 類似名

1. 同じbyte内容で名前とPathの異なる2ファイルを用意する。
2. 同じファイル名で内容の異なる2ファイルを用意する。
3. サイズは同じで内容の異なる2ファイルを用意する。
4. `report-final.pdf` と `report_final_v2.pdf` のような類似名を用意する。
5. スキャンし、タブと件数を確認する。

期待:

- 1だけがSHA-256一致の完全重複Groupになる。
- 2は同名候補だが完全重複にはならない。
- 3はHash対象になるが、digestが異なるため重複Groupにならない。
- 4は類似名候補として表示されても、完全重複とは表示しない。

### C. 4 MiB Worker / Progress / Cancel

1. 4 MiBより大きく、同サイズのファイルを複数用意する。
2. DevToolsでWorkerが作成されることを確認する。
3. 進捗の処理ファイル数、処理byte数、現在名を確認する。
4. スキャン中にCancelする。
5. 再度スキャンし、完了させる。

期待: UI操作が長時間ブロックされず、CancelでWorkerが終了し、完了時のprocessed / totalとbyte進捗が整合する。

### D. Folder Input / Fallback

File System Access API対応Browserと非対応Browserの少なくとも2系統を確認します。

| Scenario | 期待 |
| --- | --- |
| `showDirectoryPicker` 対応 | read modeで開き、子Folderまで列挙する |
| PickerでCancel | Error扱いにせず、元の画面を保つ |
| `webkitdirectory` | `webkitRelativePath`をPathに使う |
| 通常のmultiple files | 各ファイル名をPathとして読む |
| Drag & Drop | ファイル一覧を読み、非対応itemで画面全体を壊さない |

絶対PathがUI、Export、URL、consoleへ出力されないことも確認します。

### E. Large / Old / Empty / Filter

1. Large閾値を500 MiBから変更する。
2. Old日数を365日から変更する。
3. Duplicate / Large / Old / Empty / Extensionを順に切り替える。
4. 0 byteファイルを確認する。
5. `lastModified === 0` 相当のテストデータをOld判定から除外する。

期待: 閾値の境界は `>=`、EmptyはDuplicate削減容量へ含めず、同一ファイルが複数条件に該当する場合も判定根拠が失われない。

### F. Storage Analysis

1. 拡張子別の件数と合計容量を元ファイルと照合する。
2. 最上位Folder別の件数と合計容量を照合する。
3. 空 / 1 MB未満 / 1–100 MB / 100 MB–1 GB / 1 GB以上のサイズ帯を照合する。
4. Chartと代替テキスト・表が同じ値を示すことを確認する。

期待: 各breakdownのbytes合計はsummaryの `totalBytes` と一致する。

### G. Human Review / Safety

1. 初期状態で各ファイルが未判断であることを確認する。
2. Keep Recommendationの対象と理由を確認する。
3. 推奨が自動で判断に変わらないことを確認する。
4. 1Group内で少なくと1件を保持、残りを整理候補にする。
5. 未判断が残るGroupと、保持が0件のGroupのレビュー状態を確認する。
6. DOM、Network、File System permission promptを確認する。

期待:

- 全件判断済み、かつ保持1件以上のときだけGroupがレビュー済みになる。
- 予定削減容量はユーザーが整理候補にしたファイルのsize合計である。
- ファイルが削除、移動、名称変更されない。
- write permissionを要求しない。

### H. CSV / JSON Export

1. 一部Groupだけを明示的にレビューする。
2. CSVとJSONをそれぞれ出力する。
3. 未判断ファイルのitemが出力されないことを確認する。
4. CSVのUTF-8 BOM、quote escape、列数、および空白に続く `=` / `+` / `-` / `@` で始まる文字列のapostrophe無効化を確認する。
5. JSONをparseし、schemaとsummaryを確認する。

必須JSON値:

```json
{
  "schemaVersion": "1.0",
  "safetyMode": "plan-only",
  "hashAlgorithm": "SHA-256"
}
```

必須CSV列:

```text
group_id,action,recommended,reason,path,filename,extension,size_bytes,last_modified,sha256
```

### I. Local-first Network Inspection

1. DevTools Networkを開き、logをpreserveする。
2. 実ファイルのスキャンからExportまでを操作する。
3. Fetch / XHR / Beacon / WebSocketを確認する。
4. Application / Storageでファイルbyte列やHashの不要な永続化がないことを確認する。

期待: 静的asset取得以外に入力ファイル内容、メタデータ、Hash、Cleanup Planを送信するnetwork requestがない。Browser拡張機能等のリクエストはアプリ由来と区別する。

### J. Responsive / Accessibility

確認viewport:

- 1440 × 1000
- 1024 × 900
- 768 × 1024
- 390 × 844
- 320 × 800

確認項目:

- document全体に意図しない横overflowがない。
- テーブルの横スクロールは局所化され、重要操作が画面外に固定されない。
- キーボードで全操作に到達でき、focus indicatorが見える。
- landmark、heading、button、input、table / caption / headerのセマンティクスが成立する。
- 進捗と結果更新は過剰に読み上げない状態で支援技術へ伝わる。
- Chartは色だけに依存せず、ラベル、数値、代替表を持つ。
- `prefers-reduced-motion`、`prefers-reduced-transparency`、`prefers-contrast`で可読性と操作フィードバックが保たれる。
- 200%以上のzoomで主要フローが利用できる。

axe等の自動検査を使う場合も、結果は検査時のDOMとrule setに限定されます。手動keyboard / screen reader QAやWCAG適合認証を代替するものではありません。

## Screenshot QA

次の5枚を本番URLから取得し、[docs/screenshots/README.md](screenshots/README.md) の構図・altと照合します。

1. `01-scan-summary.png`
2. `02-duplicate-groups.png`
3. `03-storage-analysis.png`
4. `04-large-old-files.png`
5. `05-cleanup-review.png`

合格条件:

- 画像が存在し、破損していない。
- 必須の見出し、KPI、安全表示が読める。
- 各画面の数値が同じDemo analysisとReview stateに基づく。
- 個人データ、ローカルの絶対Path、Browser profile情報、token、未公開URLが映り込まない。
- 開発ServerではなくVercel Productionの実画面から取得する。

## Secret Scan / Repository QA

予備確認として、2026-08-24に対象ディレクトリのソースと設定を `rg` でcase-insensitive検索し、`api key` / `secret` / `token` / `password` / `private key` / PEM private-key headerの一致が0件であることを確認しました。`.env.example` は「環境変数不要」とLocal-firstの説明コメントだけで、設定値はありません。

さらに、リリース対象working treeへGitleaks 8.30.0とPortfolio用configを適用しました。

```powershell
& '.\.portfolio-audit\tools\gitleaks-8.30.0\gitleaks.exe' dir `
  --config '.\.portfolio-audit\gitleaks-portfolio.toml' `
  --redact=100 `
  '.\duplicate-file-storage-cleanup-tool'
```

Working tree結果: 約418.08 KBをscanし、`no leaks found`。

初回release commit作成後、同じconfigでGit履歴もscanしました。1 commit、約527 KBが対象となり、結果は `no leaks found` でした。

リリース対象で次を実行し、結果を内容レビューします。

```bash
git status --short
git diff --check
git grep -nEi "(api[_-]?key|secret|token|password|private[_-]?key)"
```

追加でGitleaksを使う場合:

```bash
gitleaks detect --source . --no-banner --redact
```

確認項目:

- 実Secret、credential、個人用token、private keyがない。
- `.env.example` はサンプルのみで、実値を含まない。
- `out/`、`.next/`、ローカルcache、実スキャンのレポート、ファイルfixtureに個人データがない。
- Public repositoryのdefault branchとlocal release commitが一致する。

## Production Verification

Vercel公開後に次を確認します。

- `https://duplicate-file-storage-cleanup-tool.vercel.app` が外部からHTTP 200を返す。
- HTMLに「重複ファイル検出・ストレージ整理ツール」が含まれる。
- Static asset、Worker bundle、iconが404にならない。
- Demoの5画面、threshold変更、Review、CSV / JSON ExportがProduction buildで動作する。
- `https://github.com/shunsoco-stack/duplicate-file-storage-cleanup-tool` が外部から参照でき、repository visibilityがPublicである。
- README、QA、Portfolio PromptへProduction / GitHubの実URLを記録済みである。

## Rules File Note

依頼で指定された `DEVELOPMENT_RULES.md` は `C:\Users\kj\OneDrive\デスクトップ\DEVELOPMENT_RULES.md` で発見し、実装前に全文を確認しました。1作品1Repository、Local-first、安全性、実動Demo、品質Gate、専用アイコン、Production撮影、Secret Scan、Vercel公開後のGitHub公開、ポートフォリオ用完全版プロンプトという指示を本リリースへ反映しています。

プロジェクトの `AGENTS.md` も確認し、導入済みpackage内の `node_modules/next/dist/docs/` からNext.js 16のApp Router、Static Export、Metadata、Manifest、Error Handling、Deployment等の関連guideを確認して実装しました。

## リリース判定

以下のすべてが完了するまで、本ドキュメントの状態は「リリースQA完了」ではありません。

- [x] 類似名正規化の既知test failureを解消
- [x] `npm run verify` が全てPass
- [x] 実Browserで主要フロー、実ファイルHash、Review、Exportを確認
- [x] 実ファイルスキャン中のLocal-first Network inspectionを実施
- [x] スクリーンショット5枚をProductionから取得
- [x] Working treeとGit履歴のGitleaks結果を内容レビュー
- [x] Vercel Productionの外部アクセスとREADY状態を確認
- [x] GitHub Public repository、default branch `main`、release commit一致を確認
- [x] URL placeholderをProduction / GitHubの実URLへ置換
