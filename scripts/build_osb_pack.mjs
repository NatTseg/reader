// Encrypts the owner's private OSB study file into osb-data.enc.json for public hosting.
// gzip + AES-256-GCM; the key derives from the passphrase (PBKDF2-SHA256, 600k) and the fixed salt in scripts/osb-salt.txt.
// Usage: node scripts/build_osb_pack.mjs ~/Downloads/orthobible-osb-complete-v3.json
// Passphrase: $OSB_PASSPHRASE, else the macOS Keychain item "unseen-warfare-pages" (shared with the Unseen Warfare copy).
import fs from "node:fs";
import zlib from "node:zlib";
import crypto from "node:crypto";
import {execSync} from "node:child_process";
const [input, output = "osb-data.enc.json"] = process.argv.slice(2);
if (!input) { console.error("Usage: node scripts/build_osb_pack.mjs <private-osb.json> [osb-data.enc.json]"); process.exit(1); }
const passphrase = process.env.OSB_PASSPHRASE || execSync("security find-generic-password -s unseen-warfare-pages -w").toString().trim();
const salt = Buffer.from(fs.readFileSync(new URL("./osb-salt.txt", import.meta.url), "utf8").trim(), "base64");
const plain = fs.readFileSync(input);
const data = JSON.parse(plain);
if (!data.sourceNotes || !data.introductions || !data.headings) throw new Error("Use the aligned study file with headings (align_osb_numbers.py).");
const iterations = 600000, iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({name: "PBKDF2", hash: "SHA-256", salt, iterations}, base, {name: "AES-GCM", length: 256}, true, ["encrypt"]);
const sealed = await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, zlib.gzipSync(plain, {level: 9}));
const id = crypto.createHash("sha256").update(plain).digest("hex").slice(0, 16);
const b64 = bytes => Buffer.from(bytes).toString("base64");
fs.writeFileSync(output, JSON.stringify({v: 1, id, kdf: "PBKDF2-SHA256", iterations, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(sealed))}));
const raw = Buffer.from(await crypto.subtle.exportKey("raw", key)).toString("base64url");
fs.writeFileSync(new URL("../.osb-unlock-link", import.meta.url), `https://nattseg.github.io/reader/#osb=${raw}\n`);
console.log(`${output}: ${(fs.statSync(output).size / 1048576).toFixed(2)} MB, id ${id}. Unlock link written to .osb-unlock-link (git-ignored).`);
