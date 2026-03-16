"""Optimize all 9 writing types sequentially."""

import json
import sys

import dspy

from claude_lm import ClaudeCLI
from optimize import optimize_type
from training_data import ADVERSARIAL_PROMPTS


def main() -> None:
    lm = ClaudeCLI(model="sonnet")
    dspy.configure(lm=lm)

    results: list[dict] = []
    types = list(ADVERSARIAL_PROMPTS.keys())

    for i, writing_type in enumerate(types, 1):
        print(f"\n{'='*60}", file=sys.stderr)
        print(f"[{i}/{len(types)}] Optimizing: {writing_type}", file=sys.stderr)
        print(f"{'='*60}", file=sys.stderr)

        try:
            summary = optimize_type(writing_type)
            results.append(summary)
            print(
                f"[{writing_type}] Done — pass rate: {summary['pass_rate']:.0%}",
                file=sys.stderr,
            )
        except Exception as e:
            error_result = {
                "writing_type": writing_type,
                "error": str(e),
                "pass_rate": 0.0,
            }
            results.append(error_result)
            print(f"[{writing_type}] FAILED: {e}", file=sys.stderr)

    # Final summary
    successful = [r for r in results if "error" not in r]
    avg_pass_rate = (
        sum(r["pass_rate"] for r in successful) / len(successful)
        if successful
        else 0.0
    )

    output = {
        "total_types": len(types),
        "successful": len(successful),
        "failed": len(types) - len(successful),
        "average_pass_rate": round(avg_pass_rate, 3),
        "results": results,
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
