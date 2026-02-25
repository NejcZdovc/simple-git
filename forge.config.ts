import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

const config: ForgeConfig = {
  packagerConfig: {
    name: "Simple Git",
    icon: "./assets/icon",
    asar: true,
    extraResource: ["./assets/app-update.yml"],
    ignore: (file: string) => {
      if (!file) return false;
      if (file.startsWith("/.vite")) return false;
      if (file === "/package.json") return false;
      if (file.startsWith("/assets")) return false;
      if (file === "/node_modules") return false;
      if (file.startsWith("/node_modules/simple-git")) return false;
      if (file.startsWith("/node_modules/@kwsites")) return false;
      if (file.startsWith("/node_modules/debug")) return false;
      if (file.startsWith("/node_modules/ms")) return false;
      // electron-updater and its dependencies
      if (file.startsWith("/node_modules/electron-updater")) return false;
      if (file.startsWith("/node_modules/builder-util-runtime")) return false;
      if (file.startsWith("/node_modules/lazy-val")) return false;
      if (file.startsWith("/node_modules/tiny-typed-emitter")) return false;
      if (file.startsWith("/node_modules/semver")) return false;
      if (file.startsWith("/node_modules/fs-extra")) return false;
      if (file.startsWith("/node_modules/graceful-fs")) return false;
      if (file.startsWith("/node_modules/jsonfile")) return false;
      if (file.startsWith("/node_modules/universalify")) return false;
      if (file.startsWith("/node_modules/js-yaml")) return false;
      if (file.startsWith("/node_modules/argparse")) return false;
      if (file.startsWith("/node_modules/lodash.escaperegexp")) return false;
      if (file.startsWith("/node_modules/lodash.isequal")) return false;
      if (file.startsWith("/node_modules/sax")) return false;
      return true;
    },
    osxSign: process.env.APPLE_ID ? {} : undefined,
    osxNotarize: process.env.APPLE_ID
      ? {
          appleId: process.env.APPLE_ID!,
          appleIdPassword: process.env.APPLE_PASSWORD!,
          teamId: process.env.APPLE_TEAM_ID!,
        }
      : undefined,
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-dmg",
      config: {
        format: "ULFO",
      },
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/renderer/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: {
          owner: "NejcZdovc",
          name: "simple-git",
        },
        prerelease: false,
        draft: false,
      },
    },
  ],
};

export default config;
