# ============================================================================
# Daily Digest - EventBridge Scheduler
# ============================================================================

# -----------------------------------------------------------------------------
# EventBridge Rule
# 毎日 9:10 JST (0:10 UTC) に Lambda を起動
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "daily_digest" {
  name                = "${var.lambda_function_name}-schedule"
  description         = "Daily Digest を毎日 9:10 JST に実行"
  schedule_expression = var.schedule_expression
  state               = var.schedule_enabled ? "ENABLED" : "DISABLED"

  tags = {
    Name = "${var.lambda_function_name}-schedule"
  }
}

# -----------------------------------------------------------------------------
# EventBridge Target
# Lambda 関数を呼び出し対象に設定
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_event_target" "daily_digest" {
  rule      = aws_cloudwatch_event_rule.daily_digest.name
  target_id = var.lambda_function_name
  arn       = aws_lambda_function.daily_digest.arn
}

# -----------------------------------------------------------------------------
# Lambda Permission for EventBridge
# EventBridge から Lambda を呼び出す権限
# -----------------------------------------------------------------------------

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.daily_digest.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_digest.arn
}
