var pickFiles = require('broccoli-static-compiler');
var concatFiles = require('broccoli-concat');
var mergeTrees = require('broccoli-merge-trees');
var moveFile = require('broccoli-file-mover');
var replace = require('broccoli-replace');
var transpileES6 = require('broccoli-es6-module-transpiler');
var jsHint = require('broccoli-jshint');

var packages = require('./packages');

var dependableTrees = {};

var bower = 'bower_components';

var simpleHtmlTokenizer = pickFiles(bower+'/simple-html-tokenizer/lib/', {
  srcDir: '/',
  destDir: '/simple-html-tokenizer'
});
simpleHtmlTokenizer = moveFile(simpleHtmlTokenizer, {
  srcFile: 'simple-html-tokenizer/simple-html-tokenizer.js',
  destFile: 'simple-html-tokenizer/index.js'
});
dependableTrees['simple-html-tokenizer'] = simpleHtmlTokenizer;

var cjsHandlebars = pickFiles('node_modules/handlebars/dist/cjs/handlebars/', {
  srcDir: '/',
  destDir: '/handlebars'
});
dependableTrees['handlebars'] = cjsHandlebars;

function getDependencyTree(depName) {
  var dep = dependableTrees[depName];
  if (!dep) {
    dep = getPackageLibTree(depName);
  }
  return dep;
}

function getPackageLibTree(packageName) {
  return moveFile(pickFiles('packages/' + packageName + '/lib', {
    srcDir: '/',
    destDir: '/' + packageName
  }), {
    srcFile: packageName + '/main.js',
    destFile: '/' + packageName + '.js'
  });
};

function getPackageTrees(packageName, dependencies) {
  var libTrees = [];
  // main lib file
  libTrees.push(getPackageLibTree(packageName));
  // dependencies of lib
  for (var i=0;i<(dependencies.lib || []).length;i++) {
    var depName = dependencies.lib[i];
    libTrees.push(getDependencyTree(depName));
  }

  var testTrees = [];
  // main test
  testTrees.push(pickFiles('packages/' + packageName + '/tests', {
    srcDir: '/',
    destDir: '/' + packageName + '-tests'
  }));
  // dependencies of tests
  for (var i=0;i<(dependencies.tests || []).length;i++) {
    var depName = dependencies.tests[i];
    testTrees.push(getDependencyTree(depName));
  }

  return [libTrees, testTrees];
}

/*
  var transpiledLib = transpileES6(package, { moduleName: true });
  var concatenatedLib = concatFiles(transpiledLib, {
    inputFiles: ['** /*.js'],
    outputFile: '/' + packageName + '.amd.js'
  });
  var transpiledTests = transpileES6(allTests, { moduleName: true });
  var concatenatedTests = concatFiles(transpiledTests, {
    inputFiles: ['** /*.js'],
    outputFile: '/test/' + packageName + '-tests.amd.js'
  });
  return [packageTrees, concatenatedTests];
*/


// Test Assets

var test = pickFiles('test', {
  srcDir: '/',
  files: [ 'index.html', 'packages-config.js' ],
  destDir: '/test'
});

test = replace(test, {
  files: [ 'test/packages-config.js' ],
  patterns: [{
    match: /\{\{PACKAGES_CONFIG\}\}/g,
    replacement: JSON.stringify(packages, null, 2)
  }]
});

var loader = pickFiles(bower, {
  srcDir: '/loader',
  files: [ 'loader.js' ],
  destDir: '/test'
});

var qunit = pickFiles(bower, {
  srcDir: '/qunit/qunit',
  destDir: '/test'
});


// Export trees
var trees = [test, loader, qunit];

for (var packageName in packages.dependencies) {
  var packageTrees = getPackageTrees(packageName, packages.dependencies[packageName]);

  var libTree = mergeTrees(packageTrees[0]),
      testTree = mergeTrees(packageTrees[1]);

  // AMD lib
  var transpiledAmdLib = transpileES6(libTree, { moduleName: true, type: 'amd' });
  var concatenatedLib = concatFiles(transpiledAmdLib, {
    inputFiles: [packageName+'/**/*.js'],
    outputFile: '/' + packageName + '.js'
  });
  trees.push(concatenatedLib);

  // CJS lib
  var transpiledCjsLib = transpileES6(libTree, { type: 'cjs' });
  trees.push(transpiledCjsLib);

  var testTrees = [testTree];
  // jsHint tests
  testTrees.push(jsHint(libTree, { destFile: '/' + packageName + '-tests/jshint-lib.js' }));
  testTrees.push(jsHint(testTree, { destFile: '/' + packageName + '-tests/jshint-tests.js' }));

  // AMD tests
  var transpiledAmdTests = transpileES6(mergeTrees(testTrees), { modeleName: true, type: 'amd' });
  var concatenatedTests = concatFiles(transpiledAmdTests, {
    inputFiles: [packageName+'-tests/**/*.js'],
    outputFile: '/test/' + packageName + '-tests.js'
  });
  trees.push(concatenatedTests);

  // CJS tests
  var transpiledCjsTests = transpileES6(mergeTrees(testTrees), { type: 'cjs' });
  trees.push(transpiledCjsTests);
}

// support files
var supportTree = pickFiles('test/support', {
  srcDir: '/',
  destDir: '/test/support'
});
var supportTranspiled = transpileES6(supportTree, { type: 'cjs' });
trees.push( concatFiles(supportTranspiled, {
  inputFiles: ['/test/support/**/*.js'],
  outputFile: '/test/test-support.js'
}));

module.exports = mergeTrees(trees);
