# ============================================================================
# Daily Digest - IAM Roles and Policies
# ============================================================================

# -----------------------------------------------------------------------------
# Lambda Execution Role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "lambda" {
  name = "${var.lambda_function_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.lambda_function_name}-lambda-role"
  }
}

# -----------------------------------------------------------------------------
# Lambda Policy - CloudWatch Logs
# -----------------------------------------------------------------------------

resource "aws_iam_role_policy" "lambda_logs" {
  name = "${var.lambda_function_name}-logs-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.lambda.arn}:*"
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Lambda Policy - Secrets Manager
# -----------------------------------------------------------------------------

resource "aws_iam_role_policy" "lambda_secrets" {
  name = "${var.lambda_function_name}-secrets-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.daily_digest.arn
      }
    ]
  })
}
