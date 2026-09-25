"""Access to the application sources and to the structure of the page.

The shipped artifact is `datacite_metadata_generator.html`, which embeds a
minified copy of `src/dmg.js` and of `src/dmg.css`. Everything here reads those
files as text, because there is no build step to import from.
"""

import os
import re
from html.parser import HTMLParser

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HTML_PATH = os.path.join(REPO, "datacite_metadata_generator.html")
JS_PATH = os.path.join(REPO, "src", "dmg.js")
CSS_PATH = os.path.join(REPO, "src", "dmg.css")
FIXTURES_DIR = os.path.join(REPO, "test", "fixtures")
CACHE_DIR = os.path.join(REPO, "test", ".cache")

# HTML elements that never have a closing tag, so they must not affect balance
VOID_ELEMENTS = frozenset(
    "area base br col embed hr img input link meta param source track wbr".split()
)


def read_html():
    with open(HTML_PATH, encoding="utf-8") as handle:
        return handle.read()


def read_js():
    with open(JS_PATH, encoding="utf-8") as handle:
        return handle.read()


class _PageParser(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.elements = []          # list of (tag, {attribute: value})
        self.parents = []           # attributes of the enclosing element
        self.stack = []             # list of (tag, attributes)
        self.errors = []            # unbalanced tags

    def _record(self, tag, attrs):
        self.elements.append((tag, attrs))
        self.parents.append(self.stack[-1][1] if self.stack else None)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        self._record(tag, attributes)
        if tag not in VOID_ELEMENTS:
            self.stack.append((tag, attributes))

    def handle_startendtag(self, tag, attrs):
        self._record(tag, dict(attrs))

    def handle_endtag(self, tag):
        if tag in VOID_ELEMENTS:
            return
        if not self.stack:
            self.errors.append("unexpected </%s>" % tag)
        elif self.stack[-1][0] == tag:
            self.stack.pop()
        else:
            self.errors.append("</%s> closes <%s>" % (tag, self.stack[-1][0]))
            while self.stack and self.stack.pop()[0] != tag:
                pass


_parse_cache = {}


def parse_page():
    """Parse the shipped page. Returns (elements, parents, unclosed, errors)."""
    if "page" not in _parse_cache:
        parser = _PageParser()
        parser.feed(read_html())
        parser.close()
        _parse_cache["page"] = (
            parser.elements,
            parser.parents,
            [tag for tag, _ in parser.stack],
            parser.errors,
        )
    return _parse_cache["page"]


def elements():
    return parse_page()[0]


def element_parents():
    return parse_page()[1]


def fields_in_rows():
    """Yield (field_title, row_title) for every field inside a div.tag row."""
    for (tag, attrs), parent in zip(elements(), element_parents()):
        if tag not in ("input", "select") or not parent:
            continue
        if "tag-value" not in _class_list(attrs) and "tag-attribute" not in _class_list(attrs):
            continue
        yield attrs.get("title"), parent.get("title")


def child_row_titles(row_title):
    """Titles of the div.tag rows nested directly below the named row."""
    found = []
    for (tag, attrs), parent in zip(elements(), element_parents()):
        if parent and parent.get("title") == row_title and "tag" in _class_list(attrs):
            found.append(attrs.get("title"))
    return found


def _class_list(attrs):
    return attrs.get("class", "").split()


def titles_of(elements_attr, style_class=None, tag=None):
    """Collect the `title` attribute of elements, optionally filtered."""
    found = []
    for element_tag, attrs in elements():
        if tag and element_tag != tag:
            continue
        if style_class and style_class not in _class_list(attrs):
            continue
        if "title" in attrs:
            found.append(attrs["title"])
    return found


def select_titles():
    """The `title` of every <select> in the page (each one needs optionValues)."""
    return titles_of(None, tag="select")


def elements_without_title(style_class, tag=None):
    """Elements of a class that carry a `title` (used to spot missing ones)."""
    missing = []
    for element_tag, attrs in elements():
        if tag and element_tag != tag:
            continue
        if style_class in _class_list(attrs) and "title" not in attrs:
            missing.append((element_tag, attrs.get("class", "")))
    return missing


def inline_script():
    """The body of the inline <script> that mirrors src/dmg.js."""
    blocks = re.findall(
        r'<script type="text/javascript">(.*?)</script>', read_html(), re.S
    )
    assert blocks, "no inline <script type=\"text/javascript\"> found in the page"
    return blocks[-1]


# --------------------------------------------------------------------------
# Reading values out of the JavaScript sources
# --------------------------------------------------------------------------

def option_values(js_text):
    """Parse the optionValues table, resolving the aliases to their list."""
    values = {}
    aliases = {}
    for name, body in re.findall(
        r'optionValues\["(\w+)"\]\s*=\s*\[(.*?)\];', js_text, re.S
    ):
        values[name] = re.findall(r'"([^"]*)"', body)
    for name, target in re.findall(
        r'optionValues\["(\w+)"\]\s*=\s*optionValues\["(\w+)"\];', js_text
    ):
        aliases[name] = target
    for name, target in aliases.items():
        values[name] = values.get(target, [])
    return values


def js_string(js_text, name):
    """Value of a `name = "value"` assignment (kernelVersion, ...)."""
    match = re.search(r'\b%s\s*=\s*"([^"]*)"' % re.escape(name), js_text)
    return match.group(1) if match else None


def function_names(js_text):
    """Names of declared functions, so the two copies can be compared."""
    return set(re.findall(r'\bfunction\s+([A-Za-z_$][\w$]*)\s*\(', js_text))


def prototype_methods(js_text):
    return set(re.findall(r'String\.prototype\.(\w+)\s*=', js_text))


def encoder_body(js_text, name):
    """Body of `String.prototype.<name> = function() { ... };`.

    The bodies are single statements without braces, which keeps this simple.
    """
    match = re.search(
        r'String\.prototype\.%s\s*=\s*function\s*\(\)\s*\{([^}]*)\}' % re.escape(name),
        js_text,
    )
    return match.group(1) if match else None
