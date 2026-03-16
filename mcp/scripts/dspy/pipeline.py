"""Full GEPA + optimization pipeline for Margin writing rules.

Sequential steps:
  1. Detect repeat corrections (mechanical + semantic matching)
  2. Diagnose why rules failed
  3. Propose fixes (review or apply)
  4. Re-export writing profile via margin CLI
  5. Run optimization (if available)
  6. Record optimization run

Usage: python pipeline.py             # review mode
       python pipeline.py --apply     # apply fixes + re-export
"""

import argparse
import importlib.util
import json
import os
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

# Add parent to path so gepa package resolves
sys.path.insert(0, str(Path(__file__).resolve().parent))

from margin_gepa.detect_repeat import detect_repeats
from margin_gepa.diagnose import run_diagnoses
from margin_gepa.propose_fix import propose_fixes

DB_PATH = Path(os.path.expanduser("~/.margin/margin.db"))
MARGIN_CLI = Path(os.path.expanduser("~/.local/bin/margin"))


def step_header(num: int, title: str) -> None:
    print(f"\n{'='*60}")
    print(f"  Step {num}: {title}")
    print(f"{'='*60}\n")


def run_export_profile() -> bool:
    """Run margin export profile to regenerate artifacts."""
    if not MARGIN_CLI.exists():
        print(f"Warning: margin CLI not found at {MARGIN_CLI}")
        return False

    try:
        result = subprocess.run(
            [str(MARGIN_CLI), "export", "profile"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            print("Profile exported successfully.")
            if result.stdout.strip():
                print(result.stdout.strip())
            return True
        else:
            print(f"Export failed (exit {result.returncode}): {result.stderr[:200]}")
            return False
    except subprocess.TimeoutExpired:
        print("Export timed out.")
        return False
    except Exception as e:
        print(f"Export error: {e}")
        return False


def try_run_optimization() -> dict | None:
    """Attempt to run optimization if optimize_all.py exists.

    Returns optimization result dict or None.
    """
    opt_path = Path(__file__).resolve().parent / "optimized_prompts" / "optimize_all.py"
    if not opt_path.exists():
        print(f"Optimization script not found at {opt_path}, skipping.")
        return None

    try:
        spec = importlib.util.spec_from_file_location("optimize_all", str(opt_path))
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            if hasattr(module, "run_optimization"):
                return module.run_optimization()
            else:
                print("optimize_all.py has no run_optimization() function, skipping.")
        return None
    except Exception as e:
        print(f"Optimization error: {e}")
        return None


def record_optimization_run(result: dict) -> None:
    """Record an optimization run to the optimization_runs table."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.execute(
            """INSERT INTO optimization_runs
               (id, writing_type, pass_rate, total_samples, mean_dimension, prompt_config, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                result.get("id", __import__("uuid").uuid4().hex),
                result.get("writing_type", "general"),
                result.get("pass_rate", 0.0),
                result.get("total_samples", 0),
                result.get("mean_dimension", 0.0),
                json.dumps(result.get("prompt_config", {})),
                int(time.time()),
            ),
        )
        conn.commit()
        conn.close()
        print(f"Recorded optimization run: pass_rate={result.get('pass_rate', 0):.2%}")
    except sqlite3.Error as e:
        print(f"Failed to record optimization run: {e}")


def run_eval() -> dict | None:
    """Run a basic eval by checking current rule coverage.

    Returns a summary dict or None.
    """
    try:
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row

        # Count rules by writing type
        rows = conn.execute(
            """SELECT writing_type, COUNT(*) as count,
                      SUM(CASE WHEN severity = 'must-fix' THEN 1 ELSE 0 END) as must_fix
               FROM writing_rules
               GROUP BY writing_type
               ORDER BY count DESC"""
        ).fetchall()

        # Count repeat corrections by status
        status_rows = conn.execute(
            """SELECT status, COUNT(*) as count
               FROM repeat_corrections
               GROUP BY status"""
        ).fetchall()

        conn.close()

        rule_summary = {r["writing_type"]: {"total": r["count"], "must_fix": r["must_fix"]} for r in rows}
        status_summary = {r["status"]: r["count"] for r in status_rows}

        total_rules = sum(r["count"] for r in rows)
        total_applied = status_summary.get("applied", 0)
        total_pending = status_summary.get("pending", 0)

        print(f"Rules: {total_rules} total across {len(rows)} writing types")
        print(f"Repeat corrections: {total_applied} applied, {total_pending} pending")

        return {
            "total_rules": total_rules,
            "rules_by_type": rule_summary,
            "repeat_status": status_summary,
        }
    except sqlite3.Error as e:
        print(f"Eval error: {e}")
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Full GEPA pipeline for Margin writing rules")
    parser.add_argument("--apply", action="store_true", help="Apply fixes and re-export profile")
    args = parser.parse_args()

    # Step 1: Detect repeat corrections
    step_header(1, "Detect Repeat Corrections")
    try:
        counts = detect_repeats()
    except Exception as e:
        print(f"Detection failed: {e}")
        counts = {}

    # Step 2: Diagnose failures
    step_header(2, "Diagnose Rule Failures")
    try:
        diagnosed = run_diagnoses()
    except Exception as e:
        print(f"Diagnosis failed: {e}")
        diagnosed = 0

    # Step 3: Propose fixes
    step_header(3, "Propose Fixes")
    try:
        proposed = propose_fixes(apply=args.apply)
    except Exception as e:
        print(f"Proposal failed: {e}")
        proposed = 0

    # Steps 4-7: Non-critical, failures don't block
    if args.apply:
        step_header(4, "Export Writing Profile")
        try:
            run_export_profile()
        except Exception as e:
            print(f"Export failed (non-critical): {e}")

    step_header(5, "Eval")
    try:
        eval_result = run_eval()
    except Exception as e:
        print(f"Eval failed (non-critical): {e}")
        eval_result = None

    step_header(6, "Optimization")
    try:
        opt_result = try_run_optimization()
        if opt_result:
            record_optimization_run(opt_result)
    except Exception as e:
        print(f"Optimization failed (non-critical): {e}")

    # Final summary
    print(f"\n{'='*60}")
    print("  Pipeline Complete")
    print(f"{'='*60}")
    print(f"  Matches found: {sum(counts.get(k, 0) for k in ('mechanical', 'semantic'))}")
    print(f"  Diagnosed: {diagnosed}")
    print(f"  Proposals: {proposed}")
    if args.apply:
        print("  Fixes applied and profile re-exported.")
    else:
        print("  Review mode -- run with --apply to execute.")


if __name__ == "__main__":
    main()
