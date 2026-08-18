import { z } from "zod";

const templateIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Template ID must be a lowercase slug.");

const compositionSchema = z
  .object({
    layout: z.enum(["compact", "wide"]),
    sections: z
      .object({
        hero: z.boolean(),
        catalog: z.literal(true),
        proofs: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((composition, context) => {
    if (composition.layout === "wide" && composition.sections.proofs) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sections", "proofs"],
        message: "The wide composition does not support the proofs section.",
      });
    }
  });

export const storefrontTemplateDefinitionSchema = z
  .object({
    id: templateIdSchema,
    name: z.string().trim().min(2).max(80),
    composition: compositionSchema,
  })
  .strict();

export type StorefrontTemplateDefinition = z.infer<
  typeof storefrontTemplateDefinitionSchema
>;

const compactMarket = storefrontTemplateDefinitionSchema.parse({
  id: "compact-market",
  name: "Compact Market",
  composition: {
    layout: "compact",
    sections: { hero: true, catalog: true, proofs: true },
  },
});

const wideCatalog = storefrontTemplateDefinitionSchema.parse({
  id: "wide-catalog",
  name: "Wide Catalog",
  composition: {
    layout: "wide",
    sections: { hero: true, catalog: true, proofs: false },
  },
});

export const BUILT_IN_STOREFRONT_TEMPLATES = Object.freeze([
  compactMarket,
  wideCatalog,
] as const);

const builtInById: Readonly<Record<string, StorefrontTemplateDefinition>> =
  Object.freeze({
    [compactMarket.id]: compactMarket,
    [wideCatalog.id]: wideCatalog,
  });

function parseDefinition(value: unknown): StorefrontTemplateDefinition {
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 8_192) {
    throw new Error("Storefront template definition exceeds 8 KiB.");
  }
  if (/<\/?[a-z][^>]*>/i.test(serialized)) {
    throw new Error("Raw HTML is not allowed in storefront templates.");
  }
  return storefrontTemplateDefinitionSchema.parse(value);
}

export function validateStorefrontTemplateDefinition(
  value: unknown,
): StorefrontTemplateDefinition {
  const definition = parseDefinition(value);
  if (builtInById[definition.id]) {
    throw new Error("Built-in storefront template IDs cannot be replaced.");
  }
  return definition;
}

export type StorefrontTemplateResolution =
  | {
      state: "ready";
      source: "built-in" | "persisted";
      definition: StorefrontTemplateDefinition;
    }
  | { state: "invalid" }
  | { state: "unavailable" };

export type StorefrontTemplateList =
  | { state: "ready"; templates: StorefrontTemplateDefinition[] }
  | { state: "unavailable"; templates: typeof BUILT_IN_STOREFRONT_TEMPLATES };

function parseStoredDefinition(
  templateId: string,
  definitionJson: string,
): StorefrontTemplateDefinition | null {
  try {
    const definition = parseDefinition(JSON.parse(definitionJson));
    if (definition.id !== templateId || builtInById[definition.id]) {
      throw new Error("Stored storefront template identity does not match its row.");
    }
    return definition;
  } catch (error) {
    console.error("storefront-template-invalid", templateId, error);
    return null;
  }
}

export async function addStorefrontTemplate(
  database: D1Database,
  storeId: number,
  value: unknown,
): Promise<StorefrontTemplateDefinition> {
  const definition = validateStorefrontTemplateDefinition(value);
  await database
    .prepare(
      `INSERT INTO storefront_templates (
         store_id, template_id, definition_json, created_at, updated_at
       ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    )
    .bind(storeId, definition.id, JSON.stringify(definition))
    .run();
  return definition;
}

export async function listStorefrontTemplates(
  database: D1Database,
  storeId: number,
): Promise<StorefrontTemplateList> {
  try {
    const rows = await database
      .prepare(
        `SELECT template_id, definition_json
         FROM storefront_templates
         WHERE store_id = ?
         ORDER BY template_id ASC`,
      )
      .bind(storeId)
      .all<{ template_id: string; definition_json: string }>();
    const persisted = (rows.results ?? [])
      .map((row) => parseStoredDefinition(row.template_id, row.definition_json))
      .filter(
        (definition): definition is StorefrontTemplateDefinition =>
          definition !== null,
      );
    return {
      state: "ready",
      templates: [...BUILT_IN_STOREFRONT_TEMPLATES, ...persisted],
    };
  } catch (error) {
    console.error("storefront-template-list", error);
    return { state: "unavailable", templates: BUILT_IN_STOREFRONT_TEMPLATES };
  }
}

export async function resolveStorefrontTemplate(
  database: D1Database | null | undefined,
  selectedTemplateId: string,
): Promise<StorefrontTemplateResolution> {
  const builtIn = builtInById[selectedTemplateId];
  if (builtIn) {
    return { state: "ready", source: "built-in", definition: builtIn };
  }
  if (!templateIdSchema.safeParse(selectedTemplateId).success) {
    return { state: "invalid" };
  }
  if (!database || typeof database !== "object") {
    return { state: "unavailable" };
  }

  try {
    const row = await database
      .prepare(
        `SELECT t.template_id, t.definition_json
         FROM storefront_templates t
         JOIN stores s ON s.id = t.store_id
         WHERE t.template_id = ?
         ORDER BY s.id ASC
         LIMIT 1`,
      )
      .bind(selectedTemplateId)
      .first<{ template_id: string; definition_json: string }>();
    if (!row) return { state: "invalid" };
    const definition = parseStoredDefinition(
      row.template_id,
      row.definition_json,
    );
    return definition
      ? { state: "ready", source: "persisted", definition }
      : { state: "invalid" };
  } catch (error) {
    console.error("storefront-template-resolve", error);
    return { state: "unavailable" };
  }
}
