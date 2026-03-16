"""Single-type DSPy optimization for Margin writing quality."""

import argparse
import json
import sys
from pathlib import Path

import dspy

from claude_lm import ClaudeCLI
from margin_metric import compliance_metric
from margin_module import MarginWriter, load_corrections, load_high_signal_rules
from training_data import ADVERSARIAL_PROMPTS, REGISTER_MAP, expand_prompts


def build_trainset(writing_type: str, target_count: int = 10) -> list[dspy.Example]:
    """Build a training set of DSPy Examples for the given writing type."""
    prompts = expand_prompts(
        {writing_type: ADVERSARIAL_PROMPTS[writing_type]},
        target_count=target_count,
    )

    register = REGISTER_MAP[writing_type]
    corrections = load_corrections(writing_type)
    rules = load_high_signal_rules(writing_type)

    examples: list[dspy.Example] = []
    for prompt_text in prompts[writing_type]:
        ex = dspy.Example(
            writing_type=writing_type,
            prompt=prompt_text,
            register=register,
            corrections=corrections,
            rules=rules,
        ).with_inputs("writing_type", "prompt", "register", "corrections", "rules")
        examples.append(ex)

    return examples


def optimize_type(writing_type: str, target_count: int = 10) -> dict:
    """Run MIPROv2 optimization for a single writing type.

    Returns a summary dict with results.
    """
    print(f"[{writing_type}] Building training set...", file=sys.stderr)
    trainset = build_trainset(writing_type, target_count=target_count)
    print(f"[{writing_type}] {len(trainset)} training examples", file=sys.stderr)

    program = MarginWriter()

    print(f"[{writing_type}] Starting MIPROv2 optimization...", file=sys.stderr)
    optimizer = dspy.MIPROv2(
        metric=compliance_metric,
        num_threads=1,
    )

    optimized = optimizer.compile(
        program,
        trainset=trainset,
        max_bootstrapped_demos=3,
        max_labeled_demos=3,
    )

    # Save optimized program
    output_dir = Path(__file__).parent / "optimized_prompts"
    output_dir.mkdir(exist_ok=True)
    program_path = output_dir / f"{writing_type}.json"
    optimized.save(str(program_path))
    print(f"[{writing_type}] Saved optimized program to {program_path}", file=sys.stderr)

    # Evaluate on training set to get pass rate
    passes = 0
    total = len(trainset)
    for ex in trainset:
        try:
            pred = optimized(
                writing_type=ex.writing_type,
                prompt=ex.prompt,
                register=ex.register,
                corrections=ex.corrections,
                rules=ex.rules,
            )
            score = compliance_metric(ex, pred)
            if score > 0.5:
                passes += 1
        except Exception as e:
            print(f"[{writing_type}] Eval error: {e}", file=sys.stderr)

    pass_rate = passes / total if total > 0 else 0.0

    summary = {
        "writing_type": writing_type,
        "training_examples": total,
        "pass_rate": round(pass_rate, 3),
        "passes": passes,
        "program_path": str(program_path),
    }

    # Save human-readable summary
    summary_path = output_dir / f"{writing_type}_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"[{writing_type}] Summary saved to {summary_path}", file=sys.stderr)

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Optimize Margin writing for a specific type using DSPy MIPROv2"
    )
    parser.add_argument(
        "--type",
        required=True,
        choices=list(ADVERSARIAL_PROMPTS.keys()),
        help="Writing type to optimize",
    )
    parser.add_argument(
        "--prompts",
        type=int,
        default=10,
        help="Number of training prompts per type (default: 10)",
    )
    args = parser.parse_args()

    lm = ClaudeCLI(model="sonnet")
    dspy.configure(lm=lm)

    summary = optimize_type(args.type, target_count=args.prompts)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
