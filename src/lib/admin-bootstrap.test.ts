import test from "node:test";
import assert from "node:assert/strict";

import {
  BOOTSTRAP_FALLBACK_PASSWORD,
  DEFAULT_ADMIN_PASSWORD_HASH,
  hashAdminPassword,
  validateNewAdminPassword,
  verifyAdminLoginPassword,
} from "./admin-credentials.ts";

const seeded = {
  username: "admin",
  passwordHash: DEFAULT_ADMIN_PASSWORD_HASH,
};

test("a fresh install opens with the documented default", async () => {
  // Before this existed, a new Worker seeded a credential that no password
  // could open: the only accepted one came from BOOTSTRAP_ADMIN_PASSWORD,
  // which nothing sets on a fresh install. The install was unreachable.
  assert.equal(
    await verifyAdminLoginPassword("admin", seeded, ""),
    true,
    "admin/admin must open a fresh install",
  );
  assert.equal(BOOTSTRAP_FALLBACK_PASSWORD, "admin");
});

test("the default opens nothing but itself", async () => {
  assert.equal(await verifyAdminLoginPassword("Admin", seeded, ""), false);
  assert.equal(await verifyAdminLoginPassword("admin ", seeded, ""), false);
  assert.equal(await verifyAdminLoginPassword("", seeded, ""), false);
  assert.equal(await verifyAdminLoginPassword("password", seeded, ""), false);
});

test("a configured bootstrap secret replaces the default entirely", async () => {
  const strong = "a-sufficiently-long-bootstrap";

  assert.equal(await verifyAdminLoginPassword(strong, seeded, strong), true);
  assert.equal(
    await verifyAdminLoginPassword("admin", seeded, strong),
    false,
    "configuring a secret must close the default, not sit alongside it",
  );
});

test("a bootstrap secret that is too short is rejected outright", async () => {
  // It must not silently fall back to the weaker default, which would make a
  // half-hearted configuration worse than none.
  const short = "tooshort";
  assert.equal(await verifyAdminLoginPassword(short, seeded, short), false);
  assert.equal(await verifyAdminLoginPassword("admin", seeded, short), false);
});

test("once rotated, the default no longer opens the account", async () => {
  const rotated = {
    username: "admin",
    passwordHash: await hashAdminPassword("a-real-operator-password"),
  };

  assert.equal(await verifyAdminLoginPassword("admin", rotated, ""), false);
  assert.equal(
    await verifyAdminLoginPassword("a-real-operator-password", rotated, ""),
    true,
  );
});

test("the replacement password cannot be the default or the username", () => {
  assert.notEqual(validateNewAdminPassword("admin", "admin"), "");
  assert.notEqual(validateNewAdminPassword("ADMIN", "admin"), "");
  assert.notEqual(validateNewAdminPassword("owner", "owner"), "");
  assert.notEqual(validateNewAdminPassword("short", "admin"), "");
  assert.equal(validateNewAdminPassword("a-real-operator-password", "admin"), "");
});
