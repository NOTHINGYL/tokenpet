import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const requiredFiles = [
  ".github/workflows/ci.yml",
  ".github/dependabot.yml",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/pull_request_template.md",
  ".github/release.yml",
  ".github/pull_request_template.md",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "scripts/verify-public-readiness.mjs",
  "apps/desktop/public/pet-actors/golden-british/actor.json",
  "apps/desktop/public/pet-video/dance-golden-style.webm",
];
const privatePrefixes = [
  "assets/source/pet-actors/",
  "docs/designs/",
  "docs/pet-story/",
  "docs/screenshots/",
  "apps/desktop/public/pet-actors/golden-british/qa/",
  "apps/desktop/public/pet-actors/golden-british/source/",
];
const sensitivePatterns = [
  { label: "personal macOS path", expression: /\/Users\/[A-Za-z0-9._-]+\// },
  { label: "GitHub classic token", expression: /ghp_[A-Za-z0-9]{30,}/ },
  { label: "GitHub fine-grained token", expression: /github_pat_[A-Za-z0-9_]{40,}/ },
  { label: "OpenAI-style secret", expression: /sk-[A-Za-z0-9_-]{20,}/ },
  { label: "AWS access key", expression: /AKIA[0-9A-Z]{16}/ },
  { label: "private key", expression: /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/ },
];

function fail(message) {
  throw new Error(`Public readiness QA failed: ${message}`);
}

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) fail(`missing ${file}`);
}

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString()
  .split("\0")
  .filter(Boolean);
const publicFiles = [...new Set([...trackedFiles, ...requiredFiles])];

for (const file of publicFiles) {
  if (privatePrefixes.some((prefix) => file.startsWith(prefix))) fail(`private path is tracked: ${file}`);
  if (statSync(resolve(root, file)).size > 100 * 1024 * 1024) fail(`file exceeds GitHub's 100 MiB limit: ${file}`);

  const buffer = readFileSync(resolve(root, file));
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  for (const pattern of sensitivePatterns) {
    if (pattern.expression.test(text)) fail(`${pattern.label} found in ${file}`);
  }
}

const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (packageJson.license !== "MIT") fail("package license must match LICENSE");
if (packageJson.repository?.url !== "git+https://github.com/NOTHINGYL/tokenpet.git") fail("repository metadata is missing");
if (!packageJson.scripts?.["build:dance-video:authoring"]) fail("private Dance authoring command is not labelled");

const html = readFileSync(resolve(root, "apps/desktop/index.html"), "utf8");
for (const directive of ["Content-Security-Policy", "default-src 'self'", "object-src 'none'", "script-src 'self'"]) {
  if (!html.includes(directive)) fail(`renderer CSP is missing ${directive}`);
}

const mainProcess = readFileSync(resolve(root, "apps/desktop/electron/main.ts"), "utf8");
for (const guard of ["app.enableSandbox()", "setWindowOpenHandler", "will-navigate", "assertTrustedIpcSender"]) {
  if (!mainProcess.includes(guard)) fail(`Electron security guard is missing ${guard}`);
}

process.stdout.write(`Public readiness QA passed: ${requiredFiles.length} required files, ${trackedFiles.length} tracked paths.\n`);
