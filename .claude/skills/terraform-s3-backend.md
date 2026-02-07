# Terraform S3 Backend セットアップ

Terraform state を S3 で管理するためのセットアップ手順。
Terraform v1.10+ の `use_lockfile` を使用し、DynamoDB 不要でロック機能を実現。

## 前提条件

- Terraform >= 1.10
- AWS CLI 設定済み
- direnv インストール済み

## セットアップ手順

### 1. main.tf に backend 設定を追加

```hcl
terraform {
  backend "s3" {
    key          = "<project-name>/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
    # bucket は環境変数 TF_STATE_BUCKET で指定
  }
}
```

### 2. .envrc を作成

```bash
# AWS
export AWS_PROFILE=<your-profile>

# Terraform S3 Backend
export TF_STATE_BUCKET=<your-bucket-name>
```

### 3. .envrc.example を作成（リポジトリ用）

```bash
# AWS
export AWS_PROFILE=your-profile

# Terraform S3 Backend
export TF_STATE_BUCKET=your-terraform-state-bucket
```

### 4. .gitignore に追加

```gitignore
# Environment
.envrc

# Terraform
terraform/.terraform/
terraform/*.tfstate
terraform/*.tfstate.*
terraform/*.tfvars
terraform/*.tfvars.json
!terraform/*.tfvars.example
```

### 5. Makefile にターゲット追加

```makefile
# Terraform 初期化
tf-init:
	cd terraform && terraform init -backend-config="bucket=$(TF_STATE_BUCKET)"

# Terraform state を S3 に移行
tf-migrate:
	cd terraform && terraform init -migrate-state -backend-config="bucket=$(TF_STATE_BUCKET)"
```

### 6. S3 バケット作成 & 移行

```bash
# バケット作成
aws s3 mb s3://<bucket-name> --region ap-northeast-1

# バージョニング有効化
aws s3api put-bucket-versioning \
  --bucket <bucket-name> \
  --versioning-configuration Status=Enabled

# direnv 許可
direnv allow

# state 移行
make tf-migrate
```

## 複数プロジェクトでの運用

同じバケットで複数プロジェクトを管理可能。`key` で区別：

```
s3://<bucket>/
├── project-a/terraform.tfstate
├── project-b/terraform.tfstate
└── project-c/terraform.tfstate
```

## 注意事項

- `use_lockfile = true` により、操作中は `*.tflock` ファイルが S3 に作成される
- ロック解除: `terraform force-unlock <lock-id>`
- Public リポジトリの場合、バケット名は環境変数で管理し .envrc を gitignore すること
