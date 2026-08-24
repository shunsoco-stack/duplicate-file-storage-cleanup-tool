# ポートフォリオ掲載用 完全版プロンプト

以下をそのままポートフォリオサイトの編集・UI実装担当へ渡してください。

---

あなたは、Web業務効率化ツールのポートフォリオ編集・UI実装担当です。以下の実装済み事実だけを使い、「重複ファイル検出・ストレージ整理ツール」の一覧カードと詳細ページを作成してください。

読者は採用担当者、開発責任者、情報システム担当者、社内IT・クリエイティブ・バックオフィスの業務改善担当者を想定します。日本語を中心に、一読で「名前が同じファイルを並べるだけではなく、内容Hashからストレージへの影響を算出し、人の判断を経て安全な整理計画まで作るツール」だと分かる構成にしてください。

## 1. 固定メタデータ

- 作品名：重複ファイル検出・ストレージ整理ツール
- 英語補助名：Duplicate File & Storage Cleanup Tool
- Slug：`duplicate-file-storage-cleanup-tool`
- カテゴリ：業務効率化ツール
- サブカテゴリ：ストレージ・ファイル管理
- 対応：Web / Desktop / Tablet / Smartphone
- 専用アイコン：Files + Magnifying Glass + Duplicate
- ポートフォリオ用アイコンPath：`duplicate-file-storage-cleanup-tool/public/icons/storage-cleanup-mark.svg`
- App Router用アイコンPath：`duplicate-file-storage-cleanup-tool/src/app/icon.svg`
- Demo URL：`https://duplicate-file-storage-cleanup-tool.vercel.app`
- GitHub URL：`https://github.com/shunsoco-stack/duplicate-file-storage-cleanup-tool`
- Demoデータ：40ファイルの完全な架空File Structure
- Demo判定基準：2026-08-24 10:30 JST
- 安全モード：`plan-only`
- Hash方式：SHA-256

## 2. この作品の要約

本作品は、大量のファイル・フォルダをブラウザ内で解析し、SHA-256による完全重複、同名、類似名、巨大、古い、空ファイルを検出するLocal-firstのストレージ整理支援ツールです。

単なる検出で終わらず、同じHashのファイルをGroup化し、合計容量と削減可能容量を算出し、Keep Recommendationの理由を見ながら人が保持 / 整理候補を判断します。最後にCSV / JSONのCleanup Planを出力します。アプリ自体はファイルを削除・移動・名称変更しません。

## 3. 課題と解決

### 課題

- 同じ内容が別名やBackup Folderに散在していても、ファイル名検索だけでは見つけられない。
- 同名ファイルでも内容が異なるため、名前一致を自動削除の根拠にできない。
- 重複件数が分かっても、どれだけ容量を回収できるかが分からない。
- Large / Old / Emptyの候補が散在し、Folderや拡張子ごとの容量偏りをつかみにくい。
- 自動削除は、正式版・共有元・バックアップ方針を無視する危険がある。
- 機密ファイルを整理するために、本体を不要にServerへUploadしたくない。

### 解決

- 非空ファイルの内容をSHA-256でHash化し、同じdigestのみを完全重複とする。
- 同名・類似名は別の確認候補とし、完全重複と混同しない。
- Duplicate Groupごとに合計容量、冗長Copy数、削減可能容量をコード算出する。
- 拡張子別、Folder別、サイズ帯別の分析と、変更可能なLarge / Old閾値を提供する。
- Keep Recommendationは理由を付けた提案に留め、自動確定しない。
- Human Reviewの明示的な判断だけをCleanup Planに含める。
- 入力からReportまでブラウザ内で完結させる。

## 4. Storage Cleanup Workflow

下記の流れを、ポートフォリオの中核ストーリーとして視覚化してください。

```text
Scan
↓
Hash / Metadata解析
↓
重複Group化
↓
容量分析
↓
整理候補
↓
Human Review
↓
実行計画
↓
Report
```

「実行計画」はファイル操作自体ではなく、レビュー済みの `plan-only` Cleanup Planです。矢印の最後を「自動削除」に書き換えないでください。

## 5. 実装済み機能

### Scan / Folder Input

- File System Access APIの `showDirectoryPicker({ mode: "read" })`を使ったフォルダ選択と再帰列挙
- 未対応Browser向けの `webkitdirectory` / `multiple` File Input
- Drag & Dropと通常の複数File Select
- Picker cancelを致命的Errorにしない分離
- 重複した入力をPath、サイズ、更新日時で排除
- 取得できる範囲の相対Path表示。絶対Pathは取得しない

