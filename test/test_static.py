"""Static checks on the sources and on the shipped page.

These need no browser and no installation: they read the two copies of the
application (the page and `src/dmg.js`) and the official schema.

    python3 -m unittest discover -s test -p 'test_*.py' -v
"""

import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib import project, schema  # noqa: E402

# Which controlled list in the page corresponds to which XML type in the schema.
# A list that is not listed here fails `test_option_lists_are_known`, so a new
# controlled list cannot quietly escape being checked against the schema.
OPTION_LIST_TO_SCHEMA_TYPE = {
    "contributorType": "contributorType",
    "dateType": "dateType",
    "descriptionType": "descriptionType",
    "funderIdentifierType": "funderIdentifierType",
    "nameType": "nameType",
    "numberType": "numberType",
    "relatedIdentifierType": "relatedIdentifierType",
    "relatedItemIdentifierType": "relatedIdentifierType",
    "relatedItemType": "resourceType",
    "relationType": "relationType",
    "resourceTypeGeneral": "resourceType",
    "titleType": "titleType",
}

# Properties that declare xml:lang in the kernel 4.7 schema. The form must
# offer the field on these and only these; title, creatorName and
# contributorName appear twice (once inside RelatedItem).
XML_LANG_ROW_TITLES = {
    "creatorName",
    "contributorName",
    "description",
    "publisher",
    "rights",
    "subject",
    "title",
}
XML_LANG_FIELD_COUNT = 10


def have_node():
    for directory in os.environ.get("PATH", "").split(os.pathsep):
        if os.path.exists(os.path.join(directory, "node")):
            return True
    return False


class ControlledLists(unittest.TestCase):
    """The drop-downs are the interface to the schema's controlled lists."""

    @classmethod
    def setUpClass(cls):
        cls.source_lists = project.option_values(project.read_js())
        cls.inline_lists = project.option_values(project.inline_script())

    def test_option_lists_are_known(self):
        unknown = sorted(set(self.source_lists) - set(OPTION_LIST_TO_SCHEMA_TYPE))
        self.assertEqual(
            [], unknown, "add these lists to OPTION_LIST_TO_SCHEMA_TYPE: %s" % unknown
        )

    def test_lists_have_no_duplicate_values(self):
        for name, values in sorted(self.source_lists.items()):
            with self.subTest(list=name):
                self.assertEqual(len(values), len(set(values)), "%s repeats a value" % name)

    def test_inline_copy_matches_source(self):
        self.assertEqual(self.source_lists, self.inline_lists)

    def test_lists_match_the_schema(self):
        try:
            enumerations = schema.include_enumerations()
        except schema.SchemaUnavailable as error:
            self.skipTest("schema unavailable: %s" % error)

        for name, type_name in sorted(OPTION_LIST_TO_SCHEMA_TYPE.items()):
            with self.subTest(list=name):
                expected = set(enumerations.get(type_name, []))
                self.assertTrue(expected, "no enumerations found for <%s>" % type_name)
                self.assertEqual(
                    expected,
                    set(self.source_lists[name]),
                    "%s does not match <%s>" % (name, type_name),
                )


class SourceSync(unittest.TestCase):
    """The page embeds a minified copy of src/dmg.js: they must not drift."""

    @classmethod
    def setUpClass(cls):
        cls.source = project.read_js()
        cls.inline = project.inline_script()

    def test_same_functions_in_both_copies(self):
        self.assertEqual(
            project.function_names(self.source), project.function_names(self.inline)
        )

    def test_same_prototype_methods_in_both_copies(self):
        self.assertEqual(
            project.prototype_methods(self.source), project.prototype_methods(self.inline)
        )

    def test_kernel_version_is_consistent(self):
        source_version = project.js_string(self.source, "kernelVersion")
        self.assertTrue(source_version, "kernelVersion not found in src/dmg.js")
        self.assertEqual(source_version, project.js_string(self.inline, "kernelVersion"))
        self.assertIn("Kernel %s" % source_version, project.read_html())

    def test_namespace_and_schema_location(self):
        self.assertEqual(
            "http://datacite.org/schema/kernel-4",
            project.js_string(self.source, "kernelNamespace"),
        )
        self.assertEqual(
            project.js_string(self.source, "kernelNamespace"),
            project.js_string(self.source, "DATACITE_NAMESPACE"),
        )
        self.assertIn("kernel-4/metadata.xsd", project.js_string(self.source, "kernelSchema"))


