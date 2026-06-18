const { getDefaultConfig } = require('@react-native/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const monorepoRoot = path.resolve(__dirname, '../..');

// Watch the whole monorepo root so Metro can both resolve @loop/core (packages/core)
// and serve hoisted deps installed by bun under <root>/node_modules.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 强制所有 `react` 导入（含 react-native 内部）收敛到唯一一份 react 单例，
// 避免多份 react 触发 "invalid hook" 之类的问题。全仓库已统一 react 19，
// bun hoisted 布局下它被提升到 monorepo 根 node_modules。
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