### Metadata

- ファイル名
- 拡張子
- byteサイズ
- 更新日時
- 相対Path
- 最上位Folder
- Hash status / SHA-256 / 読み取りError

### Exact Duplicate

- サイズ一致ファイルだけをHash候補にする事前Group化
- Web Worker内の4 MiB増分SHA-256
- Worker未対応時の同等Fallback
- 同じSHA-256の非空ファイルを1Duplicate Groupに集約
- Group内のファイル、合計容量、削減可能容量、推奨保持候補、推奨理由を表示
- 0 byteファイルはDuplicate容量効果がないためEmptyへ分離

### Same / Similar Name

- Unicode NFKC正規化、trim、case fold後の同名Group
- 同じ拡張子、copy / backup / final / master / version表記等を除いたstemを使う類似名候補
- Levenshtein類似度0.72以上の候補表示
- 同名・類似名を内容一致と扱わない安全な区別

### Storage Analysis

- スキャンファイル数
- 合計容量
- 完全重複Group数
- 重複Group参加ファイル数
- 冗長Copy数
- 削減可能容量
- Large / Old / Empty / hashed / hash error数
- 拡張子別、最上位Folder別、サイズ帯別の件数と容量
- 整理前と完全重複整理後の理論容量比較

### Candidates / Filter

- Large閾値は既定500 MiB、UIから変更可能
- Old閾値は既定365日、UIから変更可能
- Emptyは0 byte
- `modifiedAt === 0` はOldから除外
- Duplicate / Large / Old / Empty / Extension Filter
- 同一ファイルの複数候補理由を保持

### Human Review / Cleanup Plan

- 各ファイルの保持 / 整理候補 / 未判断
- copy表記、Backup系Path、Pathの長さ・深さ、更新日時を用いたKeep Recommendation
- 推奨の自動確定なし
- Group完了に全件判断済みと1件以上の保持を要求
- 明示的な整理候補のサイズだけを計画削減容量に反映
- UTF-8 BOM付きCSV
- `schemaVersion: "1.0"` のJSON
- `safetyMode: "plan-only"` と `hashAlgorithm: "SHA-256"` を出力

### Demo Mode

- 実ファイル不要で40ファイルのスキャン結果を再現
- 6つのSHA-256完全重複Group
- 同名だがHashの異なる例
- 類似名だがHashの異なる例
- Large / Old / Emptyと複数条件該当の例
- `.keep` のように、空でも意図的なファイルがあることを示す安全例

## 6. 完全重複検出の技術的な核

この節は省略しないでください。本作品が「同じファイル名を探すだけのツール」ではないことを示す中核です。

```text
1. File.sizeで事前Group化
2. 非空かつ同サイズが2件以上のファイルだけをHash対象にする
3. File.slice()で4 MiBずつ読む
4. Web Worker内で増分SHA-256を更新する
5. 64文字のSHA-256 digestが同じファイルを1Groupにする
6. Group合計と、1件保持時の削減可能容量を算出する
```

ファイル全体を1度に `arrayBuffer()` 化せず、4 MiBのchunkで順次読みます。同サイズ候補だけをHashするのは、正しさを損なわずにI/Oを減らすためです。大量ファイルの計算はWeb Workerで実行し、Workerを使えないときだけメインスレッドFallbackを使います。

数値の定義:

```text
totalBytes = Σ file.size

exactDuplicateGroup
= 同一SHA-256の非空ファイルが2件以上

groupTotalBytes = Σ group.files[].size

groupReclaimableBytes
= groupTotalBytes - group内の1ファイル分のsize

reclaimableBytes = Σ groupReclaimableBytes

redundantCopyCount = Σ (group.files.length - 1)

plannedReclaimableBytes
= Σ Human Reviewで「整理候補」にしたfile.size

estimatedBytesAfterCleanup
= totalBytes - plannedReclaimableBytes
```

0 byteファイルはすべて同じ内容ですが、容量削減効果が0のためHashとDuplicate KPIから除外し、Emptyとして別扱いします。

## 7. Local-first / Privacy

以下は強く、ただし過剰な保証をせずに説明してください。

