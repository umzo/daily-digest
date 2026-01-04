# ============================================================================
# Daily Digest - Variables
# ============================================================================

# -----------------------------------------------------------------------------
# AWS Configuration
# -----------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "ap-northeast-1"
}

variable "environment" {
  description = "Environment name (e.g., dev, prod)"
  type        = string
  default     = "prod"
}

# -----------------------------------------------------------------------------
# Lambda Configuration
# -----------------------------------------------------------------------------

variable "lambda_function_name" {
  description = "Name of the Lambda function"
  type        = string
  default     = "daily-digest"
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 900 # 15 minutes
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 256
}

variable "lambda_runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs22.x"
}

variable "lambda_handler" {
  description = "Lambda handler function"
  type        = string
  default     = "index.handler"
}

# -----------------------------------------------------------------------------
# GitHub Configuration
# -----------------------------------------------------------------------------

variable "github_owner" {
  description = "GitHub repository owner"
  type        = string
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
}

variable "github_branch" {
  description = "GitHub target branch"
  type        = string
  default     = "main"
}

# -----------------------------------------------------------------------------
# Schedule Configuration
# -----------------------------------------------------------------------------

variable "schedule_expression" {
  description = "EventBridge schedule expression (cron or rate)"
  type        = string
  default     = "cron(0 21 * * ? *)" # 6:00 JST (21:00 UTC)
}

variable "schedule_enabled" {
  description = "Whether the schedule is enabled"
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# Secrets Configuration
# -----------------------------------------------------------------------------

variable "secrets_name" {
  description = "Name of the Secrets Manager secret"
  type        = string
  default     = "daily-digest-secrets"
}

# -----------------------------------------------------------------------------
# CloudWatch Logs Configuration
# -----------------------------------------------------------------------------

variable "log_retention_days" {
  description = "CloudWatch Logs retention period in days"
  type        = number
  default     = 14
}
