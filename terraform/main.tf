# ============================================================================
# Daily Digest - Terraform Main Configuration
# ============================================================================

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  backend "s3" {
    key          = "daily-digest/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
    # bucket は環境変数 TF_STATE_BUCKET で指定
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "daily-digest"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Data source for current AWS region
data "aws_region" "current" {}
