#!/usr/bin/env python3
"""Python mirror of the TCO engine used by the validation harness.

The engine of record is ``src/engine.js`` (a pure, dependency-free ES module
that the client-facing tool runs directly in the browser). To guarantee the
Python validation checks exactly the same numbers the shipped tool produces,
this mirror shells out to Node to execute ``src/engine.js`` rather than keeping
a second hand-written copy of the math in lockstep. This avoids silent drift
between two implementations.

Requires Node (available in the sandbox: node 22). No third-party Python deps.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
ENGINE_JS = os.path.join(REPO, "src", "engine.js")

# A tiny ESM runner that reads inputs JSON from argv[1], runs computeFleet, and
# prints the result JSON to stdout. Written next to engine.js so the relative
# import resolves.
_RUNNER = """
import {{ readFileSync }} from 'node:fs';
import {{ computeFleet }} from {engine!r};
const inputs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = computeFleet(inputs);
process.stdout.write(JSON.stringify(out));
"""


def compute_fleet(inputs: dict) -> dict:
    """Run src/engine.js computeFleet(inputs) via Node and return the result."""
    runner_src = _RUNNER.format(engine=ENGINE_JS.replace("\\", "/"))
    with tempfile.NamedTemporaryFile(
        "w", suffix=".mjs", dir=HERE, delete=False, encoding="utf-8"
    ) as runner:
        runner.write(runner_src)
        runner_path = runner.name
    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", dir=HERE, delete=False, encoding="utf-8"
    ) as inp:
        json.dump(inputs, inp)
        inp_path = inp.name
    try:
        proc = subprocess.run(
            ["node", runner_path, inp_path],
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as exc:  # pragma: no cover
        raise SystemExit(
            f"Node engine failed:\n{exc.stderr}\n{exc.stdout}"
        ) from exc
    finally:
        for p in (runner_path, inp_path):
            try:
                os.unlink(p)
            except OSError:
                pass
    return json.loads(proc.stdout)


if __name__ == "__main__":
    fx = json.load(
        open(os.path.join(HERE, "fixtures", "demo_case.json"), encoding="utf-8")
    )
    result = compute_fleet(fx["inputs"])
    print(json.dumps(result["results"], indent=2))
