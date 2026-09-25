"""XML helpers: semantic comparison and schema validation.

`xmllint` (libxml2) is used for schema validation because it is present on
macOS and needs no installation. Comparison is done in Python, order and
whitespace insensitive, so that a round trip is judged on its content rather
than on the order in which the form happens to write the elements.
"""

import os
import subprocess
import xml.etree.ElementTree as ElementTree
from collections import Counter


def _local(tag):
    return tag.split("}")[-1]


def _normalise_text(text):
    return " ".join((text or "").split())


def _facts(path, element):
    """Flatten a document into a multiset of (path, text, attributes)."""
    here = path + "/" + _local(element.tag)
    attributes = tuple(
        sorted((_local(key), value) for key, value in element.attrib.items())
    )
    collected = [(here, _normalise_text(element.text), attributes)]
    for child in element:
        collected += _facts(here, child)
    return collected


def semantic_diff(expected_path, actual_path):
    """Return (missing, extra).

    Child order and whitespace are ignored, so an empty result means the two
    documents carry the same content. Attribute order is ignored as well, but
    attribute *values* are not.
    """
    expected = Counter(_facts("", ElementTree.parse(expected_path).getroot()))
    actual = Counter(_facts("", ElementTree.parse(actual_path).getroot()))
    return sorted((expected - actual).elements()), sorted((actual - expected).elements())


def describe_difference(items):
    lines = []
    for path, text, attributes in items:
        detail = path
        if text:
            detail += "  text=%r" % text[:120]
        if attributes:
            detail += "  attrs=%r" % (dict(attributes),)
        lines.append(detail)
    return lines


def is_well_formed(xml_path):
    try:
        ElementTree.parse(xml_path)
        return True
    except ElementTree.ParseError:
        return False


def have_xmllint():
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        if os.path.exists(os.path.join(directory, "xmllint")):
            return True
    return False


def validate(xsd_path, xml_path):
    """Validate with xmllint. Returns (is_valid, output)."""
    result = subprocess.run(
        ["xmllint", "--noout", "--schema", xsd_path, xml_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
    )
    return result.returncode == 0, result.stdout.strip()
