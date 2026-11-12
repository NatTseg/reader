// Encrypts the private OSB edition build (bible.json, study.json) for public hosting.
// Each file: gzip, then AES-256-GCM; stored as 12 bytes of IV followed by the ciphertext.
// The key derives from the passphrase (PBKDF2-SHA256, 600k rounds) and the fixed salt in scripts/edition-salt.txt.
// Usage: node scripts/encrypt_osb_edition.mjs ~/Documents/reader-private/osb/build
// Passphrase: $OSB_PASSPHRASE, else the macOS Keychain item "unseen-warfare-pages".
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import {execSync} from "node:child_process";
const [buildDir] = process.argv.slice(2);
if (!buildDir) { console.error("Usage: node scripts/encrypt_osb_edition.mjs <private-build-dir>"); process.exit(1); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const passphrase = process.env.OSB_PASSPHRASE || execSync("security find-generic-password -s unseen-warfare-pages -w").toString().trim();
const salt = Buffer.from(fs.readFileSync(path.join(root, "scripts/edition-salt.txt"), "utf8").trim(), "base64");
const iterations = 600000;
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({name: "PBKDF2", hash: "SHA-256", salt, iterations}, base, {name: "AES-GCM", length: 256}, true, ["encrypt"]);
const meta = {v: 1, kdf: "PBKDF2-SHA256", iterations, salt: salt.toString("base64"), files: {}};
for (const name of ["bible", "study"]) {
  const plain = fs.readFileSync(path.join(buildDir, `${name}.json`));
  JSON.parse(plain);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, zlib.gzipSync(plain, {level: 9})));
  fs.writeFileSync(path.join(root, `${name}.enc`), Buffer.concat([Buffer.from(iv), Buffer.from(sealed)]));
  meta.files[name] = {file: `${name}.enc`, id: crypto.createHash("sha256").update(plain).digest("hex").slice(0, 16)};
  console.log(`${name}.enc: ${(fs.statSync(path.join(root, `${name}.enc`)).size / 1048576).toFixed(2)} MB`);
}
fs.writeFileSync(path.join(root, "edition.json"), JSON.stringify(meta) + "\n");
const raw = Buffer.from(await crypto.subtle.exportKey("raw", key)).toString("base64url");
fs.writeFileSync(path.join(root, ".osb-unlock-link"), `https://nattseg.github.io/reader-osb/#osb=${raw}\n`);
console.log("edition.json written; unlock link written to .osb-unlock-link (git-ignored).");
