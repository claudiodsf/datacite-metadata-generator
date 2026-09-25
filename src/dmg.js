$(document).ready(function() {
  var kernelVersion = "4.7";
  var kernelNamespace = "http://datacite.org/schema/kernel-4";
  var kernelSchema = "http://schema.datacite.org/meta/kernel-4/metadata.xsd";
  var kernelSchemaLocation = kernelNamespace + " " + kernelSchema;
  var header = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + br() + "<resource xmlns=\"" + kernelNamespace + "\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"" + kernelSchemaLocation + "\">" + br();
  $("select[title]").each(function(){
     var tagName = name($(this));
     ps($(this),optionValues[tagName]);
  });
  $("body").on("keyup", "input", function(event) {
    event.preventDefault();
    var xml = header;
    $("div.section").each(function(){
        xml += process($(this));
    });
    xml += ct("resource");
    metadata = xml;
    $("div.right code").text(xml);
    $(".right").show();
  });
  $("body").on("change", "select", function(event) {
    event.preventDefault();
    $("input").eq(0).keyup();
  });
  $("#reset").bind("click", function(event) {
    event.preventDefault();
    location.reload(true);
  });
  $("#selectall").bind("click", function(event) {
    event.preventDefault();
    st($("div code").get(0));
  });
  $("#loadxml").bind("click", function(event) {
    event.preventDefault();
    $("input#xmlfile").trigger("click");
  });
  $("input#xmlfile").bind("change", function(event) {
    var input = this;
    var file = input.files && input.files[0];
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function(loadEvent) {
      var report = loadMetadataXML(String(loadEvent.target.result));
      if (report.error) {
        $("span#loadstatus").attr("title", "");
        showLoadStatus(report.error, "error");
      } else {
        expandSectionsWithData();
        reportLoadedXML(file.name, report);
        $("input.tag-value").eq(0).trigger("keyup");
      }
      input.value = "";
    };
    reader.onerror = function() {
      showLoadStatus("The selected file could not be read.", "error");
      input.value = "";
    };
    reader.readAsText(file);
  });
  $("button.add.group").bind("click", function(event) {
    event.preventDefault();
    var d = $(this).parent().find(".tag-group:first").clone();
    $(d).find("input,select").val("");
    $(d).find("input + button.delete.element").each(function() {
      $(this).prev("input").remove();
      $(this).remove();
    });
    $("<button/>", {"class":"delete group", type:"button", text:"-"}).appendTo($(d).find(".tag:first"));
    d.addClass("xmlclone");
    d.appendTo($(this).parent());
  });

  $("div.section").on("mouseenter mouseleave focusin focusout", "button.delete.group, button.delete.single-tag", function(event){
     event.preventDefault();
     $(this).parent().toggleClass("remove-highlight");
  });
  $("div.section").on("click", "button.delete.group", function(event) {
    event.preventDefault();
    $(this).parent().remove();
    $("input").eq(0).keyup();
  });
  $("body").on("click", " button.add.single-tag", function(event) {
    event.preventDefault();
    var c = $(this).parent().clone();
    $(c).find("input,select").val("");
    $(this).before($("<button/>", {"class":"delete single-tag", type:"button", text:"-"}));
    c.addClass("xmlclone");
    c.insertAfter($(this).parent());
    $(this).remove();
  });
  $("body").on("click", "button.delete.single-tag", function(event) {
    event.preventDefault();
    $(this).parent().remove();
    $("input").eq(0).keyup();
  });
  $("body").on("click", "button#more", function(event) {
    event.preventDefault();
    var div = $(this).parent();
    $(div).find("button#more").hide();
    $(div).find("div#subgroup,button#less").show();
  });
  $("body").on("click", "button#less", function(event) {
    event.preventDefault();
    var div = $(this).parent();
    $(div).find("div#subgroup,button#less").hide();
    $(div).find("button#more").show();
    $(div).find("div#subgroup input,div#subgroup select").val("");
    $("input").eq(0).keyup();
  });
  $("body").on("click", "h3.recommended,h3.other", function(event) {
    var div = $(this).next("div");
    var text = $(this).html();
    if (text.charAt(0) == "+") {
      text = text.replace("+", "-");
      $(this).html(text);
      $(div).show();
    } else {
      if (text.charAt(0) == "-") {
        text = text.replace("-", "+");
        $(this).html(text);
        $(div).hide();
      }
    }
  });
});

