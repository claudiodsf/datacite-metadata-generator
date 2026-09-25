#!/usr/bin/env node
'use strict';

/*
 * Behavioural tests for the generator and for the XML loader.
 *
 * The page is loaded in jsdom with the real jQuery, and the inline script that
 * ships inside the HTML is evaluated in that window, so the code under test is
 * exactly the code in the artifact. Documents produced here are written to
 * test/.cache/out/ so that run_tests.py can validate them against the official
 * schema and compare them with the fixtures they came from.
 *
 *     node test/test_dom.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'datacite_metadata_generator.html');
const FIXTURES = path.join(__dirname, 'fixtures');
const OUT_DIR = path.join(__dirname, '.cache', 'out');

let JSDOM;
let jqueryFactory;
try {
  ({ JSDOM } = require('jsdom'));
  jqueryFactory = require('jquery');
} catch (error) {
  console.error('SKIP  the DOM suite needs jsdom and jquery:');
  console.error('      cd test && npm install');
  console.error('      ' + error.message);
  process.exit(2);
}

const html = fs.readFileSync(HTML_PATH, 'utf8');
const scriptBlocks = [...html.matchAll(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)];
const inlineScript = scriptBlocks[scriptBlocks.length - 1][1];

// ---------------------------------------------------------------------------
// tiny test harness
// ---------------------------------------------------------------------------

const failures = [];
let passed = 0;
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log('\n' + name);
}

function test(name, body) {
  try {
    const result = body();
    if (result && typeof result.then === 'function') {
      throw new Error('test bodies must be synchronous: await outside test()');
    }
    passed += 1;
    console.log('  ok   ' + name);
  } catch (error) {
    failures.push({ suite: currentSuite, name: name, error: error });
    console.log('  FAIL ' + name + '\n       ' + error.message);
  }
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      (message || 'values differ') +
        '\n       expected: ' + JSON.stringify(expected) +
        '\n       actual:   ' + JSON.stringify(actual)
    );
  }
}

function ok(value, message) {
  if (!value) {
    throw new Error(message || 'expected a truthy value');
  }
}

function contains(haystack, needle, message) {
  if (String(haystack).indexOf(needle) === -1) {
    throw new Error((message || 'text not found') + ': ' + JSON.stringify(needle) +
                    '\n       in: ' + JSON.stringify(String(haystack).slice(0, 400)));
  }
}

function waitFor(predicate, description, attempts) {
  return new Promise((resolve, reject) => {
    let left = attempts || 400;
    const poll = () => {
      if (predicate()) {
        resolve();
      } else if (--left <= 0) {
        reject(new Error('timed out waiting for ' + description));
      } else {
        setTimeout(poll, 5);
      }
    };
    poll();
  });
}

// ---------------------------------------------------------------------------
// page harness
// ---------------------------------------------------------------------------

/** A fresh page with jQuery loaded and the shipped inline script initialised. */
async function newPage() {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'file://' + HTML_PATH });
  const window = dom.window;
  window.$ = window.jQuery = jqueryFactory(window);
  window.eval(inlineScript);
  // jQuery defers ready() by a tick; the drop-downs being filled in is the
  // signal that the page has finished setting itself up
  await waitFor(() => window.$('select[title="titleType"] option').length > 1,
                'the page to initialise');
  return window;
}

/** Load a fixture through the real file input, exactly as a user would. */
async function loadFixture(window, name) {
  const text = fs.readFileSync(path.join(FIXTURES, name), 'utf8');
  const input = window.document.querySelector('#xmlfile');
  const file = new window.File([text], name, { type: 'text/xml' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  window.$('#loadstatus').text('');
  window.$('#xmlfile').trigger('change');
  await waitFor(() => window.$('#loadstatus').text() !== '', 'the file to be loaded');
  return window.$('#loadstatus').text();
}

function generated(window) {
  return window.$('div.right code').text();
}

function statusDetails(window) {
  return window.$('#loadstatus').attr('title') || '';
}

function regenerate(window) {
  window.$('input.tag-value').eq(0).trigger('keyup');
}

function setValue(window, selector, value) {
  window.$(selector).first().val(value);
}

function writeOutput(name, xml) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name + '.xml'), xml);
}

function parse(window, xml) {
  const doc = new window.DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('generated document is not well-formed XML');
  }
  return doc;
}

