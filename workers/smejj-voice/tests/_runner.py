"""Tiny dependency-free test runner so the smejj.com voice worker unit tests
run WITHOUT pytest installed (pip has no network in the sandbox).

Usage from a test module:  `if __name__ == "__main__": run_module_tests(globals())`
It executes every top-level `test_*` callable, prints PASS/FAIL and exits
non-zero on any failure.
"""
import os
import sys
import traceback

_SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)


def run_module_tests(namespace) -> int:
    tests = sorted(
        (name, fn)
        for name, fn in namespace.items()
        if name.startswith("test_") and callable(fn)
    )
    passed = 0
    failed = 0
    for name, fn in tests:
        try:
            fn()
        except Exception:  # noqa: BLE001 - report every failure
            failed += 1
            print(f"FAIL {name}")
            traceback.print_exc()
        else:
            passed += 1
            print(f"PASS {name}")
    print(f"--- {passed} passed, {failed} failed ---")
    return 1 if failed else 0