var optionValues = {};
optionValues["descriptionType"] = [
  "Abstract", "Methods", "SeriesInformation", "TableOfContents",
  "TechnicalInfo", "Other"
];
optionValues["relatedIdentifierType"] = [
  "ARK", "arXiv", "bibcode", "CSTR", "DOI", "EAN13", "EISSN", "Handle", "IGSN",
  "ISBN", "ISSN", "ISTC", "LISSN", "LSID", "PMID", "PURL", "RAiD", "RRID",
  "SWHID", "UPC", "URL", "URN", "w3id"
];
optionValues["relationType"] = [
  "IsCitedBy", "Cites", "IsSupplementTo", "IsSupplementedBy",
  "IsContinuedBy", "Continues", "IsDescribedBy", "Describes",
  "HasMetadata", "IsMetadataFor", "HasVersion", "IsVersionOf",
  "IsNewVersionOf", "IsPreviousVersionOf", "IsPartOf", "HasPart",
  "IsPublishedIn", "IsReferencedBy", "References", "IsDocumentedBy",
  "Documents", "IsCompiledBy", "Compiles", "IsVariantFormOf",
  "IsOriginalFormOf", "IsIdenticalTo", "IsReviewedBy", "Reviews",
  "IsDerivedFrom", "IsSourceOf", "IsRequiredBy", "Requires",
  "IsObsoletedBy", "Obsoletes", "IsCollectedBy", "Collects",
  "IsTranslationOf", "HasTranslation", "Other"
];
optionValues["resourceTypeGeneral"] = [
  "Audiovisual", "Award", "Book", "BookChapter", "Collection",
  "ComputationalNotebook", "ConferencePaper", "ConferenceProceeding",
  "DataPaper", "Dataset", "Dissertation", "Event", "Image", "Instrument",
  "InteractiveResource", "Journal", "JournalArticle", "Model",
  "OutputManagementPlan", "PeerReview", "PhysicalObject", "Poster", "Preprint",
  "Presentation", "Project", "Report", "Service", "Software", "Sound",
  "Standard", "StudyRegistration", "Text", "Workflow", "Other"
];
optionValues["dateType"] = [
  "Accepted", "Available", "Copyrighted", "Collected", "Coverage", "Created",
  "Issued", "Submitted", "Updated", "Valid", "Withdrawn", "Other"];
optionValues["contributorType"] = [
  "ContactPerson", "DataCollector", "DataCurator", "DataManager",
  "Distributor", "Editor", "HostingInstitution", "Producer", "ProjectLeader",
  "ProjectManager", "ProjectMember", "RegistrationAgency",
  "RegistrationAuthority", "RelatedPerson", "Researcher", "ResearchGroup",
  "RightsHolder", "Sponsor", "Supervisor", "Translator", "WorkPackageLeader",
  "Other"
];
optionValues["titleType"] = [
  "AlternativeTitle", "Subtitle", "TranslatedTitle", "Other"
];
optionValues["funderIdentifierType"] = [
  "Crossref Funder ID", "GRID", "ISNI", "ROR", "Other"
];
optionValues["nameType"] = ["Personal", "Organizational"];
optionValues["numberType"] = ["Article", "Chapter", "Report", "Other"];
// RelatedItem reuses these controlled lists (see DataCite Kernel 4.7, property 20)
optionValues["relatedItemType"] = optionValues["resourceTypeGeneral"];
optionValues["relatedItemIdentifierType"] = optionValues["relatedIdentifierType"];

function process(section){
    var isWrapper = $(section).hasClass("wrapper-tag");
    var indent = 0;
    var xml = "";

    if (isWrapper){
        indent = 1;
    }

    $(section).find(".tag-group>.tag").each(function(){
        xml += processTag(this,indent);
    });

    if (xml.length > 0){
        if (isWrapper){
            var wrapperName = name(section);
            xml = ot(wrapperName) + br() + xml + ct(wrapperName) + br();
        }
    }

    return xml;
}

function processTag(tag, indent){
    var xml = "";
    var attributes;
    var value;
    var tagName = name(tag);
    var attr = attribs(tag);

    var tagValues = $(tag).children(".tag-value");

    if ($(tagValues).length){
        value = inputValue(tagValues[0]);
    }

    $(tag).children(".tag").each(function(){
        xml += processTag(this,indent + 1);
    });

    if (xml.length > 0){
        xml = tab(indent) + ota(tagName,attr) + br() + xml + tab(indent) + ct(tagName) + br();
    }
    else if(typeof value !== "undefined" && (value.length > 0 || ($(tag).hasClass("allow-empty") && attr.length > 0) || $(tag).hasClass("keep-empty"))){
        xml = tab(indent) + ota(tagName,attr) + value + ct(tagName) + br();
    }

    return xml;
}

