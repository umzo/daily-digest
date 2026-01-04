# Daily Digest - セットアップガイド

このガイドでは、Daily Digest を AWS にデプロイして動作させるまでの手順を説明します。

## 前提条件

以下がインストール済みであること：

- Node.js 22.x 以上
- AWS CLI v2
- Terraform >= 1.0

## 1. AWS 認証情報の設定

```bash
# AWS CLI が設定済みか確認
aws sts get-caller-identity

# 未設定の場合
aws configure
# AWS Access Key ID: [入力]
# AWS Secret Access Key: [入力]
# Default region name: ap-northeast-1
# Default output format: json
```

## 2. プロジェクトのビルド

```bash
cd /path/to/daily-digest

# 依存関係インストール
npm install

# Lambda 用にビルド (dist/index.js が生成される)
npm run build
```

## 3. Terraform 変数ファイルの作成

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars` を編集：

```hcl
# 必須: GitHub 設定
github_owner  = "あなたのGitHubユーザー名"
github_repo   = "Obsidian Vault のリポジトリ名"
github_branch = "main"

# オプション: 必要に応じて変更
aws_region         = "ap-northeast-1"
schedule_enabled   = true  # false にすると定期実行を無効化
```

## 4. Terraform でインフラをデプロイ

```bash
cd terraform

# 初期化
terraform init

# プラン確認 (何が作成されるか確認)
terraform plan

# デプロイ実行
terraform apply
# "yes" と入力して確定
```

出力例：

```
lambda_function_name = "daily-digest"
lambda_function_url = "https://xxxxx.lambda-url.ap-northeast-1.on.aws/"
secrets_manager_secret_name = "daily-digest-secrets"
```

## 5. API キーの取得

### 5.1 ANTHROPIC_API_KEY

1. https://console.anthropic.com/ にアクセス
2. ログイン（アカウントがなければ作成）
3. 左メニュー → **Settings** → **API keys**
4. **Create Key** をクリック
5. 名前を入力（例: `daily-digest`）→ **Create Key**
6. 表示されたキー（`sk-ant-api03-...`）をコピー

> **注意**: キーは一度しか表示されないので必ずコピーしておくこと

### 5.2 FEEDLY_ACCESS_TOKEN

1. https://feedly.com/i/my にアクセスしてログイン
2. https://feedly.com/v3/auth/dev にアクセス
3. **Developer Access Token** が表示される
4. トークンをコピー

> **注意**: このトークンは個人利用向け。有効期限がある場合は定期的に更新が必要

### 5.3 GITHUB_TOKEN (Fine-grained PAT)

1. https://github.com/settings/tokens?type=beta にアクセス
2. **Generate new token** をクリック
3. 以下を設定：

| 項目 | 値 |
|------|-----|
| Token name | `daily-digest` |
| Expiration | 90 days（または Custom で長めに） |
| Repository access | **Only select repositories** → Obsidian Vault のリポジトリを選択 |

4. **Permissions** → **Repository permissions**:

| 権限 | レベル |
|------|--------|
| Contents | **Read and write** |

5. **Generate token** をクリック
6. 表示されたトークン（`github_pat_...`）をコピー

## 6. シークレットを AWS に登録

3つのキーが揃ったら、AWS Secrets Manager に登録：

```bash
aws secretsmanager put-secret-value \
  --secret-id daily-digest-secrets \
  --secret-string '{
    "ANTHROPIC_API_KEY": "sk-ant-api03-xxxxxxxx",
    "FEEDLY_ACCESS_TOKEN": "xxxxxxxx",
    "GITHUB_TOKEN": "github_pat_xxxxxxxx"
  }'
```

登録確認：

```bash
aws secretsmanager get-secret-value \
  --secret-id daily-digest-secrets \
  --query SecretString --output text | jq .
```

## 7. 動作確認（手動実行）

```bash
# Lambda を手動で呼び出し
aws lambda invoke \
  --function-name daily-digest \
  --payload '{}' \
  --cli-binary-format raw-in-base64-out \
  response.json

# 結果を確認
cat response.json
```

成功時の出力例：

```json
{
  "success": true,
  "articleCount": 42,
  "summaryCount": 42,
  "commitSha": "abc1234...",
  "path": "digests/2026-01-04.md"
}
```

## 8. ログ確認（エラー時）

```bash
# 最新のログを確認
aws logs tail /aws/lambda/daily-digest --follow
```

## 9. Obsidian で確認

```bash
cd /path/to/obsidian-vault
git pull origin main
# digests/YYYY-MM-DD.md が追加されていれば成功
```

---

## トラブルシューティング

| エラー | 原因と対処 |
|-------|-----------|
| `AccessDeniedException: Secrets Manager` | IAM ロールにシークレットへのアクセス権限がない → `terraform apply` を再実行 |
| `401 Unauthorized` (Feedly) | `FEEDLY_ACCESS_TOKEN` が無効 → 新しいトークンを取得して再設定 |
| `401 Unauthorized` (GitHub) | `GITHUB_TOKEN` が無効または権限不足 → Contents (Read/Write) を付与 |
| `rate_limit_exceeded` (Claude) | API レート制限 → 時間をおいて再実行 |
| `Task timed out` | Lambda タイムアウト → `lambda_timeout` を増やすか記事数を減らす |

## 運用コマンド

### スケジュール実行を一時停止

```bash
aws events disable-rule --name daily-digest-schedule
```

### スケジュール実行を再開

```bash
aws events enable-rule --name daily-digest-schedule
```

### シークレットを更新

```bash
aws secretsmanager put-secret-value \
  --secret-id daily-digest-secrets \
  --secret-string '{
    "ANTHROPIC_API_KEY": "新しいキー",
    "FEEDLY_ACCESS_TOKEN": "新しいトークン",
    "GITHUB_TOKEN": "新しいトークン"
  }'
```

### Lambda コードを更新

```bash
# 再ビルド
npm run build

# Terraform で更新
cd terraform
terraform apply
```

### インフラを削除

```bash
cd terraform
terraform destroy
# "yes" と入力して確定
```

> **注意**: Secrets Manager のシークレットは 30 日間の復旧期間後に完全削除されます
