"""Custom DSPy LM that wraps `claude -p` via subprocess.

Uses the Claude Code CLI (subscription-based, no API key needed) instead of
direct API calls. Consistent with every other LLM call in the Margin codebase.

Reference: https://x.com/dhasandev/status/2009529865511555506
Key flags: --output-format json, --tools "", --no-session-persistence
"""

import json
import os
import subprocess
from dataclasses import dataclass, field

import dspy


def _clean_env() -> dict[str, str]:
    """Return env dict with CLAUDECODE removed (prevents nested session detection)."""
    return {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}


def _format_messages(messages: list[dict]) -> str:
    """Convert chat messages to a single prompt string for claude -p."""
    parts: list[str] = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            parts.append(content)
        elif role == "assistant":
            parts.append(f"[Previous response]\n{content}")
        else:
            parts.append(content)
    return "\n\n".join(parts)


# Minimal OpenAI-compatible response objects for DSPy's _process_completion
@dataclass
class _Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    def __iter__(self):
        yield "input_tokens", self.input_tokens
        yield "output_tokens", self.output_tokens
        yield "prompt_tokens", self.prompt_tokens
        yield "completion_tokens", self.completion_tokens
        yield "total_tokens", self.total_tokens


@dataclass
class _Message:
    content: str
    role: str = "assistant"


@dataclass
class _Choice:
    message: _Message
    index: int = 0
    finish_reason: str = "stop"


@dataclass
class _Response:
    choices: list[_Choice]
    model: str = "claude-cli"
    usage: _Usage = field(default_factory=_Usage)


class ClaudeCLI(dspy.BaseLM):
    """DSPy LM backed by `claude -p --model <model>`.

    Uses --output-format json for structured responses, --tools "" for pure LLM
    (no file access), and --no-session-persistence for stateless calls.

    Usage:
        lm = ClaudeCLI(model="sonnet")
        dspy.configure(lm=lm)
    """

    def __init__(
        self,
        model: str = "sonnet",
        temperature: float = 0.0,
        max_tokens: int = 4096,
        timeout: int = 120,
        **kwargs,
    ) -> None:
        super().__init__(
            model=model,
            model_type="chat",
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs,
        )
        self.timeout = timeout

    def _call_cli(self, prompt: str) -> tuple[str, dict]:
        """Call claude -p and return (result_text, raw_json)."""
        cmd = [
            "claude", "-p",
            "--model", self.model,
            "--output-format", "json",
            "--tools", "",
            "--no-session-persistence",
        ]

        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=self.timeout,
            env=_clean_env(),
        )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            raise RuntimeError(f"claude CLI failed (exit {result.returncode}): {stderr}")

        try:
            raw = json.loads(result.stdout)
        except json.JSONDecodeError:
            return result.stdout.strip(), {}

        if raw.get("is_error"):
            raise RuntimeError(f"claude CLI error: {raw.get('result', 'unknown')}")

        text = raw.get("result", result.stdout.strip())
        return text, raw

    def forward(
        self,
        prompt: str | None = None,
        messages: list[dict] | None = None,
        **kwargs,
    ) -> _Response:
        """Forward pass — returns OpenAI-compatible response for DSPy."""
        if messages:
            input_text = _format_messages(messages)
        elif prompt:
            input_text = prompt
        else:
            raise ValueError("Either prompt or messages must be provided")

        text, raw = self._call_cli(input_text)

        # Build usage from CLI response
        usage_data = raw.get("usage", {})
        usage = _Usage(
            input_tokens=usage_data.get("input_tokens", 0),
            output_tokens=usage_data.get("output_tokens", 0),
            prompt_tokens=usage_data.get("input_tokens", 0),
            completion_tokens=usage_data.get("output_tokens", 0),
            total_tokens=usage_data.get("input_tokens", 0) + usage_data.get("output_tokens", 0),
        )

        return _Response(
            choices=[_Choice(message=_Message(content=text))],
            model=self.model,
            usage=usage,
        )
