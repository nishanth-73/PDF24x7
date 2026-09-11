const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// tslib 1.x maps its "import" export to an ESM wrapper whose default import is undefined
// under Metro, crashing pdf-lib at startup. Its plain ES build works for import and require.
const tslib = path.join(__dirname, 'node_modules/tslib/tslib.es6.js');
config.resolver.resolveRequest = (context, name, platform) =>
  name === 'tslib' ? { type: 'sourceFile', filePath: tslib } : context.resolveRequest(context, name, platform);

module.exports = config;
