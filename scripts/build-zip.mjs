import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = path.join(rootDir, "dist");
const buildDir = path.join(rootDir, "build");
const manifestPath = path.join(rootDir, "manifest.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const version = manifest.version || "unknown";

const filesToCopy = [
  "manifest.json",
  "background.js",
  "api-client.js",
  "cache.js",
  "content.js",
  "popup.js",
  "settings.js",
  "setup.js",
  "offscreen.js",
  "constants.js",
  "popup.html",
  "settings.html",
  "setup.html",
  "offscreen.html",
  "style.css"
];

const directoriesToCopy = ["images"];

const vendorFiles = [
  {
    src: "node_modules/@mozilla/readability/Readability.js",
    dest: "node_modules/@mozilla/readability/Readability.js"
  },
  {
    src: "node_modules/dompurify/dist/purify.min.js",
    dest: "node_modules/dompurify/dist/purify.min.js"
  }
];

const ensureDir = (targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
};

const copyFile = (sourcePath, destinationRoot, destinationPath = sourcePath) => {
  const srcPath = path.join(rootDir, sourcePath);
  const destPath = path.join(destinationRoot, destinationPath);
  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
};

const copyDirectory = (relativePath, destinationRoot) => {
  const srcPath = path.join(rootDir, relativePath);
  const destPath = path.join(destinationRoot, relativePath);
  ensureDir(destPath);
  fs.cpSync(srcPath, destPath, { recursive: true });
};

fs.rmSync(distDir, { recursive: true, force: true });
ensureDir(distDir);
ensureDir(buildDir);

filesToCopy.forEach((file) => copyFile(file, distDir));
directoriesToCopy.forEach((dir) => copyDirectory(dir, distDir));
vendorFiles.forEach((file) => copyFile(file.src, distDir, file.dest));

const zipName = `summerice-${version}.zip`;
const zipPath = path.join(buildDir, zipName);

try {
  execSync(`zip -r "${zipPath}" .`, {
    cwd: distDir,
    stdio: "inherit"
  });
  console.log(`\nCreated ${zipPath}`);
} catch (error) {
  console.error("\nFailed to create zip. Ensure the 'zip' command is available.");
  process.exit(1);
}
