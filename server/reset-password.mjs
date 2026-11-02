#!/usr/bin/env node
/**
 * Reset an account password from the server itself (there is no email service
 * on purpose — this is your own box).
 *
 *   node server/reset-password.mjs riya@example.com 'NewPassword123'
 *
 * Works while the server is running: the running process re-reads account files
 * before answering, so the reset takes effect on the very next request and
 * every existing session is signed out (the token version rotates).
 *
 * Study data is untouched.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserStore } from './lib/store.mjs';
import { hashPassword, passwordProblem, verifyPassword } from './lib/passwords.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error('Usage: node server/reset-password.mjs <email> <new-password>');
  process.exit(1);
}

const problem = passwordProblem(newPassword);
if (problem) {
  console.error(`✖ ${problem}`);
  process.exit(1);
}

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const store = new UserStore(dataDir);
await store.init();

const target = store.getUserByEmail(email);
if (!target) {
  console.error(`✖ No account for ${email}`);
  process.exit(1);
}

const file = path.join(store.usersDir, `${target.id}.json`);

/** Apply the reset and wait until it is on disk. */
async function applyReset() {
  const fresh = new UserStore(dataDir);
  await fresh.init();
  // Re-read on every attempt: the server may have written in between.
  const user = fresh.getUser(target.id);
  if (!user) throw new Error('The account disappeared while resetting.');
  user.passwordHash = hashPassword(newPassword);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  user.refreshTokens = {};
  user.updatedAt = new Date().toISOString();
  await fresh.saveUser(user, { immediate: true });
  await fresh.flush();
}

/**
 * A live server can flush a write that it queued a moment before the reset
 * landed. Re-check the file and apply again if that happened — an admin command
 * must never silently do nothing.
 */
async function settled() {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return verifyPassword(newPassword, parsed.passwordHash);
  } catch {
    return false;
  }
}

let applied = false;
for (let attempt = 1; attempt <= 3 && !applied; attempt++) {
  await applyReset();
  await new Promise(resolve => setTimeout(resolve, 150));
  applied = await settled();
}

if (!applied) {
  console.error('✖ The reset could not be persisted — the data directory is not writable.');
  process.exit(1);
}

console.log(`✔ Password updated for ${target.email}`);
console.log('  Every device was signed out. Study data is untouched.');