function textOf(doc, localName) {
  const element = doc.getElementsByTagName(localName)[0];
  return element ? element.textContent : null;
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

async function main() {
  suite('generator');

  {
    const window = await newPage();

    test('the page sets itself up', () => {
      equal(window.$('#loadxml').length, 1, 'load button missing');
      equal(window.$('#xmlfile').length, 1, 'file input missing');
      equal(window.$('.keep-empty').length, 0, 'nothing should be marked initially');
      ok(window.$('select[title="resourceTypeGeneral"] option').length > 30,
         'the drop-downs should be populated');
    });

    test('escapes only what each context requires', () => {
      setValue(window, 'div.form.mandatory input[title="identifier"]', '10.1234/escaping');
      setValue(window, 'div.form.mandatory input[title="title"]',
               'A <b>bold</b> & "quoted" \'apostrophe\' > end');
      setValue(window, 'div.form.mandatory input[title="creatorName"]', "O'Brien & Sons");
      setValue(window, 'div.form.mandatory input[title="publisher"]', 'Pub "X" & Co');
      setValue(window, 'div.form.mandatory input[title="publisherIdentifier"]',
               'https://example.org/?a=1&b="2"&c=\'3\'');
      setValue(window, 'div.form.mandatory input[title="publicationYear"]', '2026');
      setValue(window, 'div.form.mandatory select[title="resourceTypeGeneral"]', 'Dataset');
      setValue(window, '#other input[title="version"]', "1.0 <beta> & 'rel'");
      regenerate(window);

      const xml = generated(window);
      writeOutput('generated-escaping', xml);

      equal(xml.indexOf('&apos;'), -1, 'apostrophes must not be escaped');

      const doc = parse(window, xml);
      equal(textOf(doc, 'title'), 'A <b>bold</b> & "quoted" \'apostrophe\' > end',
            'title text did not survive');
      equal(textOf(doc, 'creatorName'), "O'Brien & Sons");
      equal(textOf(doc, 'publisher'), 'Pub "X" & Co');
      equal(doc.getElementsByTagName('publisher')[0].getAttribute('publisherIdentifier'),
            'https://example.org/?a=1&b="2"&c=\'3\'', 'attribute value did not survive');
      equal(textOf(doc, 'version'), "1.0 <beta> & 'rel'");
    });

  }

  suite('generator: fields left empty');

  {
    const window = await newPage();

    test('nothing is written for the fields that were left empty', () => {
      setValue(window, 'div.form.mandatory input[title="identifier"]', '10.1234/minimal');
      regenerate(window);

      const xml = generated(window);
      contains(xml, '<identifier identifierType="DOI">10.1234/minimal</identifier>');
      equal(xml.indexOf('<version'), -1, 'version should be absent');
      equal(xml.indexOf('<creators>'), -1, 'creators should be absent');
      equal(xml.indexOf('<publisher'), -1, 'publisher should be absent');
    });
  }

  suite('loader: all-features.xml');

  {
    const window = await newPage();
    const status = await loadFixture(window, 'all-features.xml');

    test('loads without warnings', () => {
      equal(status.indexOf('problem'), -1, status);
      equal(status.indexOf('unrecognised'), -1, status);
    });

    test('fills single valued properties', () => {
      equal(window.$('div.form.mandatory input[title="identifier"]').val(), '10.1234/all-features');
      equal(window.$('div.form.mandatory select[title="resourceTypeGeneral"]').val(), 'Dataset');
      equal(window.$('select[title="relatedIdentifierType"]').first().val(), 'SWHID');
      equal(window.$('select[title="relationType"]').first().val(), 'Other');
      equal(window.$('[title="language"] input[title="language"]').val(), 'en');
      equal(window.$('#other select[title="numberType"]').first().val(), 'Article');
      equal(window.$('#other input[title="relatedItemIdentifier"]').first().val(), '1234-5678');
    });

    test('creates the repeated rows the document needs', () => {
      equal(window.$('div.form.mandatory [title="title"] > input.tag-value').length, 2);
      equal(window.$('#other [title="relatedItems"] [title="titles"] > [title="title"]').length, 2);
      equal(window.$('[title="dates"] > .tag-group').length, 2);
      equal(window.$('[title="geoLocationPolygon"] > [title="polygonPoint"]').length, 4);
      equal(window.$('[title="geoLocationPolygon"] > [title="inPolygonPoint"]').length, 1);
    });

    test('writes a document for the schema check', () => {
      const xml = generated(window);
      writeOutput('all-features', xml);
      equal(xml.indexOf('&apos;'), -1);
    });

    test('reading back its own output changes nothing', () => {
      const before = generated(window);
      window.loadMetadataXML(before);
      regenerate(window);
      equal(generated(window), before, 'the document is not stable across a round trip');
    });
  }

  suite('loader: real-world.xml');

  {
    const window = await newPage();
    const status = await loadFixture(window, 'real-world.xml');

    test('loads without warnings', () => {
      equal(status.indexOf('problem'), -1, status);
      equal(status.indexOf('unrecognised'), -1, status);
    });

    test('keeps xml:lang', () => {
      equal(window.$('div.form.mandatory [title="publisher"] input[title="xml:lang"]').val(), 'fr');
      equal(window.$('[title="subjects"] input[title="xml:lang"]').first().val(), 'en');
      equal(window.$('[title="descriptions"] input[title="xml:lang"]').first().val(), 'en');
    });

    test('keeps the empty <version/> element', () => {
      equal(window.$('.keep-empty').length, 1);
      contains(generated(window), '<version></version>', 'the empty element was dropped');
    });

    test('writes apostrophes literally and keeps escaped line breaks', () => {
      const xml = generated(window);
      writeOutput('real-world', xml);
      equal(xml.indexOf('&apos;'), -1, 'apostrophes must not be escaped');
      contains(xml, "d'exemple", 'apostrophes should stay literal');
      contains(xml, '&lt;br&gt;', 'escaped line breaks should be preserved');
    });

    test('reading back its own output changes nothing', () => {
      const before = generated(window);
      window.loadMetadataXML(before);
      regenerate(window);
      equal(generated(window), before, 'the document is not stable across a round trip');
    });
  }

  suite('loader: description-with-br.xml (documented limitation)');

  {
    const window = await newPage();
    const status = await loadFixture(window, 'description-with-br.xml');

    test('reports the <br/> element it cannot represent', () => {
      contains(status, 'unrecognised', 'expected a warning');
      contains(statusDetails(window), '<description>/<br>', 'missing the detail');
    });

    test('still loads the surrounding text', () => {
      contains(window.$('[title="descriptions"] input.tag-value').first().val(), 'first line');
    });
  }

  suite('loader: sloppy.xml');

  {
    const window = await newPage();
    const status = await loadFixture(window, 'sloppy.xml');

    test('reports problems and ignored values', () => {
      contains(status, '3 problems');
      contains(status, '3 unrecognised values ignored');
      const details = statusDetails(window);
      ['NotATitleType', 'Foo', 'Bogus', '<unknownElement>', '<resource>/@bogusAttribute',
       '<subject>/@unknownAttr'].forEach((needle) => {
        contains(details, needle, 'missing from the report');
      });
    });

    test('uses the valid fields', () => {
      equal(window.$('div.form.mandatory input[title="identifier"]').val(), '10.1234/sloppy');
      equal(window.$('div.form.mandatory [title="title"] > input.tag-value').length, 3);
      equal(window.$('div.form.mandatory input[title="resourceType"]').val(), 'Unknown general type');
      equal(window.$('[title="subjects"] input[title="classificationCode"]').first().val(),
            'https://example.org/x');
      equal(window.$('#other select[title="relatedItemType"]').first().val(), 'JournalArticle');
    });

    test('skips the values that are not in the controlled lists', () => {
      const titleTypes = window.$('div.form.mandatory [title="title"] > select.tag-attribute')
        .map(function () { return window.$(this).val(); }).get().join('|');
      equal(titleTypes, '|Subtitle|');
      equal(window.$('div.form.mandatory select[title="resourceTypeGeneral"]').val(), '');
      equal(window.$('#other select[title="numberType"]').first().val(), '');
      equal(window.$('#other input[title="number"]').first().val(), '42');
      writeOutput('sloppy', generated(window));
    });
  }

  suite('loader: rejects what it cannot read');

  {
    const window = await newPage();
    setValue(window, 'div.form.mandatory input[title="identifier"]', 'keep me');
    regenerate(window);
    const before = generated(window);
    const status = await loadFixture(window, 'malformed.xml');

    test('reports malformed XML', () => {
      contains(status, 'not well-formed XML');
      equal(status.indexOf('problem'), -1, 'should not be reported as a warning only');
    });

    test('leaves the form untouched', () => {
      equal(window.$('div.form.mandatory input[title="identifier"]').val(), 'keep me');
      equal(generated(window), before);
    });
  }

  {
    const window = await newPage();
    const status = await loadFixture(window, 'wrong-root.xml');

    test('reports a root element that is not <resource>', () => {
      contains(status, 'root element was expected');
      contains(status, 'metadata');
      equal(window.$('div.form.mandatory input[title="identifier"]').val(), '');
    });
  }

  suite('loader: reset and repeated use');

  {
    const window = await newPage();
    await loadFixture(window, 'all-features.xml');
    const big = {
      relatedIdentifiers: window.$('[title="relatedIdentifiers"] > .tag-group').length,
      clones: window.$('.xmlclone').length
    };
    await loadFixture(window, 'real-world.xml');
    const afterRealWorld = generated(window);

    test('the first fixture really did create rows', () => {
      equal(big.relatedIdentifiers, 1);
      ok(big.clones > 0, 'expected cloned rows from all-features.xml');
    });

    test('loading a second file leaves nothing of the first behind', () => {
      equal(window.$('[title="relatedIdentifiers"] > .tag-group').length, 1);
      equal(window.$('[title="subjects"] input[title="subject"]').val(), 'FDSN Network Code G');
      equal(window.$('[title="subjects"] input[title="classificationCode"]').val(), '',
            'a value from the previous document is still there');
      equal(window.$('[title="formats"] > .tag-group').length, 2,
            'formats should be the two from real-world.xml');
      equal(window.$('button.delete.group, button.delete.single-tag').length,
            window.$('.xmlclone').length, 'stray delete buttons left behind');
    });

    test('the empty version of the second document is kept', () => {
      contains(afterRealWorld, '<version></version>', 'the empty element was dropped');
      equal(window.$('.keep-empty').length, 1);
    });

    await loadFixture(window, 'all-features.xml');
    const afterSecondLoad = generated(window);

    test('the empty version does not leak into the next document', () => {
      equal(window.$('.keep-empty').length, 0);
      contains(afterSecondLoad, '<version>1</version>');
    });
  }

  suite('form: adding rows');

  {
    const window = await newPage();
    await loadFixture(window, 'all-features.xml');
    window.$('[title="relatedItems"] button.add.group').first().trigger('click');
    window.$('[title="creators"] button.add.group').first().trigger('click');

    test('the + button adds rows', () => {
      equal(window.$('#other [title="relatedItem"]').length, 2);
      equal(window.$('[title="creators"] > .tag-group').length, 2);
    });

    test('the new rows appear in the document once filled in', () => {
      const items = window.$('#other [title="relatedItem"]');
      items.eq(1).find('select[title="relatedItemType"]').val('Book');
      items.eq(1).find('select[title="relationType"]').val('Cites');
      items.eq(1).find('input[title="title"]').first().val('Second item');
      window.$('[title="creators"] > .tag-group').eq(1)
        .find('input[title="creatorName"]').first().val('Extra, Creator');
      regenerate(window);

      const xml = generated(window);
      equal((xml.match(/<relatedItem[\s>]/g) || []).length, 2);
      contains(xml, 'Second item');
      contains(xml, 'Extra, Creator');
    });

    test('empty added rows produce nothing', () => {
      const before = (generated(window).match(/<creator>/g) || []).length;
      window.$('[title="creators"] button.add.group').first().trigger('click');
      regenerate(window);
      equal((generated(window).match(/<creator>/g) || []).length, before,
            'the empty added row should not be written out');
    });
  }

  // -------------------------------------------------------------------------

  console.log('');
  if (failures.length) {
    console.log(failures.length + ' failure(s), ' + passed + ' passed');
    failures.forEach((failure) => {
      console.log('  ' + failure.suite + ' / ' + failure.name);
      console.log('    ' + failure.error.message.split('\n').join('\n    '));
    });
    process.exit(1);
  }
  console.log(passed + ' tests passed');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
