var urlParameters = require('../../../js/third-party/url-parameters.js');

/**
 * Productions in the default grammar.
 * A number or a string that begins and ends with an inverted comma (') is
 * interpreted as terminal, everything else as non-terminal.
 * A production with only terminals can be a list of elements rather than a list of lists
 */
const DEFAULT_PRODUCTIONS = {
  "E": [
    ["N"],
    ["E", "'+'", "E"],
    ["E", "'*'", "E"],
    ["'-'", "E"],
    ["'('", "E", "')'"],
  ],
  "N": [0,1,2,3,4,5,6,7,8,9]
};

/**
 * Used when generating random expressions.
 * If applicable, when the max recursion depth is reached one of these will be used.
 */
const DEFAULT_FINAL_TERMINALS = [0,1,2,3,4,5,6,7,8,9];

const RECURSIONDEPTH_SIMPLE = 1;
const RECURSIONDEPTH_DEFAULT = 3;

var $activeNonterminal_ = null;
var historyStack_ = [];
var productions_ = DEFAULT_PRODUCTIONS;
var finalTerminals_ = DEFAULT_FINAL_TERMINALS;
var initialNonterminal_ = 'E'
var examples_ = [];
var nextExample_ = 0;
var retryIfFail_ = false;
var hideGenerator_ = false;
var recursionDepth_ = RECURSIONDEPTH_DEFAULT;

$(document).ready(function() {
  parseUrlParameters();
  $('#cfg-equation').html(`<span class="nonterminal">${initialNonterminal_}</span>`);
  fillProductionsWindow(productions_);
  $('#generate-button').on('click', function(event) {
    $('#cfg-target').val(generateTarget(event.target));
    resetEquation();
  });
  $('#reset-button').on('click', function() {
    resetEquation();
  });
  $('#set-g-random').on('click', function () {
    setGenerator('random');
  })
  $('#set-g-random-simple').on('click', function () {
    setGenerator('random-simple');
  })
  $('#set-g-from-preset').on('click', function () {
    setGenerator('from-preset');
  })
  $('#undo-button').on('click', undo);
  $('#cfg-grammar-link-button').on('click', getLink);
  $('#cfg-default-link-button').on('click', resetLink);
  $('#undo-button').prop('disabled', true);
  $('#cfg-target').change(testMatchingEquations);
  $("#examples-checkbox").change(toggleExamplesWindow).prop('checked', false);
  toggleExamplesWindow();
  if (examples_.length) {
    $('#cfg-target').val(examples_[0]);
  } else if (hideGenerator_) {
    $('#cfg-target').val("");
  } else if (retryIfFail_ || recursionDepth_ != RECURSIONDEPTH_DEFAULT) {
    $('#cfg-target').val(randomExpression(initialNonterminal_, productions_, recursionDepth_));
  } else {
    $('#cfg-target').val(randomExpression(initialNonterminal_, productions_, RECURSIONDEPTH_SIMPLE));
  }
  $('#cfg-grammar-input').val('');
  getLink();
  reapplyNonterminalClickEvent();
  //https://stackoverflow.com/a/3028037
  $(document).click(function(event) { 
    var $target = $(event.target);
    if(!$target.closest('.nonterminal').length &&
    !$target.closest('#selection-popup').length &&
    $('#selection-popup').is(':visible')) {
      $('#selection-popup').hide();
      $activeNonterminal_ = null;
    }
  });
});

/**
 * Resets the equation being constructed by the user to solely the original non-terminal
 */
function resetEquation() {
  $('#cfg-equation').html(`<span class="nonterminal">${initialNonterminal_}</span>`);
  reapplyNonterminalClickEvent();
  testMatchingEquations();
  historyStack_ = [];
  $('#undo-button').prop('disabled', true);
}

/******************************************************************************/
// FUNCTIONS FOR PARSING THE URL //
/******************************************************************************/

/**
 * Interprets the given URL parameters and prepares the interactive accordingly
 */