- ファイル読み取り、Hash、メタデータ分析、Group化、Filter、Review、CSV / JSON生成はブラウザ内で完結。
- 入力ファイル本体をアプリのServerへUploadするコードはない。
- サーバーAPI、Database、Cloud Storageは使用していない。
- Next.js Static ExportをVercelから配信。
- File System Access APIはread mode。Write Permissionを要求しない。
- Browserの仕様上、取得できるのは相対Pathまたはファイル名で、端末の絶対Pathは取得しない。

「完全な機密性を保証」「端末の他ソフトやBrowser拡張機能まで監査」とは書かないでください。本アプリの実装範囲に限る説明です。

## 8. Safety / Human Review

安全性はポートフォリオの主要価値として扱ってください。

```text
検出
↓
整理候補
↓
Human Review
↓
Cleanup Plan出力
```

- 自動削除しない。
- ファイルの移動や名称変更もしない。
- Keep Recommendationは「推奨」であり、自動確定ではない。
- Recommendationにはcopy表記のなさ、原本らしいPath、Pathの短さ、更新日時などの理由を表示。
- ユーザーが保持 / 整理候補を明示的に選ぶ。
- 1Groupに少なくと1件の保持判断を必要とする。
- Reportに `safetyMode: "plan-only"` を保持。

`.keep` のような意図的な空ファイル、Backupポリシー、共有元、バージョン管理などは名前とPathだけでは判断できません。これがHuman Reviewを必須にする理由です。

## 9. Demoのコード算出値

Demoは40ファイルの架空データです。Demo HashはGroupを再現するfixtureであり、実ファイルのSHA-256 digestではありません。実スキャンはファイル内容からSHA-256を計算します。

| KPI | 値 |
| --- | ---: |
| スキャンファイル | 40件 |
| 合計容量 | 18.25 GiB相当 |
| 完全重複Group | 6Group |
| 重複Group参加ファイル | 15件 |
| 冗長Copy | 9件 |
| 削減可能容量 | 3.42 GiB相当 |
| 完全重複整理後の理論容量 | 14.83 GiB相当 |
| Large（500 MiB以上） | 12件 |
| Old（365日以上） | 17件 |
| Empty | 3件 |

基となる正確な計算値:

- `totalBytes / 1024^3 = 18.245302391052245`
- `reclaimableBytes / 1024^3 = 3.418230438232422`
- `estimatedAfter / 1024^3 = 14.827071952819823`

表示はUIの桁数に合わせて丸めます。ポートフォリオに丸め前の長い小数を並べる必要はありませんが、個別ページと画像で異なる丸めにしないでください。

### 6つの完全重複Group

| Group | 代表ファイル | メンバー | Group合計 | 削減可能 |
| --- | --- | ---: | ---: | ---: |
| D-001 | `launch-film-final.mov` | 2 | 4.80 GiB | 2.40 GiB |
| D-002 | `brand-assets.zip` | 3 | 1,260 MiB | 840 MiB |
| D-003 | `kickoff-team.jpg` | 3 | 256.2 MiB | 170.8 MiB |
| D-004 | `annual-report.pdf` | 2 | 49.6 MiB | 24.8 MiB |
| D-005 | `FY2026-budget.xlsx` | 3 | 9.6 MiB | 6.4 MiB |
| D-006 | `logo-master.svg` | 2 | 1,368 KiB | 684 KiB |

例としてD-001には次の2ファイルがあります。

- `Projects/Atlas/exports/launch-film-final.mov`
- `Backups/2026-07/Atlas/launch-film-final-copy.mov`

単体2.40 GiB相当の同一内容なので、Group合計4.80 GiB相当、1件保持時の削減可能容量は2.40 GiB相当です。

## 10. Keep Recommendation

推奨は次の順序で候補を並べ、最大3つの理由を示します。

1. Backup / Archive / Downloads / Temp系Pathでないもの
2. copy / backup / archive / old / コピー / 複製 / 連番表記を名前に含まないもの
3. Path階層が浅いもの
4. Path文字数が短いもの
5. 同点では更新日時が新しいもの

「OriginalをAIが正確に判定」と書いてはいけません。これは決定論的なheuristic推奨であり、ユーザー判断の補助です。

## 11. Report Export

### CSV

UTF-8 BOM付きで、次の列を持ちます。ファイル由来の文字列が空白に続く `=` / `+` / `-` / `@` で始まる場合はapostropheを付け、spreadsheet formula injectionを無効化します。

