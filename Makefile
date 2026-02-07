.PHONY: build deploy test lint format clean

# ビルド
build:
	npm run build

# デプロイ（ビルド + Terraform apply）
deploy: build
	cd terraform && terraform apply -auto-approve

# デプロイ（確認あり）
deploy-confirm: build
	cd terraform && terraform apply

# 強制再デプロイ（Lambda を置き換え）
deploy-force: build
	cd terraform && terraform apply -auto-approve -replace=aws_lambda_function.daily_digest

# Terraform plan
plan: build
	cd terraform && terraform plan

# テスト
test:
	npm test

# テスト（ウォッチモード）
test-watch:
	npm run test:watch

# Lint
lint:
	npm run lint

# フォーマット
format:
	npm run format

# ビルド成果物をクリーン
clean:
	rm -rf dist/

# Terraform 初期化
tf-init:
	cd terraform && terraform init -backend-config="bucket=$(TF_STATE_BUCKET)"

# Terraform state を S3 に移行
tf-migrate:
	cd terraform && terraform init -migrate-state -backend-config="bucket=$(TF_STATE_BUCKET)"

# 既存リソースをインポート
tf-import:
	cd terraform && terraform import aws_lambda_function.daily_digest daily-digest
	cd terraform && terraform import aws_iam_role.lambda daily-digest-lambda-role
	cd terraform && terraform import aws_cloudwatch_log_group.lambda /aws/lambda/daily-digest
	cd terraform && terraform import aws_cloudwatch_event_rule.daily_digest daily-digest-schedule
	cd terraform && terraform import aws_cloudwatch_event_target.daily_digest daily-digest-schedule/daily-digest
	cd terraform && terraform import aws_lambda_permission.eventbridge daily-digest/AllowEventBridgeInvoke
	cd terraform && terraform import aws_secretsmanager_secret.daily_digest daily-digest-secrets
	cd terraform && terraform import aws_lambda_function_url.daily_digest daily-digest