function attribs(element){
    var attribs = "";

    $(element).children(".tag-attribute").each(function(){
        var value = "";
        var n = name(this);

        if ( $(this).is("input") ){
            value = inputValue(this);
        }

        if ( $(this).is("select") ){
            value = selectValue(this);
        }

        if (value.length > 0){
            if (attribs.length > 0){
                attribs += " ";
            }
            attribs += n + "=\"" + value +"\"";
        }
    });

    return attribs;
}

function inputValue(input){
    return $(input).val().encodeXML();
}

function selectValue(select){
    return $(select).find("option").filter(":selected").val().encodeXML();
}

function name(tag){
    return $(tag).attr("title");
}

function ps(s, sarr) {
  var i = $(s).attr("title");
  addO(s, "", "[" + i + "]");
  for (var i = 0;i < sarr.length;i++) {
    addO(s, sarr[i], sarr[i]);
  }
}

function addO(s, v, d) {
  $(s).append($("<option>").val(v).html(d));
}

function br() {
  return "\n";
}

function tab(number){
    var tabs = "";
    if (typeof number !== "undefined"){
        for (var i = 1; i <= number; i++ ){
            tabs += "\t";
        }
    }
    else{
        tabs = "\t";
    }
    return tabs;
}

function ota(tag,attr) {
    if (attr.length > 0){
        return "<" + tag +" "+ attr + ">";
    }
    else{
        return ot(tag);
    }
}

function ot(tag) {
  return "<" + tag + ">";
}

function ct(tag) {
  return "</" + tag + ">";
}

