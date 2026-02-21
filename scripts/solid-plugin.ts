import { transformAsync } from '@babel/core';
// @ts-expect-error - preset package types are not required here.
import ts from '@babel/preset-typescript';
// @ts-expect-error - preset package types are not required here.
import solid from 'babel-preset-solid';
import type { BunPlugin } from 'bun';

const solidTransformPlugin: BunPlugin = {
  name: 'bun-plugin-solid-opentui-local',
  setup: (build) => {
    build.onLoad({ filter: /\/node_modules\/solid-js\/dist\/server\.js$/ }, async (args) => {
      const path = args.path.replace('server.js', 'solid.js');
      const code = await Bun.file(path).text();
      return { contents: code, loader: 'js' };
    });

    build.onLoad({ filter: /\/node_modules\/solid-js\/store\/dist\/server\.js$/ }, async (args) => {
      const path = args.path.replace('server.js', 'store.js');
      const code = await Bun.file(path).text();
      return { contents: code, loader: 'js' };
    });

    // Only transform JSX-bearing files. Leave plain .ts/.js to Bun.
    build.onLoad({ filter: /\.(jsx|tsx)$/ }, async (args) => {
      const code = await Bun.file(args.path).text();
      const transforms = await transformAsync(code, {
        filename: args.path,
        presets: [
          [
            solid,
            {
              generate: 'universal',
              moduleName: '@opentui/solid'
            }
          ],
          [ts]
        ]
      });
      return {
        contents: transforms?.code ?? '',
        loader: 'js'
      };
    });
  }
};

export default solidTransformPlugin;