function parseUrlParameters() {
  if (urlParameters.getUrlParameter('hide-builder') == 'true') {
    $('#grammar-builder-button').hide();
  }
  var grammar = urlParameters.getUrlParameter('productions');
  var finalTerminals = urlParameters.getUrlParameter('terminals');
  var examples = urlParameters.getUrlParameter('examples');
  var recursionDepth = urlParameters.getUrlParameter('recursion-depth');
  retryIfFail_ = urlParameters.getUrlParameter('retry-if-fail') == 'true';
  hideGenerator_ = urlParameters.getUrlParameter('hide-generator') == 'true';

  if (grammar) {
    productions_ = decodeGrammar(grammar);
  }
  if (finalTerminals) {
    finalTerminals_ = decodeTerminals(finalTerminals);
  }
  if (examples) {
    examples = examples.split('|');
    for (let i=0; i<examples.length; i++) {
      examples[i] = examples[i].trim();
    }
    examples_ = examples;
  } else {
    $('#set-g-from-preset').hide();
  }
  if (recursionDepth && parseInt(recursionDepth) > 0) {
    recursionDepth_ = parseInt(recursionDepth);
  }
  if (hideGenerator_) {
    if (examples) {
      setGenerator('from-preset');
      $('#set-g-random').hide();
      $('#set-g-random-simple').hide();
      $('#generate-dropdown').hide();
    } else {
      $('#generator-buttons').hide();
    }
  } else if (recursionDepth || retryIfFail_) {
    $('#set-g-random-simple').hide();
    if (!examples) {
      $('#set-g-from-preset').hide();
      $('#generate-dropdown').hide();
    }
  }
}

/**
 * Parses the given string to form a dictionary of grammar productions.
 * 
 * e.g. the default productions could be parsed from:
 * E:N|E '+' E|E '*' E|'-' E|'(' E ')'; N:'0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9';
 */
function decodeGrammar(productionString) {
  var duo, nonterminal, replacementString;
  var replacements = [];
  var productions = {};
  var blocks = productionString.split(";");
  initialNonterminal_ = blocks[0].split(':')[0].trim();
  for (let blockIndex=0; blockIndex < blocks.length; blockIndex++) {
    if (blocks[blockIndex].trim() == '') {
      continue;
    }
    duo = blocks[blockIndex].split(':');
    if (duo.length != 2) {
      console.error("Invalid syntax for given grammar productions: " + blocks[blockIndex]);
      continue;
    }
    nonterminal = duo[0].trim();
    replacementString = duo[1];
    replacements = (interpretReplacementStrings(replacementString.split('|')));
    productions[nonterminal] = replacements;
  }
  return productions;
}

/**
 * Returns a list of production replacements in the format expected by this program.
 * If every replacement is an integer terminal, returns a list of elements rather than
 * a list of lists
 */