```text
group_id
action
recommended
reason
path
filename
extension
size_bytes
last_modified
sha256
```

### JSON

- `schemaVersion: "1.0"`
- `createdAt`
- `source`
- `safetyMode: "plan-only"`
- `hashAlgorithm: "SHA-256"`
- Large / Old閾値
- Scan Summary
- reviewed group count
- planned candidate count
- planned reclaimable bytes
- estimated bytes after cleanup
- 保持 / 整理候補のitemと判断理由

未判断ファイルはCleanup Planのitemに含まれません。

## 12. Architecture / Tech Stack

```text
Next.js App Router / Static Export
└─ Client UI
   ├─ Folder / File / Drop input
   ├─ Metadata records
   ├─ Hash Worker client
   │  └─ size pre-group → 4 MiB incremental SHA-256
   ├─ Analyzer
   │  ├─ exact duplicate groups
   │  ├─ same / similar names
   │  ├─ large / old / empty
   │  └─ extension / folder / size breakdown
   ├─ Human Review state
   └─ CSV / JSON Cleanup Plan
```

- Next.js 16.3 / App Router / Static Export
- React 19.2
- TypeScript 5.9
- Web Worker
- File System Access API / File API
- 増分SHA-256のTypeScript実装
- Lucide React
- Vitest 4 / Testing Library / jsdom
- ESLint 9
- Vercel static hosting
- Server API、Database、認証なし

## 13. Design / Accessibility

Apple Designの原則を、装飾ではなく業務操作の安全性と予測可能性に反映しています。

- Safety / Predictability：ファイルを自動削除せず、候補、Review、Planを分離
- Agency：推奨は理由を示し、決定はユーザーに残す
- Simplicity：ScanからReportまでの順序と、各画面の主要判断を明確にする
- Responsibility：Local-firstとread-only input permissionを目立つ位置で説明
- Craft：システムフォント、数値のtabular display、控えめなTranslucent Material、明確なfocus state
- 色だけに依存しないステータスラベル、数値、表
- Semantic landmark / heading / table / label
- Keyboard focusの可視化
- `prefers-reduced-motion`、`prefers-reduced-transparency`、`prefers-contrast`への配慮
- Desktopの情報密度を保ちながらTablet / Mobileで再配置

WCAG準拠認証や全支援技術での動作保証とは書かないでください。

## 14. 使用するスクリーンショット

画像は以下の5点をこの順序で使ってください。実在しない画像やUIを生成・補完せず、Vercel Productionから取得した実画面だけを使ってください。

1. Scan Summary
   - Path：`duplicate-file-storage-cleanup-tool/docs/screenshots/01-scan-summary.png`
   - Caption：ローカルスキャンから整理効果までを一望するScan Summary
   - Alt：40ファイル、合計18.2 GB、完全重複6Group、整理可能Copy 9ファイル、削減可能3.4 GB、Large 12件を示すスキャン概要画面

2. Duplicate Groups
   - Path：`duplicate-file-storage-cleanup-tool/docs/screenshots/02-duplicate-groups.png`
   - Caption：SHA-256一致の根拠と保持候補を確認できるDuplicate Group
   - Alt：SHA-256が一致するlaunch filmの2ファイル、Group合計4.8 GB、削減可能2.4 GB、保持推奨理由を表示した重複Group画面

3. Storage Analysis
   - Path：`duplicate-file-storage-cleanup-tool/docs/screenshots/03-storage-analysis.png`
   - Caption：どの種類とFolderが容量を使っているかを比較するStorage Analysis
   - Alt：拡張子別、最上位Folder別、サイズ帯別の件数と容量をチャートと数値で示すストレージ分析画面

4. Large / Old Files
   - Path：`duplicate-file-storage-cleanup-tool/docs/screenshots/04-large-old-files.png`
   - Caption：大容量と長期未更新の根拠から整理候補を絞り込む一覧
   - Alt：Large 500 MiB以上と12件、Old 365日以上と17件を切り替え、ファイル名、相対Path、サイズ、更新日時、候補理由を確認する一覧画面

5. Cleanup Review
   - Path：`duplicate-file-storage-cleanup-tool/docs/screenshots/05-cleanup-review.png`
   - Caption：ファイルを削除せず、Human Review済みの整理計画だけを出力するCleanup Review
   - Alt：6重複GroupのHuman Review、保持6件、整理候補9件、計画削減3.4 GB、CSV・JSON出力とファイルを削除しない安全表示のあるCleanup Review画面

