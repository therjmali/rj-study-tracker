#!/usr/bin/env node
/**
 * Reset an account password from the server itself (there is no email service
 * on purpose — this is your own box).
 *
 *   node server/reset-password.mjs riya@example.com 'NewPassword123'
 *
 * Also signs every device out (rotating the token version) so a lost phone
 * cannot keep syncing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserStore } from './lib/store.mjs';
import { hashPassword, passwordProblem } from './lib/passwords.mjs';

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

const store = new UserStore(process.env.DATA_DIR || path.join(__dirname, 'data'));
await store.init();

const user = store.getUserByEmail(email);
if (!user) {
  console.error(`✖ No account for ${email}`);
  process.exit(1);
}

user.passwordHash = hashPassword(newPassword);
user.tokenVersion = (user.tokenVersion ?? 0) + 1;
user.refreshTokens = {};
user.updatedAt = new Date().toISOString();
await store.saveUser(user, { immediate: true });
await store.flush();

console.log(`✔ Password updated for ${user.email}`);
console.log('  Every device was signed out. Study data is untouched.');
