"""Fetch and cache the official DataCite metadata schema.

The schemas are not vendored into this repository (they belong to DataCite and
are published at schema.datacite.org), so they are downloaded on first use into
`test/.cache/`, which is ignored by git. Tests that need the schema skip
themselves with a clear message if it cannot be obtained.
"""

import gzip
import os
import re
import urllib.error
import urllib.request

from . import project

SCHEMA_VERSION = "4.7"
BASE_URL = "https://schema.datacite.org/meta/kernel-%s/" % SCHEMA_VERSION
TIMEOUT = 60


class SchemaUnavailable(RuntimeError):
    """Raised when the official schema is neither cached nor downloadable."""


def schema_dir():
    return os.path.join(project.CACHE_DIR, "schema", "kernel-%s" % SCHEMA_VERSION)


def _download(url, destination):
    request = urllib.request.Request(url, headers={"Accept-Encoding": "identity"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            data = response.read()
    except (urllib.error.URLError, OSError) as error:
        raise SchemaUnavailable("cannot download %s (%s)" % (url, error))

    if data[:2] == b"\x1f\x8b":                      # server ignored our header
        data = gzip.decompress(data)
    head = data.lstrip()[:64].lower()
    if head.startswith(b"<!doctype html") or head.startswith(b"<html"):
        raise SchemaUnavailable("%s did not return a schema" % url)

    os.makedirs(os.path.dirname(destination), exist_ok=True)
    with open(destination, "wb") as handle:
        handle.write(data)


def ensure():
    """Make sure the schema and its includes are cached; return metadata.xsd."""
    directory = schema_dir()
    root = os.path.join(directory, "metadata.xsd")

    if not os.path.exists(root):
        _download(BASE_URL + "metadata.xsd", root)

    with open(root, encoding="utf-8") as handle:
        root_text = handle.read()

    for location in sorted(set(re.findall(r'schemaLocation="([^"]+)"', root_text))):
        if not location.startswith("include/"):
            continue
        target = os.path.join(directory, location)
        if not os.path.exists(target):
            _download(BASE_URL + location, target)

    return root


def include_enumerations():
    """Controlled lists from the schema includes.

    Returns {"resourceType": ["Audiovisual", ...], "dateType": [...], ...} using
    the name of the included file, which is the name of the XML type.
    """
    ensure()
    include_dir = os.path.join(schema_dir(), "include")
    lists = {}

    if not os.path.isdir(include_dir):
        return lists

    for name in sorted(os.listdir(include_dir)):
        if not (name.startswith("datacite-") and name.endswith(".xsd")):
            continue
        type_name = re.sub(r"^datacite-|(-v\d+)?\.xsd$", "", name)
        with open(os.path.join(include_dir, name), encoding="utf-8") as handle:
            body = handle.read()
        lists[type_name] = re.findall(r'<xs:enumeration value="([^"]*)"', body)

    return lists


def xml_lang_elements():
    """Names of elements that declare the xml:lang attribute in the schema."""
    root = ensure()
    with open(root, encoding="utf-8") as handle:
        text = handle.read()

    # collapse the whole document so the element declaration preceding each
    # xml:lang reference can be found without relying on line breaks
    flat = re.sub(r"\s+", " ", text)
    names = []
    for match in re.finditer(r'ref="xml:lang"', flat):
        before = flat[: match.start()]
        declarations = list(re.finditer(r'<xs:element name="([^"]+)"', before))
        if declarations:
            names.append(declarations[-1].group(1))
    return sorted(set(names))
