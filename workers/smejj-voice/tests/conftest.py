"""Pytest bootstrap: put the package src/ on sys.path so tests import the
smejj.com voice worker without installation. Kept dependency-free so the same
tests also run standalone via `python3 tests/test_*.py`.
"""
import os
import sys

_SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)
