import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

const config: ForgeConfig = {
  packagerConfig: {
    name: "Simple Git",
    icon: "./assets/icon",
    asar: true,
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
