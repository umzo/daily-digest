# Terraform 既存リソースインポート

手動または別環境で作成した AWS リソースを Terraform 管理下に置く手順。

## 前提条件

- Terraform 設定ファイル（.tf）が作成済み
- AWS CLI でリソースにアクセス可能

## 手順

### 1. 既存リソースの確認

```bash
# Lambda
aws lambda get-function --function-name <name> --query 'Configuration.FunctionArn'

# IAM Role
aws iam get-role --role-name <name> --query 'Role.Arn'

# CloudWatch Log Group
aws logs describe-log-groups --log-group-name-prefix <prefix>

# EventBridge Rule
aws events describe-rule --name <name>

# Secrets Manager
aws secretsmanager describe-secret --secret-id <name>

# S3 Bucket
aws s3api head-bucket --bucket <name>
```

### 2. インポートコマンド

```bash
# Lambda Function
terraform import aws_lambda_function.<resource_name> <function_name>

# IAM Role
terraform import aws_iam_role.<resource_name> <role_name>

# IAM Role Policy (inline)
terraform import aws_iam_role_policy.<resource_name> <role_name>:<policy_name>

# CloudWatch Log Group
terraform import aws_cloudwatch_log_group.<resource_name> <log_group_name>

# EventBridge Rule
terraform import aws_cloudwatch_event_rule.<resource_name> <rule_name>

# EventBridge Target
terraform import aws_cloudwatch_event_target.<resource_name> <rule_name>/<target_id>

# Lambda Permission
terraform import aws_lambda_permission.<resource_name> <function_name>/<statement_id>

# Secrets Manager Secret
terraform import aws_secretsmanager_secret.<resource_name> <secret_name_or_arn>

# Lambda Function URL
terraform import aws_lambda_function_url.<resource_name> <function_name>

# S3 Bucket
terraform import aws_s3_bucket.<resource_name> <bucket_name>
```

### 3. Makefile にインポートターゲットを追加

```makefile
# 既存リソースをインポート
tf-import:
	cd terraform && terraform import aws_lambda_function.example example-function
	cd terraform && terraform import aws_iam_role.example example-role
	# ... 他のリソース
```

### 4. インポート後の確認

```bash
# 差分確認
terraform plan

# state 確認
terraform state list
terraform state show <resource_address>
```

## よくあるエラー

### リソースが見つからない

```
Error: Cannot import non-existent remote object
```

→ リソース名や AWS プロファイル/リージョンを確認

### 設定の差分がある

インポート後に `terraform plan` で差分が出る場合：
1. .tf ファイルを実際のリソース設定に合わせる
2. または `terraform apply` で設定を上書き（注意が必要）

## Tips

- インポート前に `terraform plan` で作成予定リソースを確認
- 存在しないリソースはエラーになるだけなので、まとめてインポート可能
- インポート後は必ず `terraform plan` で差分を確認
