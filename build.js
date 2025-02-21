import { execSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import { globSync } from "glob";
import { resolve } from "path";
import { replaceInFileSync } from "replace-in-file";

const level = process.argv[2] || "patch";

execSync("git stash --include-untracked --quiet");

const version = execSync(`npm version ${level} --no-git-tag-version`)
  .toString()
  .trim();

console.log(`Building ${version}`);
console.log();

updateImageHashes();
updateAssetVersions();

execSync(`git commit --all --message="Build ${version}"`);
execSync(`git tag --force ${version}`);

try {
  execSync("git stash pop --index --quiet");
} catch {}

function updateImageHashes() {
  const images = globSync("docs/images/**/*.png", { withFileTypes: true });

  const hashes = Object.fromEntries(
    images.map((image) => {
      const { parentPath, name } = image;
      const path = resolve(parentPath, name);

      const pathParts = path.split("/");
      const imagesRootIndex = pathParts.lastIndexOf("images");
      const key = "/" + pathParts.splice(imagesRootIndex).join("/");

      const value = computeHash(path);

      return [key, value];
    }),
  );

  const hashesJs = JSON.stringify(hashes, null, 2);
  writeFileSync(
    "docs/scripts/hashes.js",
    `// prettier-ignore\nexport const hashes = ${hashesJs};\n`,
  );
}

function updateAssetVersions() {
  const assets = globSync("docs/**/*.{css,js}", { withFileTypes: true });
  const results = assets.map((asset) => updateAssetVersion(asset));
  const anyHasChanged = results.some((result) => result.hasChanged);
  if (anyHasChanged) {
    updateAssetVersions(assets);
  }
}

function updateAssetVersion(asset) {
  const { parentPath, name } = asset;

  const nameForRegex = name.replace(".", "\\.");
  const regex = new RegExp(`(?<=${nameForRegex}\\?v=)[0-9a-f]+`, "g");

  const path = resolve(parentPath, name);
  const hash = computeHash(path);

  const results = replaceInFileSync({
    files: "docs/**/*.{html,js}",
    from: regex,
    to: hash,
  });

  const hasChanged = results.some((result) => result.hasChanged);
  return { hasChanged };
}

function computeHash(path) {
  const data = readFileSync(path);
  return createHash("md5").update(data).digest("hex").substring(0, 8);
}
