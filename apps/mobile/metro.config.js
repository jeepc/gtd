const { getDefaultConfig } = require('@react-native/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const monorepoRoot = path.resolve(__dirname, '../..');

// Watch the whole monorepo root so Metro can both resolve @loop/core (packages/core)
// and serve hoisted deps whose realpath lives under <root>/node_modules/.pnpm.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

const rootNodeModules = path.resolve(monorepoRoot, 'node_modules');
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [rootNodeModules] }),
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
