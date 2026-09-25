#!/usr/bin/env python3
"""Run every test suite for the DataCite metadata generator.

    python3 test/run_tests.py               # everything
    python3 test/run_tests.py --no-dom      # only the checks that need nothing installed
    python3 test/run_tests.py -k polygon    # only tests whose name matches

The static suite needs nothing but Python 3 (and node, for one check of the
escaping rules). The DOM suite runs the page in jsdom and needs jsdom and
jquery from test/package.json:

    cd test && npm install

Schema validation uses xmllint and downloads the official DataCite schema once
into test/.cache/, which git ignores.
"""

import argparse
import os
import shutil
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DOM_SUITE = os.path.join(HERE, "test_dom.js")
OUT_DIR = os.path.join(HERE, ".cache", "out")

SKIP_DOM = 2      # test_dom.js uses this exit code when its dependencies are missing


def run_dom_suite():
    """Run the jsdom suite. Returns (status, detail)."""
    if shutil.which("node") is None:
        return "skip", "node is not available"

    # start from a clean slate so that the documents validated by
    # test_outputs.py always come from this run
    shutil.rmtree(OUT_DIR, ignore_errors=True)

    result = subprocess.run(
        ["node", DOM_SUITE],
        cwd=REPO,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
    )
    if result.returncode == SKIP_DOM:
        return "skip", result.stdout.strip()

    sys.stdout.write(result.stdout)
    sys.stdout.flush()
    if result.returncode != 0:
        return "fail", "see the failures above"
    return "ok", ""


def filter_by_name(suite, pattern):
    """Keep only the tests whose id contains `pattern`."""
    kept = unittest.TestSuite()
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            kept.addTest(filter_by_name(test, pattern))
        elif pattern in test.id():
            kept.addTest(test)
    return kept


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--no-dom", action="store_true",
                        help="skip the jsdom suite and the checks on its output")
    parser.add_argument("-k", dest="pattern", default=None,
                        help="only run tests whose name contains this text")
    arguments = parser.parse_args()

    dom_status, dom_detail = ("skip", "skipped on request") if arguments.no_dom else run_dom_suite()

    loader = unittest.TestLoader()
    suite = loader.discover(start_dir=HERE, pattern="test_*.py")
    if arguments.pattern:
        suite = filter_by_name(suite, arguments.pattern)

    print("\n" + "=" * 72)
    print("static checks")
    print("=" * 72)
    sys.stdout.flush()
    # keep every line on stdout so the order is the order things happened
    result = unittest.TextTestRunner(verbosity=2, stream=sys.stdout).run(suite)

    skipped = len(result.skipped)
    print("\n" + "=" * 72)
    print("DOM suite (jsdom): %s%s" % (dom_status.upper(), " - " + dom_detail if dom_detail else ""))
    print("python tests: %d run, %d failures, %d errors, %d skipped"
          % (result.testsRun, len(result.failures), len(result.errors), skipped))
    print("=" * 72)

    if skipped:
        for test, reason in result.skipped:
            print("skipped %s: %s" % (test.id(), reason))

    failed = bool(result.failures or result.errors) or dom_status == "fail"
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
