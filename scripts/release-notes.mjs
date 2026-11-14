#!/usr/bin/env node
/**
 * Builds the GitHub Release body for an APK build from CHANGELOG.md, so the
 * release page and the changelog can never drift apart.
 *
 *   node scripts/release-notes.mjs            # → stdout (version from package.json)
 *   node scripts/release-notes.mjs 14.0.0     # explicit version
 *
 * Prints nothing but markdown; exits 1 if the version has no changelog section.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version;
const changelog = await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8').catch(() => '');

/** Everything between `## <version>` and the next `## ` heading. */
function section(text, wanted) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => new RegExp(`^##\\s+${wanted.replace(/\./g, '\\.')}(\\s|$)`).test(line));
  if (start === -1) return null;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

/** `**Heading**` lines are section titles in the changelog — promote them to h3. */
function promoteHeadings(text) {
  return text
    .split('\n')
    .map(line => {
      const match = /^\*\*(.+?)\*\*$/.exec(line.trim());
      return match ? `### ${match[1]}` : line;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

// A version may ship its notes as release-notes/<version>.md until they are merged into CHANGELOG.md.
const extra = await fs.readFile(path.join(root, 'release-notes', `${version}.md`), 'utf8').catch(() => '');
const body = section(changelog, version) ?? (extra.trim() || null);

if (!body) {
  console.error(`release-notes: CHANGELOG.md has no "## ${version}" section.`);
  process.exit(1);
}

const notes = `**Local-first Android APK — the whole app is bundled inside the package and works with no network at all.**
Sign in on the first screen to keep the same data on every device, or tap *Continue offline on this device*.

## What's new in ${version}

${promoteHeadings(body)}

---

### Install
1. Download **the APK below** (pick the newest file if the list ever grows).
2. Open it on the phone — Android will ask once for permission to install from that app.
3. Sign in with your email, or continue offline. Existing local data on the device is kept either way.

### Upgrading from an older version
Install straight over it: study data lives on the phone and in your cloud account, never inside the APK.
If Android refuses the install, export a **Backup** from the old app first, uninstall it, install this build, then import the backup from **Profile → Backup**.

### Cloud sync (optional)
The APK ships pointing at the official sync server; you can change it any time in **Settings → Cloud sync**. Your own copy of the server is in the repository (\`server/\`) and installs with Docker Compose or Node 20+.

Docker: \`docker compose up -d\` · Node: \`npm run dev:server\`

**Full details:** [CHANGELOG](https://github.com/therjmali/rj-study-tracker/blob/main/CHANGELOG.md) · [Setup guide](https://github.com/therjmali/rj-study-tracker#readme)
`;

process.stdout.write(notes);
