import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CMS_VERSION } from "./version.ts";

// The admin "What's new" modal is hand-written. It sat at "1.4.0+" through
// five releases because nothing tied it to version.ts; this does.
const MODAL = readFileSync("src/components/admin/ChangelogModal.tsx", "utf8");

test("the changelog's first entry is the running version and the only latest", () => {
  const versions = [...MODAL.matchAll(/^\s+version: "([^"]+)",$/gm)].map((m) => m[1]);
  assert.equal(versions[0], CMS_VERSION.version, "add a ChangelogModal entry for the new version");
  assert.equal(new Set(versions).size, versions.length, "a version is listed twice");
  assert.equal((MODAL.match(/isLatest: true/g) ?? []).length, 1);
  const first = MODAL.slice(MODAL.indexOf(`version: "${CMS_VERSION.version}"`));
  assert.match(first.slice(0, first.indexOf("changes:")), /isLatest: true/);
  assert.match(first.slice(0, first.indexOf("changes:")), new RegExp(`releaseTag: "${CMS_VERSION.releaseTag}"`));
});