一覧カードのサムネイルは1番を使ってください。詳細ページでは原則 `object-fit: contain` とし、KPI、Hash一致、安全表示、出力操作を切り落とさないでください。

## 15. 掲載コピー

### 一覧カード用

タイトル：重複ファイル検出・ストレージ整理ツール

カテゴリ表示：業務効率化ツール / ストレージ・ファイル管理

短文：ファイルをUploadせず、SHA-256で完全重複をGroup化。容量影響とHuman Reviewから安全な整理計画を作るLocal-firstツール。

タグ候補：`Next.js` `TypeScript` `Local-first` `SHA-256` `Web Worker` `File System Access API` `Storage Analysis` `Human Review` `CSV` `JSON`

### Hero用

Eyebrow：LOCAL-FIRST STORAGE CLEANUP

見出し：同じ名前ではなく、同じ内容を見つける。

リード：大量のファイルを端末内で読み取り、4 MiBずつSHA-256を計算。完全重複のGroup化、容量分析、整理候補、Human Review、Cleanup Plan出力までを一つのワークフローにしました。

### 課題セクション

見出し：「重複している」だけでは、整理できない。

本文：別名のCopyは名前検索では見つからず、同名ファイルは内容が同じとは限りません。さらに、重複を検出しても、どれを残し、どれだけ容量を回収できるかを人が判断できなければ、安全な整理にはつながりません。

### 解決セクション

見出し：HashからStorage Impact、Review、Planへ。

本文：同じサイズのファイルだけを4 MiB chunkで読み、Web Worker内でSHA-256を計算。同じdigestをGroup化し、合計容量と削減可能容量を算出します。Keep Recommendationは理由付きで提案するだけに留め、最終判断をHuman Reviewに残します。

### Local-firstセクション

見出し：ファイルは、ブラウザから出さない。

本文：ファイル読み取り、Hash、メタデータ分析、Group化、容量集計、Review、CSV / JSON生成はブラウザ内で完結します。File System Access APIはread modeで使い、未対応BrowserではFolder / multiple file selectへFallbackします。

### Safetyセクション

見出し：候補を出す。決めるのは人。

本文：アプリはファイルを削除・移動・名称変更しません。各Duplicate Groupで保持 / 整理候補を明示的にレビューし、`plan-only` のCleanup Planを出力します。

### CTA

- 主CTA：`デモでスキャン結果を見る` → `https://duplicate-file-storage-cleanup-tool.vercel.app`
- 副CTA：`ソースコードを見る` → `https://github.com/shunsoco-stack/duplicate-file-storage-cleanup-tool`

### Demo注記

表示データはすべて架空です。Demo Hashは重複Groupを再現するfixtureです。実スキャンではファイル内容からSHA-256を計算します。アプリはファイルを削除せず、整理計画の出力までを行います。

## 16. 詳細ページの推奨構成

1. カテゴリ、作品名、Heroコピー、専用アイコン、Scan Summary画像
2. 課題：同名と同一内容は同じではない
3. Storage Cleanup Workflow
4. Local-first / Folder Input / Browser Fallback
5. サイズ事前Group化 → 4 MiB Worker → SHA-256の完全重複検出
6. Duplicate GroupとStorage Impact
7. 拡張子別、Folder別、サイズ帯別のStorage Analysis
8. Large / Old / Empty / Same / Similar Name候補とFilter
9. Keep RecommendationのheuristicとHuman Review
10. `plan-only` のSafetyとCSV / JSON Cleanup Plan
11. Demoのコード算出値
12. Architecture / Tech Stack / Test
13. Responsive / Accessibility / Apple Designの判断
14. Known Limitations / Demo注記 / CTA

画像とchartには「何を判断できるか」が分かるcaptionを付けてください。数値を動きのない装飾に転用せず、ファイル整理の意思決定と結びつけてください。

## 17. Known Limitationsと表現上の制約

