"""Checks on the documents the DOM suite produced.

`node test/test_dom.js` writes whatever the page generated into
`test/.cache/out/`. Here those documents are validated against the official
DataCite schema and compared, content by content, with the fixture they were
loaded from. Run `test/run_tests.py` to do both in the right order.
"""

import os
import sys
import unittest
import xml.etree.ElementTree as ElementTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib import project, schema, xmlutil  # noqa: E402

NAMESPACE = "{http://datacite.org/schema/kernel-4}"

# document produced by the page -> fixture it was loaded from
ROUND_TRIPS = {
    "all-features.xml": "all-features.xml",
    "real-world.xml": "real-world.xml",
}

# documents the page must be able to write, and one it must not be able to
VALID_DOCUMENTS = ["all-features.xml", "real-world.xml", "generated-escaping.xml"]
INVALID_DOCUMENTS = ["sloppy.xml"]


class GeneratedDocuments(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out_dir = os.path.join(project.CACHE_DIR, "out")
        if not os.path.isdir(cls.out_dir):
            raise unittest.SkipTest(
                "no generated documents: run `node test/test_dom.js` first "
                "(test/run_tests.py runs both suites)"
            )

    def path(self, name):
        return os.path.join(self.out_dir, name)

    def xsd(self):
        if not xmlutil.have_xmllint():
            self.skipTest("xmllint is not available")
        try:
            return schema.ensure()
        except schema.SchemaUnavailable as error:
            self.skipTest("schema unavailable: %s" % error)

    def test_every_output_is_well_formed(self):
        for name in sorted(os.listdir(self.out_dir)):
            if name.endswith(".xml"):
                with self.subTest(document=name):
                    self.assertTrue(xmlutil.is_well_formed(self.path(name)))

    def test_valid_documents_validate_against_the_schema(self):
        xsd = self.xsd()
        for name in VALID_DOCUMENTS:
            with self.subTest(document=name):
                self.assertTrue(os.path.exists(self.path(name)), "%s was not produced" % name)
                valid, message = xmlutil.validate(xsd, self.path(name))
                self.assertTrue(valid, message)

    def test_the_sloppy_fixture_produces_an_invalid_document(self):
        # resourceTypeGeneral="Foo" is not a controlled value, so the attribute
        # is skipped and the mandatory attribute ends up missing. The point is
        # that the generator reports this instead of writing something wrong.
        xsd = self.xsd()
        valid, message = xmlutil.validate(xsd, self.path("sloppy.xml"))
        self.assertFalse(valid, "the sloppy fixture should not produce a valid document")
        self.assertIn("resourceTypeGeneral", message)

    def test_reading_and_writing_back_loses_no_content(self):
        for fixture, produced in sorted(ROUND_TRIPS.items()):
            with self.subTest(fixture=fixture):
                missing, extra = xmlutil.semantic_diff(
                    os.path.join(project.FIXTURES_DIR, fixture), self.path(produced)
                )
                self.assertEqual(
                    [], xmlutil.describe_difference(missing),
                    "content lost while reading and writing back",
                )
                self.assertEqual(
                    [], xmlutil.describe_difference(extra),
                    "content added while reading and writing back",
                )

    def test_no_unnecessary_escapes(self):
        for name in sorted(VALID_DOCUMENTS):
            with self.subTest(document=name):
                with open(self.path(name), encoding="utf-8") as handle:
                    self.assertNotIn("&apos;", handle.read())

    def test_escaped_values_decode_back_to_the_original_text(self):
        root = ElementTree.parse(self.path("generated-escaping.xml")).getroot()
        self.assertEqual(
            "A <b>bold</b> & \"quoted\" 'apostrophe' > end",
            root.find(NAMESPACE + "titles/" + NAMESPACE + "title").text,
        )
        publisher = root.find(NAMESPACE + "publisher")
        self.assertEqual('Pub "X" & Co', publisher.text)
        self.assertEqual(
            "https://example.org/?a=1&b=\"2\"&c='3'",
            publisher.get("publisherIdentifier"),
        )

    def test_the_empty_version_element_is_preserved(self):
        root = ElementTree.parse(self.path("real-world.xml")).getroot()
        version = root.find(NAMESPACE + "version")
        self.assertIsNotNone(version, "the empty <version/> element was dropped")
        self.assertEqual("", (version.text or "").strip())


if __name__ == "__main__":
    unittest.main()
