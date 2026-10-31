const { getDefaultConfig } = require('expo/metro-config');

// Node core-module polyfills for Metro (fix 2026-10-31, CI run #171):
// isomorphic-git requires Node's 'crypto' (and 'stream' via its hash
// code), which do not exist on the phone. Metro cannot resolve Node
// core modules, so the release bundle failed with "Unable to resolve
// module crypto". These mappings point those imports at pure-JS
// implementations: crypto-browserify, stream-browserify, and the
// 'buffer' package (already a dependency). 'react-native-get-random-values'
// (imported in app/_layout.tsx) supplies the secure randomness
// crypto-browserify needs. Without this mapping, any release build
// that includes isomorphic-git fails at bundle time even though
// `tsc` passes — tsc does not bundle.
const config = getDefaultConfig(__dirname);
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  buffer: require.resolve('buffer'),
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
};
module.exports = config;
