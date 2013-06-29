/*global __filename */

var tsc = require("./tsc");
var through = require("through");
var convert = require("convert-source-map");
var fs = require("fs");
var path = require("path");
var temp = require("temp");

var compilePath = temp.mkdirSync("browserify-tsc"),
    uncompiled = true,
    fileMap;

function extless(f) {
  return path.join(path.dirname(f), path.basename(f, path.extname(f)));
}

function tsify(f) {
  return extless(f) + ".ts";
}

function jsify(f) {
  // return extless(f) + ".js";
  return fileMap.lookup(tsify(f));
}

function stripSourceMap(src) {
  var l = src.split("\n"), last = "";
  while (last.trim() === "") {
    last = l.pop();
  }
  if (!/^\/\/@ /.test(last)) {
    l.push(last);
  }
  return l.join("\n");
}

function applySourceMap(src, sourceMap) {
  return stripSourceMap(src) + "\n" + sourceMap.toComment();
}

function compile(file) {
  var host = tsc.IO;
  var batch = new tsc.BatchCompiler(host);
  host.getExecutingFilePath = function() {
    return __filename;
  };
  host.quit = function() {};
  host.arguments = [
    "--sourcemap",
    "--module", "node",
    "--disallowimportmodule",
    "--out", compilePath
  ];
  host.arguments.push(file);
  batch.batchCompile();
  fileMap = batch.resolvedEnvironment.inputFileNameToOutputFileName;
}

function transformRequires(src) {
  return src.replace(/require\(['"]([^'"]*)['"]\)/g, function(x, y) {
    return "require('" + y + ".ts')";
  });
}

module.exports = function(file) {
  var tsFile = tsify(file), jsFile, mapFile, original, data, mapData, sourceMap;

  if (uncompiled) {
    compile(tsFile);
    uncompiled = false;
  }

  jsFile = jsify(file);
  mapFile = jsFile + ".map";
  original = fs.readFileSync(tsFile, "utf-8");
  data = fs.readFileSync(jsFile, "utf-8");
  mapData = fs.readFileSync(mapFile, "utf-8");

  sourceMap = convert.fromJSON(mapData);
  sourceMap.setProperty("sourcesContent", [original]);

  data = transformRequires(data);
  data = applySourceMap(data, sourceMap);

  return through(
    function() {},
    function() {
      this.queue(data);
      this.queue(null);
    }
  );
};
