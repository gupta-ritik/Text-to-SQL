import os
from typing import Any


def run_deepeval(cases: list[dict]) -> dict[str, Any]:
    """
    Runs DeepEval referenceless RAG metrics when available.

    DeepEval's current RAG metrics take LLMTestCase objects with
    input/actual_output/retrieval_context. The evaluator intentionally keeps
    this separate from LangSmith production tracing.
    """
    try:
        from deepeval import evaluate
        from deepeval.metrics import (
            ContextualRelevancyMetric,
            ContextualPrecisionMetric,
            ContextualRecallMetric,
            AnswerRelevancyMetric,
            FaithfulnessMetric,
        )
        from deepeval.test_case import LLMTestCase
    except Exception as exc:
        return {"enabled": False, "reason": f"DeepEval unavailable: {exc}"}

    metrics = [
        ContextualRelevancyMetric(threshold=None, include_reason=True),
        ContextualPrecisionMetric(threshold=None, include_reason=True),
        ContextualRecallMetric(threshold=None, include_reason=True),
        AnswerRelevancyMetric(threshold=None, include_reason=True),
        FaithfulnessMetric(threshold=None, include_reason=True),
    ]

    test_cases = [
        LLMTestCase(
            input=c["question"],
            actual_output=c["answer"],
            retrieval_context=[c["retrieved_context"]],
        )
        for c in cases
    ]

    try:
        result = evaluate(test_cases=test_cases, metrics=metrics)
        return {
            "enabled": True,
            "raw": str(result),
            "note": "DeepEval metric results are emitted by the installed DeepEval version.",
        }
    except Exception as exc:
        return {
            "enabled": False,
            "reason": f"DeepEval evaluation failed: {exc}",
        }
