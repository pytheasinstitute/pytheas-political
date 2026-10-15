// Packs the desktop app into Pixelwerk.app for Apple silicon (arm64) and Intel (x64).
// ARCHS=arm64 node build.mjs builds one architecture only.
import { packager } from '@electron/packager';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const out = await packager({
  dir,
  name: 'Pixelwerk',
  executableName: 'Pixelwerk',
  platform: 'darwin',
  arch: (process.env.ARCHS || 'arm64,x64').split(','),
  electronVersion: '44.7.2',
  icon: path.join(dir, 'icon.icns'),
  appBundleId: 'app.pixelwerk.desktop',
  appVersion: '1.0.0',
  buildVersion: '1',
  appCategoryType: 'public.app-category.graphics-design',
  appCopyright: 'Pixelwerk',
  darwinDarkModeSupport: true,
  asar: true,
  // The app has no runtime dependencies: only main.js and package.json go into it.
  prune: false,
  ignore: [/^\/(dist|node_modules|build\.mjs|icon\.icns|README\.md|\.gitignore|package-lock\.json)(\/|$)/],
  extendInfo: { CFBundleDevelopmentRegion: 'de', CFBundleDisplayName: 'Pixelwerk', LSMinimumSystemVersion: '12.0' },
  ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: process.env.ELECTRON_ZIP_DIR } : {}),
  out: path.join(dir, 'dist'),
  overwrite: true,
});
console.log(out.join('\n'));
