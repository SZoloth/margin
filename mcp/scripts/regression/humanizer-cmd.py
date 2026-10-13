#!/usr/bin/env python3
"""stdin: a draft. stdout: humanizer-12b's rewrite. Text completion, EOS stop only."""
import hashlib, json, os, sys, urllib.request

PF = os.path.expanduser(os.environ.get("HUMANIZER_PROMPT_FILE", "~/humanizer-model/prompt_format.json"))
URL = os.environ.get("HUMANIZER_URL", "http://127.0.0.1:8080/completion")
instr = json.load(open(PF))["instr"]

def build(draft: str) -> str:
    return instr + "\n\n" + draft.strip() + "\n\n### Rewritten:\n\n"

if "--selftest" in sys.argv:
    got = hashlib.sha256(build("X").encode()).hexdigest()[:16]
    print(got, "OK" if got == "cc51d66b4c593fbe" else "MISMATCH (expected cc51d66b4c593fbe)")
    sys.exit(0 if got == "cc51d66b4c593fbe" else 1)

body = {
    "prompt": build(sys.stdin.read()),
    "temperature": 1.0, "top_p": 0.95, "top_k": 0, "min_p": 0.0,
    "repeat_penalty": 1.0, "n_predict": 2048, "stop": [], "cache_prompt": False,
}
req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json"})
print(json.load(urllib.request.urlopen(req, timeout=300))["content"].strip())
