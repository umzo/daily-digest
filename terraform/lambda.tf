# ============================================================================
# Daily Digest - Lambda Function
# ============================================================================

# -----------------------------------------------------------------------------
# CloudWatch Log Group
# Lambda 関数のログ出力先
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.lambda_function_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.lambda_function_name}-logs"
  }
}

# -----------------------------------------------------------------------------
# Lambda Deployment Package
# tsdown でビルドした dist/index.js を ZIP 化
# -----------------------------------------------------------------------------

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../dist"
  output_path = "${path.module}/../dist/lambda.zip"
}

# -----------------------------------------------------------------------------
# Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "daily_digest" {
  function_name = var.lambda_function_name
  description   = "Daily Digest - Feedly から記事を収集・要約し、GitHub にコミット"

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  handler = var.lambda_handler
  runtime = var.lambda_runtime

  role = aws_iam_role.lambda.arn

  timeout     = var.lambda_timeout
  memory_size = var.lambda_memory_size

  environment {
    variables = {
      NODE_ENV     = var.environment
      GITHUB_OWNER = var.github_owner
      GITHUB_REPO  = var.github_repo
      GITHUB_BRANCH = var.github_branch
      SECRETS_NAME = var.secrets_name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda,
    aws_iam_role_policy.lambda_logs,
    aws_iam_role_policy.lambda_secrets,
  ]

  tags = {
    Name = var.lambda_function_name
  }
}

# -----------------------------------------------------------------------------
# Lambda Function URL (Optional)
# 手動実行用の HTTP エンドポイント
# -----------------------------------------------------------------------------

resource "aws_lambda_function_url" "daily_digest" {
  function_name      = aws_lambda_function.daily_digest.function_name
  authorization_type = "AWS_IAM"
}