- 実ファイルの削除、移動、名称変更は未実装。出力はCleanup Planのみ。
- File System Access APIの対応とpermission UIはBrowserに依存。非対応時はFallback。
- 端末の絶対Pathは取得できず、相対Pathまたはファイル名を使う。
- Symbolic link / hard linkの識別、allocated size、filesystem compression、snapshot、cloud placeholderの実容量はBrowser File APIから取得できない。
- スキャン中に外部で変更されたファイルの一貫したsnapshotは保証しない。
- 所要時間はファイル数、サイズ、端末性能、storage、Browserに依存。処理速度を保証しない。
- 類似名はbucket化したheuristic候補で、全組合せの検索保証ではない。
- 類似名は各bucketの先頭80ファイルを比較し、score上位24pairまでを表示。整理候補テーブルは現在のFilter / Search結果の先頭100件までを表示。
- Keep Recommendationは正式版、バックアップ方針、共有元を理解するAIではなく、名前・Path・日時のheuristic。
- SHA-256一致を実用的な完全重複根拠として使うが、cryptographic collisionの理論的可能性を0とは主張しない。
- スキャン結果、閾値、Review状態は現在のページのメモリ上だけにあり、reloadやtab終了をまたいで永続化・共有しない。
- Account、Authentication、Authorization、Server API、Database、Team Review、共有、改ざん防止Audit Logは未実装。
- DemoのHashはfixture。実ファイルのdigestとして扱わない。

## 18. 禁止事項

- ファイル名一致を完全重複判定と書かない。
- 同名・類似名を内容一致と書かない。
- ファイル全体を一度にメモリへ読むと書かない。4 MiB incremental chunkである。
- すべてのファイルをHashすると書かない。非空の同サイズ候補だけである。
- Demo Hashを実ファイルのSHA-256と書かない。
- アプリがファイルを削除、移動、名称変更、隔離すると書かない。
- Keep Recommendationが正しいOriginalを自動判定すると書かない。
- AIがHash、容量、Recommendation、整理計画を計算すると書かない。実装は決定論的な通常コードである。
- ファイルがCloudへUploadされると書かない。
- ただし「端末全体の通信を完全保証」「どのBrowserでも絶対に外部送信なし」という過剰な保証も書かない。
- 実在顧客、導入実績、回収容量の成果、ROI、利用人数、処理速度をでっち上げない。
- 実測していない大量ファイルの上限、ベンチマーク、ブラウザ別動作保証を書かない。
- WCAG準拠、脆弱性診断済み、ペネトレーションテスト済み、セキュリティ保証と書かない。
- 存在しないScreen、Chart、Mobile UI、Export形式を追加しない。
- Screenshotの数値を書き換えたり、架空のUI画像を生成したりしない。
- Vercel URL、GitHub URL、担当期間、チーム人数、実運用環境を推測しない。

## 19. 受入基準

- [ ] 作品名、カテゴリ、サブカテゴリが固定メタデータどおりである。
- [ ] Files + Magnifying Glass + Duplicateの専用アイコンを使っている。
- [ ] 5枚の実画面を指定順・指定Pathで使い、それぞれにcaptionと具体的なaltがある。
- [ ] HeroでLocal-firstとSHA-256完全重複検出が分かる。
- [ ] Scan → Hash / Metadata → Group → Analysis → Candidates → Human Review → Plan → Reportが表現されている。
- [ ] サイズ事前Group化、4 MiB incremental chunks、Web Worker、SHA-256一致の関係が正しい。
- [ ] 同名・類似名は内容一致ではないと明記されている。
- [ ] Duplicate Group合計、削減可能容量、計画削減容量の定義が正しい。
- [ ] Demoの40ファイル、6Group、15参加ファイル、9冗長Copy、18.25 / 3.42 / 14.83 GiB相当が一貫している。
- [ ] Large 12件、Old 17件、Empty 3件が2026-08-24基準と明記されている。
- [ ] Keep Recommendationの根拠と、推奨が自動確定ではないことを説明している。
- [ ] ファイルを削除せず、`plan-only` Cleanup Planを出力すると明記している。
- [ ] CSV / JSONの内容とSHA-256の保持を正しく説明している。
- [ ] Local-firstの実装範囲とBrowser / OSへの過剰な保証の境界が明確である。
- [ ] File System Access APIとBrowser Fallbackを説明している。
- [ ] 実装していない削除、共有、認証、Server API、Database、Auditをでっち上げていない。
- [ ] Demo CTAとGitHub CTAが上記の実URLに一致している。

最終成果物は、一覧カードと詳細ページの数値、用語、安全表現、URL、画像を統一し、閲覧者が「名前が似たファイルを並べるだけではなく、内容HashからStorage Impact、Human Review、Cleanup Planまで成立したツール」と理解できる状態にしてください。

---
