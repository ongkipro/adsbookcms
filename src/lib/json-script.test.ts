import assert from "node:assert/strict";
import test from "node:test";
import { jsonForScript } from "./json-script.ts";

test("jsonForScript neutralises a </script> breakout in a string field", () => {
  const payload = {
    productName: 'Widget</script><script>globalThis.__xss=1</script>',
  };
  const rendered = jsonForScript(payload);
  // The raw closing tag must not survive: no literal "</script>" may reach the
  // HTML, or the inline JSON element would end early and the rest would execute.
  assert.equal(rendered.includes("</script"), false);
  assert.equal(rendered.includes("\\u003c/script"), true);
});

test("jsonForScript round-trips through JSON.parse unchanged", () => {
  const value = {
    productName: "B\u003c/script\u003e ampersand & quote \" ok",
    province: "Jawa Timur",
    codDisabledProvinceCodes: ["31", "35"],
    productId: 42,
  };
  assert.deepEqual(JSON.parse(jsonForScript(value)), value);
});

test("jsonForScript escapes every < it is given", () => {
  assert.equal(jsonForScript("a<b<c"), '"a\\u003cb\\u003cc"');
});

test("jsonForScript survives an undefined value instead of throwing", () => {
  // JSON.stringify(undefined) is undefined, not a string; a shared helper must
  // not throw on the next caller that passes an optional value.
  assert.equal(jsonForScript(undefined), "null");
  assert.equal(JSON.parse(jsonForScript(undefined)), null);
});
