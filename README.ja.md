# mm CLI

mmは、GTD・Bullet
Journal・Zettelkastenといったタスク管理やナレッジ管理の手法を統合した、PKOS（Personal Knowledge
Operating System）です。

**主な特徴:**

- 知識グラフ上でUnixライクなパスナビゲーション（`cd`、`ls`、`pwd`）を提供
- ノート・タスク・イベントをYAMLフロントマター付きのプレーンテキストMarkdownファイルとして管理
- Gitフレンドリーでユーザーが直接編集可能

[English](README.md) | 日本語

## 目次

- [ドキュメント](#ドキュメント)
- [前提条件](#前提条件)
- [はじめに](#はじめに)
- [リリース](#リリース)
- [コマンド](#コマンド)
  - [アイテムの作成](#アイテムの作成)
  - [アイテムステータスの管理](#アイテムステータスの管理)
  - [ナビゲーション](#ナビゲーション)
  - [ワークスペース管理](#ワークスペース管理)
  - [設定](#設定)
  - [Git同期](#git同期)
  - [メンテナンス](#メンテナンス)
- [シェル補完](#シェル補完)

## ドキュメント

プロダクト設計の詳細は [docs/steering/design.md](docs/steering/design.md) にあります。

## 前提条件

- macOS または Linux
- [Deno](https://deno.com/) v2.x以降
- Git（オプション、同期機能を使う場合に必要）

## 利用方法

まず、リポジトリをクローンします：

```sh
git clone https://github.com/kecbigmt/mm.git
cd mm
```

### インストールせず試したいとき

```sh
deno task exec workspace init my-workspace
deno task exec note "最初のノート"
deno task exec list
```

### インストールしたいとき

```sh
deno task install
```

インストール後、どこからでも `mm` コマンドが使えるようになります：

```sh
mm workspace init my-workspace
mm note "最初のノート"
mm list
```

または、`deno task compile` でスタンドアロンバイナリをビルドすることもできます。

### リリース

**macOS Apple Silicon** 向けのビルド済みバイナリは [GitHub Releases](https://github.com/kecbigmt/mm/releases) で公開しています。必要なバージョンの `mm-<version>-darwin-arm64` をダウンロードしてください。`mm --version` で表示されるバージョンはリリースタグと一致します。

**シェル補完（オプション）**: Zsh/Bash用のタブ補完を有効にするには、シェル設定に
`source <(mm completions zsh)` または `source <(mm completions bash)` を追加します。詳細は
[シェル補完](#シェル補完) を参照してください。

## コマンド

### アイテムの作成

#### `note [title]`

新しいノートを作成します。エイリアス: `n`

```sh
mm note "ノートのタイトル"
mm n --body "ノートの内容" "週次レビュー"
```

オプション:

- `-b, --body <body>` - 本文テキスト
- `-p, --parent <path>` - 親コンテナ（デフォルト: today）
- `-c, --context <context>` - コンテキストタグ
- `-a, --alias <slug>` - 人間が読めるエイリアス
- `-e, --edit` - 作成後にエディタを開く

#### `task [title]`

新しいタスクを作成します。エイリアス: `t`

```sh
# 完全なISO 8601形式（UTC）
mm task "PRレビュー" --due-at "2025-01-20T17:00:00Z"

# ローカル時刻（タイムゾーンなし）
mm task "PRレビュー" --due-at "2025-01-20T17:00"

# 時刻のみ（今日の日付を使用）
mm t "バグ修正" --due-at "17:00" --context work
```

オプション:

- `-b, --body <body>` - 本文テキスト
- `-p, --parent <path>` - 親コンテナ（デフォルト: today）
- `-c, --context <context>` - コンテキストタグ
- `-a, --alias <slug>` - 人間が読めるエイリアス
- `-d, --due-at <datetime>` - 期限日時。以下のいずれかの形式:
  - タイムゾーン付きISO 8601: `2025-01-20T17:00:00Z` または `2025-01-20T17:00:00+09:00`
  - ローカル時刻ISO 8601: `2025-01-20T17:00`（ローカル時刻として解釈）
  - 時刻のみ: `17:00` または `17:00:00`（親の配置日付または今日を使用）
- `-e, --edit` - 作成後にエディタを開く

#### `event [title]`

新しいイベントを作成します。エイリアス: `ev`

```sh
# 完全なISO 8601形式（UTC）
mm event "チームミーティング" --start-at "2025-01-15T14:00:00Z" --duration 2h

# ローカル時刻（タイムゾーンなし）
mm event "チームミーティング" --start-at "2025-11-21T15:00" --duration 1h

# 時刻のみ（親の日付を使用）
mm event "ランチ" --start-at "12:00" --duration 1h
```

オプション:

- `-b, --body <body>` - 本文テキスト
- `-p, --parent <path>` - 親コンテナ（デフォルト: today）
- `-c, --context <context>` - コンテキストタグ
- `-a, --alias <slug>` - 人間が読めるエイリアス
- `-s, --start-at <datetime>` - 開始日時。以下のいずれかの形式:
  - タイムゾーン付きISO 8601: `2025-01-15T14:00:00Z` または `2025-01-15T14:00:00+09:00`
  - ローカル時刻ISO 8601: `2025-01-15T14:00`（ローカル時刻として解釈）
  - 時刻のみ: `14:00` または `14:00:00`（親の配置日付または今日を使用）
- `-d, --duration <duration>` - 期間（例: 30m, 2h, 1h30m）
- `-e, --edit` - 作成後にエディタを開く

**注意:** `--start-at` を指定したイベントの場合、カレンダーベースの配置（例:
`/2025-01-15`）では日付部分が親の配置日付と一致する必要があります。この検証はアイテムベースの配置ではスキップされます。

### アイテムステータスの管理

#### アイテムID参照

アイテムを操作するコマンドは、以下の識別子形式を受け付けます：

- **完全なアイテムID**: 完全なUUID v7識別子（例: `01932e4a-1234-5678-9abc-def012345678`）
- **エイリアス**: アイテムに割り当てられた人間が読めるエイリアス（例: `meeting-notes`,
  `design-system`）

エイリアスが複数のアイテムにマッチする場合、コマンドは曖昧なマッチをリストするエラーを表示します。

#### 共通オプション

- `-w, --workspace <workspace>` - 単一コマンドでアクティブなワークスペースを上書き

#### `close <ids...>`

1つ以上のアイテム（タスク/ノート/イベント）をクローズします。

```sh
# UUIDでクローズ
mm close 01932e4a-1234-5678-9abc-def012345678

# エイリアスでクローズ
mm close task-a

# 複数のアイテムをクローズ
mm close task-a task-b task-c
```

#### `reopen <ids...>`

1つ以上のクローズされたアイテムを再オープンします。

```sh
# UUIDで再オープン
mm reopen 01932e4a-1234-5678-9abc-def012345678

# エイリアスで再オープン
mm reopen task-a

# 複数のアイテムを再オープン
mm reopen task-a task-b
```

#### `move <ids...> <placement>`

1つ以上のアイテムを新しい配置に移動します。アイテムは物理的な場所を維持し、論理的な配置のみが変更されます。エイリアス:
`mv`

```sh
# アイテムを今日の先頭に移動
mm move task-a head:today
mm mv task-a head:today

# アイテムを今日の末尾に移動
mm mv task-b tail:today

# アイテムを別のアイテムの後に移動（UUIDで）
mm mv 01932e4a-1234-5678-9abc-def012345678 after:01932e4a-5678-1234-abcd-ef0123456789

# アイテムを別のアイテムの前に移動（エイリアスで）
mm mv task-a before:task-b

# 別の親/セクションに移動
mm mv task-c project-alpha/1

# 特定の日付に移動
mm mv task-a 2025-01-20

# 複数のアイテムを移動（順序を維持）
mm mv task-a task-b task-c head:today
```

配置形式:

- `head:<path>` - ターゲットコンテナの先頭（最初の位置）に移動
- `tail:<path>` - ターゲットコンテナの末尾（最後の位置）に移動
- `after:<item-id>` - 指定したアイテムの後に移動
- `before:<item-id>` - 指定したアイテムの前に移動
- `<path>` - ターゲットコンテナ（日付またはアイテムエイリアス）に移動

複数のアイテムを移動する場合、指定した順序で配置されます。最初のアイテムがターゲット配置に移動し、以降のアイテムは前のアイテムの後に配置されます。

#### `snooze <ids...> [until]`

アイテムを将来の日時までスヌーズします。スヌーズされたアイテムは通常のリストから非表示になります。エイリアス:
`sn`

```sh
# デフォルトの期間（8時間）でスヌーズ
mm snooze task-a

# 明示的な期間でスヌーズ（UUIDで）
mm snooze 01932e4a-1234-5678-9abc-def012345678 2h
mm sn task-b 30m

# 特定の時刻までスヌーズ（親の日付を使用）
mm snooze task-c 17:00

# 特定の日時までスヌーズ
mm snooze task-a "2025-01-20T17:00"

# スヌーズをクリア（スヌーズ解除）
mm snooze task-a --clear
mm sn task-b -c
```

オプション:

- `-c, --clear` - スヌーズをクリア（アイテムのスヌーズを解除）

期間形式: `30m`, `2h`, `1h30m`

日時形式:

- タイムゾーン付きISO 8601: `2025-01-20T17:00:00Z` または `2025-01-20T17:00:00+09:00`
- ローカル時刻ISO 8601: `2025-01-20T17:00`（ローカル時刻として解釈）
- 時刻のみ: `17:00` または `17:00:00`（親の配置日付または今日を使用）

#### `remove <ids...>`

ワークスペースからアイテムを完全に削除します。エイリアス: `rm`

```sh
# UUIDで単一のアイテムを削除
mm remove 01932e4a-1234-5678-9abc-def012345678

# エイリアスで削除
mm rm task-a

# 複数のアイテムを削除
mm remove task-a task-b task-c
```

### ナビゲーション

mmは知識グラフ上でUnixライクなパスナビゲーションを提供します。

#### `cd [path]`

知識グラフ内の現在位置を変更します。

```sh
# 今日に移動
mm cd today

# 特定の日付に移動
mm cd 2025-01-20

# エイリアスでアイテムに移動
mm cd meeting-notes

# アイテム配下のセクションに移動
mm cd project-alpha/1

# 親の位置に移動
mm cd ..

# 引数なしで実行すると現在位置を表示
mm cd
```

#### `pwd`

現在位置のパスを表示します。

```sh
mm pwd
```

#### `ls [path]`

現在位置または指定したパスのアイテムをリスト表示します。

```sh
# 現在位置のアイテムをリスト
mm ls

# 特定のパスのアイテムをリスト
mm ls today
mm ls 2025-01-20
mm ls project-alpha/1

# スヌーズされたアイテムとクローズされたアイテムも含めてすべて表示
mm ls --all
mm ls -a

# 日付範囲でリスト
mm ls 2025-01-01..2025-01-07
```

オプション:

- `-a, --all` - スヌーズされたアイテムとクローズされたアイテムも含めてすべて表示

#### `where <id>`

アイテムの論理パスと物理パスの両方を表示します。

```sh
# UUIDで指定
mm where 01932e4a-1234-5678-9abc-def012345678

# エイリアスで指定
mm where meeting-notes
```

### ワークスペース管理

ワークスペースはデフォルトで `~/.mm/workspaces` に保存されます（`MM_HOME`
で上書き可能）。`workspace` コマンドは短いエイリアス `ws` も受け付けます。

#### `workspace list`

すべての既知のワークスペースを表示し、アクティブなワークスペースをハイライトします。

```sh
mm workspace list
mm ws list
```

#### `workspace init <name>`

新しいワークスペースを作成し（既に存在する場合は失敗）、すぐに切り替えます。オプションでタイムゾーンを設定できます。

```sh
mm workspace init research
mm ws init client-a --timezone Asia/Tokyo
```

既存のリモートリポジトリからクローンする場合（例: 別のマシンから）:

```sh
mm workspace init my-workspace --remote https://github.com/username/my-workspace.git
```

オプション:

- `-t, --timezone <iana-id>` - 新しいワークスペースのタイムゾーン識別子（デフォルト:
  ホストのタイムゾーン）
- `-r, --remote <url>` - リモートGitリポジトリからクローン（HTTPSまたはSSH）
- `-b, --branch <branch>` - クローン時にチェックアウトするブランチ（デフォルト:
  リポジトリのデフォルト）

#### `workspace use <name>`

既存のワークスペースに切り替えます。ワークスペースが存在しない場合は、指定された（またはデフォルトの）タイムゾーンで最初に作成されます。

```sh
mm workspace use research
mm ws use client-a --timezone Asia/Tokyo
```

### 設定

#### `config [list|get|set]`

ワークスペース設定を表示・変更します。

```sh
mm config                              # すべての設定を表示
mm config get sync.mode                # 特定の値を取得
mm config set sync.mode auto-sync      # 値を設定
```

対応キー: `timezone`, `sync.enabled`, `sync.mode`, `sync.git.remote`, `sync.git.branch`

### Git同期

mmはGitベースの同期をサポートし、デバイス間でワークスペースをバックアップおよび同期できます。2つの同期モードがあります：

- **auto-commit**: 各操作後に自動的に変更をコミット（手動プッシュが必要）
- **auto-sync**: 各操作後に自動的に変更をコミットしてプッシュ

#### `sync init <remote-url>`

ワークスペースのGit同期を初期化します。Gitリポジトリを作成し、リモートを設定し、auto-commitモード（各操作後の自動コミット、手動プッシュが必要）を有効にします。

```sh
# デフォルトブランチ（main）で初期化
mm sync init https://github.com/username/my-workspace.git

# カスタムブランチを指定
mm sync init git@github.com:username/my-workspace.git --branch develop

# 既存のリモート設定を強制上書き
mm sync init https://github.com/username/my-workspace.git --force
```

オプション:

- `-b, --branch <branch>` - 同期するブランチ（デフォルト: main）
- `-f, --force` - 既存のリモート設定を強制上書き

このコマンドは自動的に `.gitignore`
ファイルを作成し、ローカルの状態とキャッシュファイル（`.state.json`, `.index/`,
`.tmp/`）を除外します。

#### `sync push`

ローカルコミットをリモートリポジトリにプッシュします。

```sh
# リモートにコミットをプッシュ
mm sync push

# 強制プッシュ（注意して使用）
mm sync push --force
```

オプション:

- `-f, --force` - リモートに強制プッシュ

#### `sync pull`

リモートリポジトリから変更をプルします。クリーンな作業ツリーが必要です（コミットされていない変更がない）。

```sh
mm sync pull
```

#### `sync`

pullとpush操作を順番に実行します。

```sh
mm sync
```

**注意**:
auto-commitモードでは、変更はローカルにコミットされますが、自動的にはプッシュされません。リモートにコミットをプッシュするには
`mm sync push` または `mm sync`
を使用してください。auto-syncモードでは、各操作後に変更が自動的にコミットされてプッシュされます。

**同期モード設定**: 同期モードはデフォルトで `auto-commit` です。`auto-sync` に変更するには
`mm config set sync.mode auto-sync` を使用してください。

### メンテナンス

#### `doctor check`

変更を加えずにワークスペースの整合性を検証します。フロントマターの問題、グラフの不整合、インデックス同期の問題を報告します。

```sh
mm doctor check
```

#### `doctor rebuild-index`

アイテムのフロントマターから `.index/`
ディレクトリを再構築します。ワークスペースのクローン後やインデックスが破損した場合に使用します。

```sh
mm doctor rebuild-index
```

#### `doctor rebalance-rank <paths...>`

指定されたパスのアイテムのLexoRank値を再バランスし、挿入余地を復元します。

```sh
mm doctor rebalance-rank today
mm doctor rebalance-rank 2025-01-15 book-alias
```

## シェル補完

mmは、ZshとBashでコマンド、フラグ、最近使用したエイリアス/タグのタブ補完を提供します。

### インストール

#### Zsh

`~/.zshrc` に以下を追加：

```sh
source <(mm completions zsh)
```

その後、シェルを再起動するか `source ~/.zshrc` を実行します。

#### Bash

`~/.bashrc` または `~/.bash_profile` に以下を追加：

```sh
source <(mm completions bash)
```

その後、シェルを再起動するか `source ~/.bashrc` を実行します。

### 補完される内容

- **コマンド**: すべてのmmコマンド（`note`, `task`, `edit`, `list`, `move`, `close` など）
- **フラグ**: 各コマンドのコンテキスト対応フラグ補完（例: `--context`, `--parent`, `--alias`）
- **エイリアス**: アイテムの編集や移動時に最近使用したアイテムエイリアス（最近の操作からキャッシュ）
- **コンテキストタグ**: `--context` 指定時に最近使用したタグ（最近の操作からキャッシュ）

### 動作の仕組み

エイリアスとタグの補完候補は、ワークスペースの `.index/`
ディレクトリに保存されたキャッシュファイルによって提供されます。これらのキャッシュファイルは、`list`、`edit`、`note`、`close`
などのコマンドを使用すると自動的に更新されます。

補完システムは、`MM_HOME/config.json`（デフォルトは
`~/.mm`）から現在のワークスペースを解決するため、どのディレクトリからでも補完が機能します。