function interpretReplacementStrings(replacementStrings) {
  const isNumber = (value) => typeof(value) == 'number';
  var replacements = [];
  var replacementUnits;
  for (let i=0; i<replacementStrings.length; i++) {
    replacementUnits = replacementStrings[i].trim().split(' ');
    let firstUnit = replacementUnits[0];
    if (replacementUnits.length == 1 && firstUnit.match(/^\'\d+\'$/g)) {
      // A full list of integer terminals is interpreted differently
      replacements.push(parseInt(firstUnit.replace(/^\'+|\'+$/g, '')));
    } else {
      replacements.push(replacementUnits);
    }
  }
  if (!replacements.every(isNumber)) {
    // If not all of them are integers then we have to resort to the long form standard
    for (let i=0; i<replacements.length; i++) {
      if (isNumber(replacements[i])) {
        replacements[i] = [`'${replacements[i].toString()}'`];
      }
    }
  }
  return replacements
}

/**
 * Parses the given string to form a list of terminal strings.
 * With outer whitespace and inverted commas removed, everything between '|'
 * symbols is an individual terminal.
 * 
 * e.g. a|b|c|d , 'a'|'b'|'c'|'d' , 'a' | 'b' | 'c' | 'd' all decode to the same thing
 */
function decodeTerminals(terminalString) {
  var terminals = terminalString.split('|');
  for (let i=0; i<terminals.length; i++) {
    terminals[i] = terminals[i].trim().replace(/^\'+|\'+$/g, '');
  }
  return terminals;
}

/******************************************************************************/
// FUNCTIONS FOR PREPARING THE INTERACTIVE //
/******************************************************************************/

/**
 * Fills the user-facing table with the given grammar productions.
 * If the productions are sufficiently short, they are displayed in 2 columns
 */
function fillProductionsWindow(productions) {
  var keys = Object.keys(productions)
  var describedProductions = [];
  for (let i=0; i<keys.length; i++) {
    describedProductions = describedProductions.concat(describeAndReduceProductions(keys[i], productions[keys[i]]));
  }

  var use2Cols = describedProductions.length > 1;
  for (let x=0; x<describedProductions.length; x++) {
    // 14 is the length of &#8594 plus 8 characters
    if (describedProductions[x].length > 14) {
      use2Cols = false;
      break;
    }
  }

  var $table = $('#productions-table')
  var table = "";
  if (use2Cols) {
    table += (`<tr><th colspan="2"><h3>${gettext("Productions:")}</h3></th></tr>`)
    var half = Math.ceil(describedProductions.length / 2);
    for (let i=0; i<half; i++) {
      if (half + i < describedProductions.length) {
        table += (`<tr><td>${describedProductions[i]}</td><td>${describedProductions[half + i]}</td></tr>`)
      } else {
        table += (`<tr><td>${describedProductions[i]}</td><td></td></tr>`)
      }
    }
  } else {
    table += (`<tr><th><h3>${gettext("Productions:")}</h3></th></tr>`)
    for (let j=0; j<describedProductions.length; j++) {
      table += (`<tr><td>${describedProductions[j]}</td></tr>`)
    }
  }
  $table.html(table);
}

/**
 * Returns a list of strings, each describing productions from a given non-terminal
 * 
 * If replacements is an incremental list of integers they are reduced appropriately
 */
function describeAndReduceProductions(nonterminal, replacements) {
  var isCompressable = true;
  if (typeof(replacements[0]) == 'number' && replacements.length > 1) {
    for (let i=1; i<replacements.length; i++) {
      if (replacements[i] != replacements[i-1] + 1) {
        isCompressable = false;
        break;
      }
    }
  } else {
    isCompressable = false;
  }

  if (isCompressable) {
    if (replacements.length == 2) {
      // Use syntax A|B where B = A+1, meaning 'Number A or number B'
      return [`${nonterminal} &#8594 ${replacements[0]}|${replacements[1]}`]
    }
    // Use syntax A-B, meaning 'Any number from A through B'
    return [`${nonterminal} &#8594 ${replacements[0]}-${replacements[replacements.length - 1]}`]
  }
  var returnList = [];
  for (let i=0; i<replacements.length; i++) {
    returnList.push(describeProduction(nonterminal, replacements[i]));
  }
  return returnList;
}

/******************************************************************************/
// FUNCTIONS FOR INTERACTIVE LOGIC //
/******************************************************************************/

/**
 * Sets the equation generator to be of the given type
 */
function setGenerator(type) {
  var $button = $('#set-g-' + type);
  var buttonLabel = $button.html();
  var buttonType = $button.attr('g-type');
  $('#generate-button').html(buttonLabel);
  $('#generate-button').attr('g-type', buttonType);
}

/**
 * Returns a (string) new equation for the user to try to build depending on the selected generator.
 */
function generateTarget($button) {
  if ($button.getAttribute('g-type') == 'random') {
    return randomExpression(initialNonterminal_, productions_, recursionDepth_);
  } else if ($button.getAttribute('g-type') == 'random-simple') {
    return randomExpression(initialNonterminal_, productions_, RECURSIONDEPTH_SIMPLE);
  } else {
    nextExample_ = (nextExample_ + 1) % examples_.length;
    return examples_[nextExample_];
  }
}

/**
 * Each time a new non-terminal is created it needs to be bound to the click event.
 */
function reapplyNonterminalClickEvent() {
  $('.nonterminal').unbind('click');
  //https://stackoverflow.com/a/44753671
  $('.nonterminal').on('click', function(event) {
    setActiveNonterminal($(event.target));
    $('#selection-popup').css({left: event.pageX});
    $('#selection-popup').css({top: event.pageY});
    $('#selection-popup').show();
  });
}

/**
 * Tests to see if the user-created equation matches the target one.
 * 
 * If they match, applies an effect, else removes it.
 */
function testMatchingEquations() {
  if ($('#cfg-target').val().trim() == $('#cfg-equation').html().trim()) {
    $('#cfg-equation').addClass('success');
    $('#generate-button').addClass('success');
    $('#generate-dropdown').addClass('success');
  } else {
    $('#cfg-equation').removeClass('success');
    $('#generate-button').removeClass('success');
    $('#generate-dropdown').removeClass('success');
  }
}

/**
 * Sets the given html element as the non-terminal to be replaced.
 * Prepares the popup appropriately.
 */
function setActiveNonterminal($target) {
  $activeNonterminal_ = $target;
  var nonterminal = $target.html();
  $('#selection-popup').html('');
  if (Object.keys(productions_).indexOf(nonterminal) < 0) {
    console.error(`Could not find non-terminal ${nonterminal} in available productions.`);
    $('#selection-popup').html(gettext('No productions available.'));
    return;
  }
  $('#selection-popup').html(getPopupVal(nonterminal, productions_[nonterminal]));
  $('.cfg-popup-replacement').on('click', function(event) {
    applyProduction($(event.target));
    $('#selection-popup').hide();
    testMatchingEquations();
  });
}

/**
 * Replaces the active non-terminal using the target production.
 */
function applyProduction($target) {
  var nonterminal = $activeNonterminal_.html();
  var replacementIndex = parseInt($target.attr('cfg-replacement'));
  var replacement = productions_[nonterminal][replacementIndex];
  historyStack_.push($('#cfg-equation').html());
  $('#undo-button').prop('disabled', false);
  $activeNonterminal_.replaceWith(describeProductionReplacement(replacement));
  reapplyNonterminalClickEvent();
  $activeNonterminal_ = null;
}

/**
 * Replaces the existing equation with the one immediately before.
 */
function undo() {
  $('#cfg-equation').html(historyStack_.pop());
  $activeNonterminal_ = null;
  if (historyStack_.length <= 0) {
    $('#undo-button').prop('disabled', true);
  }
  reapplyNonterminalClickEvent();
  testMatchingEquations();
}

/**
 * Returns a string of HTML code to be put in the popup, allowing the user to select
 * a replacement for the given non-terminal.
 */
function getPopupVal(nonterminal, replacements) {
  var code = '<div class="btn-group-vertical">';
  var nextStr = "";
  for (let i=0; i<replacements.length; i++) {
    nextStr = describeProduction(nonterminal, replacements[i]);
    code += `<button type="button" class="btn btn-secondary cfg-popup-replacement" cfg-replacement="${i}">${nextStr}</button>`;
  }
  code += '</div>';
  return code;
}

/**
 * Returns a string describing the production formatted nicely
 * 
 * e.g. E -> E+E
 */
function describeProduction(nonterminal, replacement) {
  var returnText = nonterminal + " &#8594 ";
  if (typeof(replacement) != 'object') {
    return returnText + replacement.toString().replace(/^\'+|\'+$/g, '');
  }
  for (let i=0; i<replacement.length; i++) {
    returnText += replacement[i].toString().replace(/^\'+|\'+$/g, '');
  }
  return returnText;
}

/**
 * Returns a string of HTML code describing the production result formatted to
 * be inserted into the user-built equation
 * 
 * e.g. <span class="nonterminal">E</span>+<span class="nonterminal">E</span>
 */
function describeProductionReplacement(replacement) {
  if (typeof(replacement) != 'object') {
    return replacement.toString().replace(/^\'+|\'+$/g, '');
  }
  var code = "";
  for (let i=0; i<replacement.length; i++) {
    if (isTerminal(replacement[i])) {
      code += replacement[i].toString().replace(/^\'+|\'+$/g, '');
    } else {
      code += `<span class="nonterminal">${replacement[i].toString().replace(/^\'+|\'+$/g, '')}</span>`;
    }
  }
  return code;
}

/******************************************************************************/
// FUNCTIONS FOR CREATING RANDOM EQUATIONS //
/******************************************************************************/

/**
 * Returns a random integer in the range [0, max).
 * From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
 */
function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

/**
 * Returns true if the given string fits the definition of a terminal,
 * false otherwise.
 * 
 * A terminal is a number or a string that begins and ends with an
 * inverted comma ('), with at least 1 character in between
 */
function isTerminal(s) {
  return (typeof(s) == 'number' ||
    (
      s.length > 2
      && s.charAt(0) == "'"
      && s.charAt(s.length - 1) == "'"
    ));
}

/**
 * Returns a random expression generated from the given grammar productions.
 * 
 * If the maximum depth of recursion (`maxDepth`) is reached then depending on
 * the global retryIfFail either it will try again up to 10 times or remaining
 * non-terminals will be replaced with random terminals.
 * 
 * @param {String} startChar initial non-terminal
 * @param {Dict} productions all productions
 * @param {Number} maxDepth maximum depth of recursion
 */
function randomExpression(startChar, productions, maxDepth) {
  if (!retryIfFail_) {
    return recursiveRandomExpression(startChar, productions, maxDepth, false, finalTerminals_);
  }
  const attempts = 10;
  var attempt = 0;
  var success = false;
  var result;
  while (attempt < attempts && !success) {
    try {
      result = recursiveRandomExpression(startChar, productions, maxDepth, true, []);
      success = true;
    } catch (error) {
      // If the error is not the error we're trying to catch then re-throw it
      if (!error.startsWith("Max depth")) {
        throw error;
      }
    }
    attempt++;
  }
  if (!success) {
    $('#error-notice').html(gettext("The generator failed to finish a new equation too many times.") + "<br>" +
    gettext("This could just be unlucky (try again!), or it could indicate a problem with your productions."));
    $('#error-notice').show();
    return "";
  }
  return result;
}

/**
 * Returns a random expression generated from the given grammar productions.
 * 
 * @param {String} replaced initial non-terminal
 * @param {Dict} productions all productions
 * @param {Number} maxDepth maximum depth of recursion
 * @param {Boolean} doRetry throw an error if `maxDepth` is reached and non-terminals remain
 * @param {Array} terminals terminal characters to use if `maxDepth` is reached and `doRetry` is `false`
 * 
 * It is assumed that any terminal in `terminals` can logically (through one or more steps)
 * replace any non-terminal.
 */
function recursiveRandomExpression(replaced, productions, maxDepth, doRetry, terminals) {
  if (maxDepth <= 0) {
    if (doRetry) {
      throw "Max depth reached replacing " + replaced;
    } else {
      return terminals[getRandomInt(terminals.length)].toString().replace(/^\'+|\'+$/g, '');
    }
  }

  try {
    var replacement = productions[replaced][getRandomInt(productions[replaced].length)]
  } catch (error) {
    console.error(error);
    $('#error-notice').html(gettext("An error occurred while generating a new equation.") + "<br>" +
    gettext("There could be a non-terminal in the grammar productions with no corresponding production."));
    $('#error-notice').show();
    return;
  }
  $('#error-notice').hide();
  if (typeof(replacement) != 'object') {
    return replacement.toString().replace(/^\'+|\'+$/g, '');
  }
  var returnString = '';
  for (let i=0; i<replacement.length; i++) {
    if (isTerminal(replacement[i])) {
      returnString += replacement[i].toString().replace(/^\'+|\'+$/g, '');
    } else {
      returnString += recursiveRandomExpression(replacement[i], productions, maxDepth - 1, doRetry, terminals);
    }
  }
  return returnString;
}

/******************************************************************************/
// FUNCTIONS FOR THE USER-FACING PRODUCTIONS SETTER //
/******************************************************************************/

/**
 * Sets the link to the base url of the interactive
 */
function resetLink() {
  var instruction = gettext("This link will open the default version of this interactive:");
  var link = window.location.href.split('?', 1)[0].replace(/^\/+|\/+$/g, '');
  $("#cfg-grammar-link").html(`${instruction}<br><a target="_blank" href=${link}>${link}</a>`);
}

/**
 * Sets the link based on the productions submitted
 */
function getLink() {
  var instruction = gettext("This link will open the interactive with your set productions:");
  var productions = $("#cfg-grammar-input").val().trim();
  if (productions.length <= 0) {
    $("#cfg-grammar-link").html("");
    return;
  }
  var productionsParameter = percentEncode(productions.replace(/\n/g, ' '));
  var otherParameters = "";
  if ($("#generator-checkbox").prop('checked')){
    // 5 chosen arbitrarily
    otherParameters += "&recursion-depth=5&retry-if-fail=true";
  } else {
    otherParameters += "&hide-generator=true";
  }
  if ($("#examples-checkbox").prop('checked')){
    var examples = $("#cfg-example-input").val().trim();
    if (examples.length > 0) {
      otherParameters += '&examples=' + percentEncode(examples.replace(/\n/g, '|'));
    }
  }
  // When the user switches between generator types a # appears at the end of the url
  // This needs to be removed for the new link, or not added in the first place:
  var basePath = window.location.href.split('?', 1)[0].replace(/\#+$/g, '');
  var fullUrl = basePath + "?productions=" + productionsParameter + otherParameters;
  $("#cfg-grammar-link").html(`${instruction}<br><a target="_blank" href=${fullUrl}>${fullUrl}</a>`);
}

function toggleExamplesWindow() {
  if ($("#examples-checkbox").prop('checked')){
    $("#cfg-example-input-parent").removeClass('d-none');
  } else {
    $("#cfg-example-input-parent").addClass('d-none');
    $("#cfg-example-input").val('')
  }
}

/**
 * Returns the given string percent-encoded
 */
function percentEncode(string) {
  return encodeURIComponent(string);
}
