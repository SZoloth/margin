"""Wraps compliance-check.ts as a DSPy metric."""

import json
import subprocess
import tempfile
from pathlib import Path

# Project root: three levels up from this file (dspy/ -> scripts/ -> mcp/ -> margin/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def run_compliance_check(text: str) -> dict:
    """Run the TypeScript compliance checker and return parsed JSON result.

    Returns the full ComplianceResult dict, or a fallback failure dict on error.
    """
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False
    ) as f:
        f.write(text)
        tmp_path = f.name

    try:
        result = subprocess.run(
            ["npx", "tsx", "mcp/scripts/compliance-check.ts", "--json", tmp_path],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(PROJECT_ROOT),
        )
        # compliance-check exits 2 on failure, 0 on pass — both produce valid JSON
        stdout = result.stdout.strip()
        if not stdout:
            return _fallback_result(f"No output from compliance check. stderr: {result.stderr[:200]}")
        return json.loads(stdout)
    except subprocess.TimeoutExpired:
        return _fallback_result("Compliance check timed out")
    except json.JSONDecodeError as e:
        return _fallback_result(f"Invalid JSON from compliance check: {e}")
    except Exception as e:
        return _fallback_result(f"Compliance check error: {e}")
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def _fallback_result(error: str) -> dict:
    """Return a worst-case ComplianceResult when the checker fails."""
    return {
        "mechanical": {
            "killWords": [],
            "slopPatterns": [],
            "voiceViolations": [],
            "structuralTells": [],
        },
        "summary": {
            "mechanicalIssues": 99,
            "dimensionScore": 0,
            "pass": False,
        },
        "_error": error,
    }


def compliance_metric(example, prediction, trace=None) -> float:
    """DSPy metric wrapping the Margin compliance checker.

    Returns a continuous score in [0, 1]:
      (1 - min(mechanical_ratio, 1)) * 0.5 + dimension_score/50 * 0.5

    For DSPy binary pass: 0 mechanical issues AND dimension >= 35.
    """
    prose = getattr(prediction, "prose", "")
    if not prose or not prose.strip():
        return 0.0

    result = run_compliance_check(prose)
    summary = result.get("summary", {})

    mechanical_issues = summary.get("mechanicalIssues", 99)
    dimension_score = summary.get("dimensionScore", 0)

    # Continuous score
    mechanical_ratio = mechanical_issues / 5.0
    mechanical_component = (1.0 - min(mechanical_ratio, 1.0)) * 0.5
    dimension_component = (dimension_score / 50.0) * 0.5
    continuous = mechanical_component + dimension_component

    # Binary pass for DSPy optimization
    binary_pass = mechanical_issues == 0 and dimension_score >= 35

    if trace is not None:
        # During optimization, DSPy uses trace to decide whether to keep demos
        return binary_pass

    return continuous
