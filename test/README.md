# Tests

Regression tests for the metadata generator. They cover the three things that
have actually broken here: the controlled lists drifting from the schema, the
inline copy of the script drifting from `src/dmg.js`, and the read / load /
save round trip losing or mangling data.

```
python3 test/run_tests.py              # everything
python3 test/run_tests.py --no-dom     # only the checks that need nothing installed
python3 test/run_tests.py -k polygon   # only tests whose name contains "polygon"
```

`run_tests.py` is the entry point and exits non-zero on failure. The suites can
also be run on their own:

```
python3 -m unittest discover -s test -p 'test_*.py' -v     # test_static.py + test_outputs.py
node test/test_dom.js                                      # the page, in jsdom
```

## What is tested

| Suite | Needs | Covers |
| --- | --- | --- |
| `test_static.py` | Python 3 (node for one check) | Controlled lists against the official schema; the page and `src/dmg.js` staying in step; page structure (balanced tags, every drop-down backed by a list, `xml:lang` only where the schema allows it, the polygon rows); the escaping rules |
| `test_dom.js` | node + jsdom + jquery | The real page: generating a document, loading the fixtures through the file input, the warnings and errors it reports, resetting between loads, adding rows, and escaping special characters |
| `test_outputs.py` | the DOM suite to have run | The documents `test_dom.js` produced: schema validity, and a content comparison against the fixture they came from |

Tests that cannot run (no node, no `xmllint`, no network for the schema) skip
with a message rather than failing.

## Dependencies

- **Python 3** — standard library only, no installation.
- **node** — for `test_dom.js` and for evaluating the escape functions.
  `cd test && npm install` pulls in jsdom and jQuery (`test/package.json`).
  jQuery is pinned to 3.1.1, the version the page itself loads.
- **xmllint** (libxml2) — for schema validation. Present on macOS.
- **Network**, once: the official schema is downloaded to `test/.cache/schema/`
  and reused afterwards. It is not vendored here because the schemas are
  published by DataCite at <https://schema.datacite.org>.

## Layout

```
test/
  run_tests.py             entry point: runs the DOM suite, then the Python ones
  test_static.py           sources and page structure (no browser)
  test_dom.js              the page in jsdom (generator + loader)
  test_outputs.py          validates what test_dom.js produced
  package.json             jsdom and jQuery for the DOM suite
  lib/project.py           reads the page and src/dmg.js
  lib/schema.py            downloads and caches the official schema
  lib/xmlutil.py           schema validation and order-insensitive comparison
  fixtures/                documents used by the tests (see below)
  .cache/                  schema and generated documents (git ignored)
```

## Fixtures

| File | Purpose |
| --- | --- |
| `all-features.xml` | Every property the form supports, with a value. Valid; must survive a round trip unchanged. |
| `real-world.xml` | The messy shapes that harvested records have: apostrophes, escaped `&lt;br&gt;` in the description, multi-line and space padded text, `xml:lang`, an empty `<version/>`. Valid; must survive a round trip unchanged. |
| `sloppy.xml` | Not valid on purpose: values outside the controlled lists, an unknown element and unknown attributes. The loader must use what it understands and report the rest. |
| `description-with-br.xml` | Valid, but `<description>` contains a real `<br/>` child. The form cannot represent it; the test records that it is reported as an unrecognised value. |
| `malformed.xml` | Not well-formed, must be rejected. |
| `wrong-root.xml` | Well-formed, but the root is not `<resource>`; must be rejected. |

## Notes

- The two round-trip fixtures are compared with an order and whitespace
  insensitive diff (`lib/xmlutil.py`), because the generator writes elements in
  the order of the form's sections and normalises whitespace. Comparing the
  files as text would drown the real differences; comparing them this way, the
  assertion is that **no content changes at all**.
- `lib/schema.py` derives the controlled lists from the schema includes rather
  than hard-coding them, so bumping the kernel version only means changing
  `SCHEMA_VERSION` and the `kernelVersion` in the sources.
- Adding a controlled list to the page requires adding it to
  `OPTION_LIST_TO_SCHEMA_TYPE` in `test_static.py`; otherwise the test fails and
  tells you so, which is the point.
