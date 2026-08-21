import assert from "node:assert/strict";
import test from "node:test";
import {
  addStorefrontTemplate,
  listStorefrontTemplates,
  resolveStorefrontTemplate,
  validateStorefrontTemplateDefinition,
} from "./storefront-template.ts";

type StoredTemplate = {
  storeId: number;
  templateId: string;
  definitionJson: string;
};

function templateDatabase(rows: StoredTemplate[]): D1Database {
  return {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async run() {
          if (!sql.includes("INSERT INTO storefront_templates")) {
            throw new Error("Unexpected write");
          }
          rows.push({
            storeId: Number(bindings[0]),
            templateId: String(bindings[1]),
            definitionJson: String(bindings[2]),
          });
          return { success: true };
        },
        async all() {
          return {
            success: true,
            results: rows
              .filter((row) => row.storeId === Number(bindings[0]))
              .map((row) => ({
                template_id: row.templateId,
                definition_json: row.definitionJson,
              })),
          };
        },
        async first() {
          const row = rows.find((candidate) => candidate.templateId === bindings[0]);
          return row
            ? {
                template_id: row.templateId,
                definition_json: row.definitionJson,
              }
            : null;
        },
      };
    },
  } as unknown as D1Database;
}

const runtimeDefinition = {
  id: "compact-without-hero",
  name: "Compact tanpa Hero",
  composition: {
    layout: "compact",
    sections: { hero: false, catalog: true, proofs: true },
  },
} as const;

test("a persisted declarative template can be added, listed, and selected", async () => {
  const rows: StoredTemplate[] = [];
  const database = templateDatabase(rows);

  await addStorefrontTemplate(database, 1, runtimeDefinition);
  const listed = await listStorefrontTemplates(database, 1);
  const selected = await resolveStorefrontTemplate(
    database,
    runtimeDefinition.id,
  );

  assert.equal(listed.state, "ready");
  assert.ok(
    listed.templates.some((definition) => definition.id === runtimeDefinition.id),
  );
  assert.deepEqual(selected, {
    state: "ready",
    source: "persisted",
    definition: runtimeDefinition,
  });
});

test("invalid and executable template definitions are rejected before persistence", async () => {
  const rows: StoredTemplate[] = [];
  const database = templateDatabase(rows);

  await assert.rejects(() =>
    addStorefrontTemplate(database, 1, {
      ...runtimeDefinition,
      name: "<script>alert(1)</script>",
    }),
  );
  assert.throws(() =>
    validateStorefrontTemplateDefinition({
      id: "unsupported-wide-proof",
      name: "Unsupported Wide Proof",
      composition: {
        layout: "wide",
        sections: { hero: true, catalog: true, proofs: true },
      },
    }),
  );
  assert.equal(rows.length, 0);
});

test("invalid persisted definitions and D1 failures fail closed", async () => {
  const invalidDatabase = templateDatabase([
    {
      storeId: 1,
      templateId: "broken-template",
      definitionJson: JSON.stringify({
        id: "broken-template",
        name: "Broken Template",
        composition: {
          layout: "plugin",
          sections: { hero: true, catalog: true, proofs: false },
        },
      }),
    },
  ]);
  assert.deepEqual(
    await resolveStorefrontTemplate(invalidDatabase, "broken-template"),
    { state: "invalid" },
  );

  const unavailableDatabase = {
    prepare: () => ({
      bind() {
        return this;
      },
      first: async () => {
        throw new Error("D1 unavailable");
      },
    }),
  } as unknown as D1Database;
  assert.deepEqual(
    await resolveStorefrontTemplate(unavailableDatabase, "runtime-template"),
    { state: "unavailable" },
  );
});

test("built-in templates remain resolvable without template persistence", async () => {
  const selected = await resolveStorefrontTemplate(undefined, "compact-market");
  assert.equal(selected.state, "ready");
  if (selected.state === "ready") {
    assert.equal(selected.source, "built-in");
    assert.equal(selected.definition.composition.layout, "compact");
  }
});
