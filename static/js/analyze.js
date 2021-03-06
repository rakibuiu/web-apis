/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var stdlib = require('ya-stdlib-js');
var og = require('object-graph-js');
var ObjectGraph = og.ObjectGraph;
var analysis = og.analysis;

// TODO: stdlib's loadData should need this over-specification.
var l = window.location;

// Get an element from the DOM.
function e(selector) {
  return document.querySelector(selector);
}

// Perform object graph set refinement by including objects in inGraphs and
// excluding objects in exGraphs. Write output to DOM.
function doAnalyses(inGraphs, exGraphs) {
  var apisE = e('#apis');
  var structsE = e('#structs');
  var primitivesE = e('#primitives');

  apisE.textContent = structsE.textContent = primitivesE.textContent = '';

  // Sanity check input graph ids.
  inGraphs.concat(exGraphs).map(g => g.getAllIds().forEach(id => {
    if (isNaN(id)) debugger;
  }));

  var graph = analysis.intersectDifference(inGraphs, exGraphs);

  console.assert(graph.data[graph.root]);

  // Sanity check output graph ids.
  graph.getAllIds().forEach(id => {
    if (isNaN(id)) debugger;
  });
  var ids = graph.getAllIds().filter(id => {
    return !isNaN(id);
  }).sort();

  // APIs are functions in resulting graph.
  var apis = ids.filter(function(id) {
    return graph.isFunction(id);
  }).map(function(id) {
    return graph.getShortestKey(id);
  }).sort();

  // Structs are non-function in the resulting graph.
  var allStructs = ids.filter(function(id) {
    // Don't include the root in struct analysis.
    return id !== graph.root && !graph.isFunction(id);
  }).map(function(id) {
    return graph.getShortestKey(id);
  }).sort();
  // Only report "leaf structs"; they have no other structs for which their key
  // is a prefix.
  var structs = Array.from(allStructs).filter(
    struct => !allStructs.some(
      otherStruct => otherStruct.length > struct.length &&
        otherStruct.indexOf(struct) === 0
    )
  );

  var primitives = ids.map(function(id) {
    var prefix = graph.getShortestKey(id);
    console.assert(graph.lookup(prefix));
    var $ = graph.getObjectKeys(id);
    var a = $.filter(function(key) {
      return graph.isType(graph.lookup(key, id));
    });
    var b = a.map(function(key) {
      return prefix + '.' + key;
    });
    return b;
  }).reduce(function(acc, arr) {
    return acc.concat(arr);
  }, []).filter(function(key) {
    var prefix = key.split('.');
    var postfix = prefix[prefix.length - 1];
    prefix = prefix.slice(0, prefix.length - 1).join('.');
    return (
      !graph.isFunction(graph.lookup(prefix)) ||
        !['arguments', 'caller', 'length', 'name'].some(function(name) {
          return name === postfix;
        })
    );
  }).sort();

  apisE.textContent = apis.join('\n');
  structsE.textContent = structs.join('\n');
  primitivesE.textContent = primitives.join('\n');
}

// Convert datalist option value to a data retrieval URL. This is tightly
// coupled to loadData('/list') callback below, and to server's data routing
// routing scheme.
function optValueToURL(label) {
  return '/data/' + label.replace(/ /g, '/');
}

// Gather configuration from DOM inputs, perform analyses, and output results.
function analyze() {
  // Map input option values to URLs.
  function inputPaths(inputs) {
    var rtn = new Array(inputs.length);
    for ( var i = 0; i < inputs.length; i++ ) {
      rtn[i] = optValueToURL(inputs[i].value);
    }
    return rtn;
  }

  var inPaths = inputPaths(e('#include-inputs').querySelectorAll('input'));
  var exPaths = inputPaths(e('#exclude-inputs').querySelectorAll('input'));

  // Continuation hack: Keep trying until inGraphs and exGraphs are populated,
  // then do analyses.
  var inGraphs = null, exGraphs = exPaths.length === 0 ? [] : null;
  function next(i) {
    if ( inGraphs && exGraphs ) doAnalyses(inGraphs, exGraphs);
  }

  // Map data fetched from URLs to ObjectGraph instances.
  function getObjectGraphs(jsons) {
    return jsons.map(function(data) { return ObjectGraph.fromJSON(data); });
  }

  // Map URL paths to inGraphs and exGraphs, then do analyses.
  stdlib.loadData(inPaths, { responseType: 'json' }).then(function(jsons) {
    inGraphs = getObjectGraphs(jsons);
    next();
  });
  stdlib.loadData(exPaths, { responseType: 'json' }).then(function(jsons) {
    exGraphs = getObjectGraphs(jsons);
    next();
  });
}

var includeExcludeOpts = [];

// Add <option>s to the given <datalist>.
function addOpts(datalist) {
  for ( var i = 0; i < includeExcludeOpts.length; i++ ) {
    var opt = document.createElement('option');
    opt.value = includeExcludeOpts[i];
    datalist.appendChild(opt);
  }
}

// Get the full set of nested keys over a Javascript object.
// This is used to transform output from the "/list" URL to a collection of
// options.
function getKeys(o, s) {
  if (typeof o !== 'object' || o === null ) return [s];
  var keys = Object.getOwnPropertyNames(o);
  var rtn = [];
  for ( var i = 0; i < keys.length; i++ ) {
    var key = keys[i];
    rtn = rtn.concat(getKeys(o[key], s ? s + ' ' + key : key));
  }
  return rtn;
}

// Get a list of environments the server has data for, and add them to a
// <datalist>.
var l = window.location;
stdlib.loadData('/list', { responseType: 'json' }).then(function(map) {
  includeExcludeOpts = getKeys(map, '');
  addOpts(e('#environments'));
});

// Helper function for adding environments to include/exclude lists in DOM.
function addinputTo(container, datalist) {
  var div = document.createElement('div');
  var input = document.createElement('input');
  var rm = document.createElement('button');

  input.setAttribute('list', datalist.id);
  rm.textContent = '-';
  div.appendChild(input);
  div.appendChild(rm);
  container.appendChild(div);

  rm.addEventListener('click', function() { container.removeChild(div); });
}

e('#include-add').addEventListener(
  'click', addinputTo.bind(this, e('#include-inputs'), e('#environments')));
e('#exclude-add').addEventListener(
  'click', addinputTo.bind(this, e('#exclude-inputs'), e('#environments')));
e('#analyze').addEventListener('click', analyze);