function st(element) {
  var doc = document, text = element, range, selection;
  if (doc.body.createTextRange) {
    range = doc.body.createTextRange();
    range.moveToElementText(text);
    range.select();
  } else {
    if (window.getSelection) {
      selection = window.getSelection();
      range = doc.createRange();
      range.selectNodeContents(text);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

String.prototype.encodeXML = function() {
  return this.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
};

var metadata = "";
var MIME_TYPE = "application/xml";
var cleanUp = function(a) {
  setTimeout(function() {
    window.URL.revokeObjectURL(a.href);
  }, 1500);
  $("span#output").html("");
};

var downloadFile = function() {
  window.URL = window.webkitURL || window.URL;
  var prevLink = $("span#output a");
  if (prevLink) {
    $("span#output").html("");
  }
  var bb = new Blob([metadata], {type:MIME_TYPE});
  if (navigator.msSaveBlob) {
      navigator.msSaveBlob(bb, "metadata.xml");
  } else {
    var a = document.createElement("a");
    a.download = "metadata.xml";
    a.href = window.URL.createObjectURL(bb);
    a.onclick = function(e) {
      if ($(this).is(":disabled")) {
        return false;
      }
      cleanUp(this);
    };
    $(a).appendTo($("span#output"));
    $(a)[0].click();
  }
};

function save() {
  if (false) {
    alert("Not currently supported in Internet Explorer");
  } else {
    downloadFile();
  }
}

// ---------------------------------------------------------------------------
// Loading an existing XML file into the form.
//
// The file does not have to be valid against the DataCite schema: every element
// and attribute the form knows about is used, everything else is reported and
// ignored. Only a file that cannot be parsed at all, or that does not have a
// <resource> root element, is rejected.
// ---------------------------------------------------------------------------

var DATACITE_NAMESPACE = "http://datacite.org/schema/kernel-4";

function xmlLocalName(node) {
  return node.localName || String(node.nodeName).replace(/^.*:/, "");
}

function normalizeText(text) {
  if (text === null || typeof text === "undefined") {
    return "";
  }
  return String(text).replace(/\s+/g, " ").trim();
}

// xml:lang, xsi:schemaLocation, xmlns... are namespace related and cannot be edited here
function isSkippableAttribute(attribute) {
  return attribute.indexOf("xmlns") === 0 || attribute.indexOf(":") !== -1;
}

function showLoadStatus(text, style) {
  $("span#loadstatus").text(text).removeClass("ok warn error").addClass(style);
}

// Drops the rows added while filling the form and empties every editable value,
// so that loading a second file does not leave traces of the first one.
function resetForm() {
  $(".xmlclone").remove();
  // a "+" button is replaced by a "-" button as soon as it has been used: put it back
  $("button.delete.single-tag").each(function() {
    $(this).replaceWith($("<button/>", {"class":"add single-tag", type:"button", text:"+"}));
  });
  $("button.delete.group").remove();
  $(".remove-highlight").removeClass("remove-highlight");
  $(".keep-empty").removeClass("keep-empty");
  // the fixed value of the hidden inputs (e.g. identifierType) is kept
  $("div.form").find("input.tag-value, input.tag-attribute, select.tag-attribute")
               .not("input[type=hidden]").val("");
}

function setAttributeField(field, value, report) {
  var $field = $(field);

  if ($field.is("select")) {
    var known = $field.children("option").filter(function() {
      return $(this).attr("value") === value;
    }).length > 0;
    if (!known) {
      report.warnings.push("'" + value + "' is not an allowed value for " + name(field));
      return;
    }
  } else {
    var pattern = $field.attr("pattern");
    if (pattern) {
      try {
        if (!(new RegExp("^(?:" + pattern + ")$")).test(value)) {
          report.warnings.push("'" + value + "' does not match the expected format of " + name(field));
        }
      } catch (e) {
        // an unusable pattern is simply not checked
      }
    }
  }

  $field.val(value);
}

function childElements(node, localName) {
  var result = [];
  var children = node && node.children ? node.children : [];

  for (var i = 0; i < children.length; i++) {
    if (xmlLocalName(children[i]) === localName) {
      result.push(children[i]);
    }
  }

  return result;
}

// Clicks the "+" button of a row, which clones the row itself
function addSiblingLike(tag) {
  var $tag = $(tag);
  var $button = $tag.children("button.add.single-tag").first();

  if (!$button.length) {
    return null;
  }

  $button.trigger("click");

  return $tag.next();
}

function ensureChildren(parent, tagName, count) {
  var $parent = $(parent);
  var $matches = $parent.children("div.tag[title='" + tagName + "']");

  while ($matches.length < count) {
    var $added = addSiblingLike($matches.last());
    if (!$added || !$added.length) {
      break;
    }
    $matches = $parent.children("div.tag[title='" + tagName + "']");
  }

  return $matches;
}

function fillTag(tag, node, report) {
  var $tag = $(tag);
  var tagName = name(tag);

  var $values = $tag.children(".tag-value");
  if ($values.length) {
    var text = normalizeText(node.textContent);
    // an element that was present but empty (e.g. <version/>) is kept as an empty element
    if (!text && !node.children.length) {
      $tag.addClass("keep-empty");
    }
    $values.first().val(text);
  }

  var knownAttributes = {};
  $tag.children(".tag-attribute").each(function() {
    var attributeName = name(this);
    knownAttributes[attributeName] = true;
    if (node.hasAttribute(attributeName)) {
      setAttributeField(this, node.getAttribute(attributeName).trim(), report);
    }
  });

  var attributes = node.attributes ? node.attributes : [];
  for (var a = 0; a < attributes.length; a++) {
    if (!isSkippableAttribute(attributes[a].name) && !knownAttributes[attributes[a].name]) {
      report.ignored.push("<" + tagName + ">/@" + attributes[a].name);
    }
  }

  // Child elements, in the order in which they are declared in the form
  var childNames = [];
  var childRows = {};
  $tag.children(".tag").each(function() {
    var childName = name(this);
    if (!childRows[childName]) {
      childRows[childName] = true;
      childNames.push(childName);
    }
  });

  for (var c = 0; c < childNames.length; c++) {
    var nodes = childElements(node, childNames[c]);
    if (!nodes.length) {
      continue;
    }

    var $targets = ensureChildren($tag, childNames[c], nodes.length);
    if ($targets.length < nodes.length) {
      report.warnings.push("only " + $targets.length + " of " + nodes.length +
                           " <" + childNames[c] + "> elements could be added to <" + tagName + ">");
    }

    for (var n = 0; n < nodes.length && n < $targets.length; n++) {
      fillTag($targets.get(n), nodes[n], report);
    }
  }

  var children = node.children ? node.children : [];
  for (var u = 0; u < children.length; u++) {
    var unknownName = xmlLocalName(children[u]);
    if (childNames.indexOf(unknownName) === -1) {
      report.ignored.push("<" + tagName + ">/<" + unknownName + ">");
    }
  }
}

// All the element names the form is able to fill
function knownElementNames() {
  var names = {};

  $("div.section").each(function() {
    var $section = $(this);
    var sectionName = name($section);

    if (sectionName && $section.hasClass("wrapper-tag")) {
      names[sectionName] = true;
    }

    $section.children(".tag-group").children(".tag").each(function() {
      names[name(this)] = true;
    });
  });

  return names;
}

function fillFromResource(root, report) {
  var known = knownElementNames();

  var children = root.children ? root.children : [];
  for (var i = 0; i < children.length; i++) {
    if (!known[xmlLocalName(children[i])]) {
      report.ignored.push("<" + xmlLocalName(children[i]) + ">");
    }
  }

  var rootAttributes = root.attributes ? root.attributes : [];
  for (var a = 0; a < rootAttributes.length; a++) {
    if (!isSkippableAttribute(rootAttributes[a].name)) {
      report.ignored.push("<resource>/@" + rootAttributes[a].name);
    }
  }

  $("div.section").each(function() {
    var $section = $(this);
    var sectionName = name($section);

    // Wrapper sections (subjects, creators, relatedItems...) hold one row per
    // child element, e.g. <creators> with one <creator> for every row
    if (sectionName && $section.hasClass("wrapper-tag")) {
      var $groups = $section.children(".tag-group");
      var $firstRow = $groups.first().children(".tag").first();

      if (!$firstRow.length) {
        return;
      }

      var rowName = name($firstRow.get(0));
      var wrappers = childElements(root, sectionName);
      var rowNodes = [];

      if (wrappers.length > 1) {
        report.warnings.push("several <" + sectionName + "> elements were merged into one");
      }

      for (var w = 0; w < wrappers.length; w++) {
        var found = childElements(wrappers[w], rowName);
        for (var f = 0; f < found.length; f++) {
          rowNodes.push(found[f]);
        }
      }

      while ($groups.length < rowNodes.length) {
        var $add = $section.children("button.add.group").first();
        if (!$add.length) {
          break;
        }
        $add.trigger("click");
        $groups = $section.children(".tag-group");
      }

      var $rows = $groups.children(".tag");

      if ($rows.length < rowNodes.length) {
        report.warnings.push("only " + $rows.length + " of " + rowNodes.length +
                             " <" + rowName + "> elements could be added");
      }

      for (var r = 0; r < rowNodes.length && r < $rows.length; r++) {
        fillTag($rows.get(r), rowNodes[r], report);
      }

      return;
    }

    // The other sections hold a single element of the resource
    $section.children(".tag-group").children(".tag").each(function() {
      var tagName = name(this);
      var nodes = childElements(root, tagName);

      if (!nodes.length) {
        return;
      }

      if (nodes.length > 1) {
        report.warnings.push("only the first <" + tagName + "> element was used");
      }

      fillTag(this, nodes[0], report);
    });
  });
}

function expandSectionsWithData() {
  $("h3.recommended, h3.other").each(function() {
    var $heading = $(this);
    var $form = $heading.next("div");
    var text = $heading.html();

    var filled = $form.find("input.tag-value, input.tag-attribute, select.tag-attribute")
                       .filter(function() {
                         return $(this).val() !== "";
                       }).length > 0;

    if (filled && text.charAt(0) === "+") {
      $heading.html("-" + text.slice(1));
      $form.show();
    }
  });
}

function reportLoadedXML(fileName, report) {
  var details = report.warnings.concat(report.ignored);
  var parts = [];

  if (report.warnings.length) {
    parts.push(report.warnings.length + (report.warnings.length === 1 ? " problem" : " problems"));
  }
  if (report.ignored.length) {
    parts.push(report.ignored.length + " unrecognised value" +
               (report.ignored.length === 1 ? "" : "s") + " ignored");
  }

  $("span#loadstatus").attr("title", details.join("\n"));
  showLoadStatus("Loaded " + fileName + (parts.length ? " with " + parts.join(" and ") : ""),
                 parts.length ? "warn" : "ok");

  if (details.length && window.console && console.warn) {
    console.warn("Values not loaded from " + fileName + ":\n" + details.join("\n"));
  }
}

function loadMetadataXML(text) {
  var report = { warnings: [], ignored: [] };
  var doc;

  try {
    doc = new DOMParser().parseFromString(text, "application/xml");
  } catch (e) {
    return { error: "The file could not be parsed." };
  }

  var root = doc.documentElement;
  var errors = doc.getElementsByTagName("parsererror");

  if (errors.length > 0 || !root || xmlLocalName(root) === "parsererror") {
    var detail = errors.length > 0 ? normalizeText(errors[0].textContent) : "";
    // drop the boilerplate the browsers add around the actual parser message
    detail = detail.replace(/^.*?errors?:/i, "").replace(/below is a rendering.*$/i, "").trim();
    return { error: "The file is not well-formed XML." + (detail ? " " + detail : "") };
  }

  if (xmlLocalName(root) !== "resource") {
    return { error: "A <resource> root element was expected, but <" + xmlLocalName(root) + "> was found." };
  }

  if (root.namespaceURI && root.namespaceURI !== DATACITE_NAMESPACE) {
    report.warnings.push("unexpected namespace '" + root.namespaceURI + "'");
  }

  resetForm();
  fillFromResource(root, report);

  if (!root.children.length) {
    report.warnings.push("the <resource> element contains no metadata");
  }

  return report;
}
