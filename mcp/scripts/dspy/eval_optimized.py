"""Evaluate optimized DSPy programs against adversarial prompts."""

import argparse
import json
import sys
from pathlib import Path

import dspy

from claude_lm import ClaudeCLI
from margin_metric import run_compliance_check
from margin_module import MarginWriter, load_corrections, load_high_signal_rules
from training_data import ADVERSARIAL_PROMPTS, REGISTER_MAP


OPTIMIZED_DIR = Path(__file__).parent / "optimized_prompts"


def eval_type(writing_type: str) -> dict:
    """Evaluate an optimized program for a single writing type.

    Returns EvalResult-compatible dict.
    """
    program_path = OPTIMIZED_DIR / f"{writing_type}.json"
    if not program_path.exists():
        return {
            "writing_type": writing_type,
            "error": f"No optimized program found at {program_path}",
            "samples": [],
        }

    program = MarginWriter()
    program.load(str(program_path))

    prompt = ADVERSARIAL_PROMPTS[writing_type]
    register = REGISTER_MAP[writing_type]
    corrections = load_corrections(writing_type)
    rules = load_high_signal_rules(writing_type)

    # Run the 3 adversarial samples (same prompt, 3 runs to measure variance)
    samples: list[dict] = []
    passes = 0

    for run_idx in range(3):
        try:
            pred = program(
                writing_type=writing_type,
                prompt=prompt,
                register=register,
                corrections=corrections,
                rules=rules,
            )
            prose = pred.prose
            result = run_compliance_check(prose)
            summary = result.get("summary", {})
            is_pass = summary.get("pass", False)
            if is_pass:
                passes += 1

            samples.append({
                "run": run_idx + 1,
                "prose_preview": prose[:200] + "..." if len(prose) > 200 else prose,
                "mechanical_issues": summary.get("mechanicalIssues", -1),
                "dimension_score": summary.get("dimensionScore", -1),
                "pass": is_pass,
            })
        except Exception as e:
            samples.append({
                "run": run_idx + 1,
                "error": str(e),
                "pass": False,
            })

    return {
        "writing_type": writing_type,
        "prompt": prompt,
        "pass_rate": round(passes / 3, 3),
        "passes": passes,
        "total": 3,
        "samples": samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate optimized DSPy programs against adversarial prompts"
    )
    parser.add_argument(
        "--type",
        choices=list(ADVERSARIAL_PROMPTS.keys()),
        help="Evaluate a single writing type (default: all)",
    )
    args = parser.parse_args()

    lm = ClaudeCLI(model="sonnet")
    dspy.configure(lm=lm)

    types_to_eval = [args.type] if args.type else list(ADVERSARIAL_PROMPTS.keys())

    results: list[dict] = []
    for wtype in types_to_eval:
        print(f"Evaluating {wtype}...", file=sys.stderr)
        result = eval_type(wtype)
        results.append(result)
        pr = result.get("pass_rate", 0)
        print(f"  {wtype}: {pr:.0%} pass rate", file=sys.stderr)

    # Summary
    total_passes = sum(r.get("passes", 0) for r in results)
    total_samples = sum(r.get("total", 0) for r in results)
    overall_rate = total_passes / total_samples if total_samples > 0 else 0

    output = {
        "overall_pass_rate": round(overall_rate, 3),
        "total_passes": total_passes,
        "total_samples": total_samples,
        "results": results,
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
