# ============================================================================
# Daily Digest - Secrets Manager
# ============================================================================

# -----------------------------------------------------------------------------
# Secrets Manager Secret
# シークレットの値は手動で設定する必要があります
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "daily_digest" {
  name        = var.secrets_name
  description = "API keys and tokens for Daily Digest Lambda function"

  tags = {
    Name = var.secrets_name
  }
}

# Note: シークレットの値は Terraform で管理せず、AWS Console または CLI で設定してください
#
# 必要なシークレットキー:
# - ANTHROPIC_API_KEY: Claude API キー
# - FEEDLY_ACCESS_TOKEN: Feedly OAuth トークン
# - GITHUB_TOKEN: GitHub Personal Access Token (Fine-grained)
#
# AWS CLI での設定例:
# aws secretsmanager put-secret-value \
#   --secret-id daily-digest-secrets \
#   --secret-string '{"ANTHROPIC_API_KEY":"sk-ant-...","FEEDLY_ACCESS_TOKEN":"...","GITHUB_TOKEN":"ghp_..."}'