class PageStructure(unittest.TestCase):
    def test_tags_are_balanced(self):
        _, _, unclosed, errors = project.parse_page()
        self.assertEqual([], errors)
        self.assertEqual([], unclosed)

    def test_rows_and_fields_have_titles(self):
        # the serializer keys off the title attribute: a field without one is
        # silently dropped from the generated document
        for style_class in ("tag", "tag-value", "tag-attribute"):
            with self.subTest(class_=style_class):
                self.assertEqual([], project.elements_without_title(style_class))

    def test_every_select_has_a_controlled_list(self):
        known = project.option_values(project.inline_script())
        missing = sorted({title for title in project.select_titles() if title not in known})
        self.assertEqual([], missing, "select without optionValues (crashes on load)")

    def test_every_controlled_list_is_used(self):
        known = project.option_values(project.inline_script())
        unused = sorted(set(known) - set(project.select_titles()))
        self.assertEqual([], unused, "controlled list not used by any drop-down")

    def test_xml_lang_fields_are_on_the_right_properties(self):
        rows = [row for title, row in project.fields_in_rows() if title == "xml:lang"]
        self.assertEqual(XML_LANG_ROW_TITLES, set(rows))
        self.assertEqual(XML_LANG_FIELD_COUNT, len(rows))

    def test_polygon_rows_follow_the_schema(self):
        # geoLocationPolygon is an xs:sequence: at least four polygonPoint,
        # then an optional inPolygonPoint. A duplicated or misplaced row is
        # invisible in the generated document (empty rows produce nothing), so
        # the form itself has to be checked.
        self.assertEqual(
            ["polygonPoint"] * 4 + ["inPolygonPoint"],
            project.child_row_titles("geoLocationPolygon"),
        )

    def test_file_input_cannot_reach_the_serializer(self):
        found = [attrs for tag, attrs in project.elements() if attrs.get("id") == "xmlfile"]
        self.assertEqual(1, len(found), "the file input is missing")
        attributes = found[0]
        self.assertIn("hidden", attributes.get("class", ""))
        self.assertNotIn("tag-value", attributes.get("class", ""))
        self.assertNotIn("tag-attribute", attributes.get("class", ""))
        self.assertNotIn("title", attributes)


class Escaping(unittest.TestCase):
    """Only the characters that are required in each context are escaped."""

    SAMPLE = "a & b < c > d \" e ' f"

    def test_apostrophes_are_never_escaped(self):
        for label, text in (
            ("src/dmg.js", project.read_js()),
            ("inline script", project.inline_script()),
        ):
            with self.subTest(source=label):
                self.assertNotIn("apos", text)

    def test_both_encoders_exist(self):
        for name in ("encodeXML", "encodeXMLText"):
            with self.subTest(encoder=name):
                self.assertTrue(project.encoder_body(project.inline_script(), name))

    def test_encoder_behaviour(self):
        if not have_node():
            self.skipTest("node is not available")

        inline = project.inline_script()
        program = (
            "String.prototype.encodeXML=function(){%s};"
            "String.prototype.encodeXMLText=function(){%s};"
            "var s=%s;"
            "process.stdout.write(JSON.stringify([s.encodeXML(),s.encodeXMLText()]));"
        ) % (
            project.encoder_body(inline, "encodeXML"),
            project.encoder_body(inline, "encodeXMLText"),
            json.dumps(self.SAMPLE),
        )

        result = subprocess.run(
            ["node", "-e", program],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True,
        )
        self.assertEqual(0, result.returncode, result.stderr)
        attribute_value, text_content = json.loads(result.stdout)

        # inside a double quoted attribute the quote must be escaped, the
        # apostrophe must not
        self.assertEqual(
            "a &amp; b &lt; c &gt; d &quot; e ' f", attribute_value
        )
        # in element content neither quote needs escaping
        self.assertEqual("a &amp; b &lt; c &gt; d \" e ' f", text_content)


if __name__ == "__main__":
    unittest.main()
