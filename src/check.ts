export type JsonSchema = boolean | Record<string, unknown>;

export interface CheckOptions {
  unsupportedKeywords?: string[];
  target?: string;
}

export interface SchemaIssue {
  keyword: string;
  path: string;
  target: string;
  message: string;
}

type SchemaVisitor = (schema: Record<string, unknown>, path: string) => void;

const SCHEMA_MAP_KEYWORDS = [
  "$defs", "definitions", "properties", "patternProperties", "dependentSchemas"
];
const SCHEMA_SINGLE_KEYWORDS = [
  "additionalProperties", "unevaluatedProperties", "propertyNames", "not",
  "if", "then", "else", "contains", "contentSchema", "additionalItems",
  "unevaluatedItems"
];
const SCHEMA_ARRAY_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"];

export function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === "boolean" ||
    (typeof value === "object" && value !== null && !Array.isArray(value));
}

export function visitSchemas(schema: JsonSchema, callback: SchemaVisitor): void {
  const seen = new WeakSet<object>();
  function visit(current: unknown, path: string): void {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return;
    if (seen.has(current)) return;
    seen.add(current);
    const schemaObject = current as Record<string, unknown>;
    callback(schemaObject, path);
    for (const keyword of SCHEMA_MAP_KEYWORDS) {
      const children = schemaObject[keyword];
      if (children && typeof children === "object" && !Array.isArray(children)) {
        for (const [name, child] of Object.entries(children)) {
          visit(child, `${path}/${keyword}/${escapePointerSegment(name)}`);
        }
      }
    }
    for (const keyword of SCHEMA_SINGLE_KEYWORDS) {
      const child = schemaObject[keyword];
      if (Object.hasOwn(schemaObject, keyword) && isSchema(child)) {
        visit(child, `${path}/${keyword}`);
      }
    }
    if (Object.hasOwn(schemaObject, "items")) {
      const items = schemaObject.items;
      if (Array.isArray(items)) items.forEach((child, i) => visit(child, `${path}/items/${i}`));
      else if (isSchema(items)) visit(items, `${path}/items`);
    }
    for (const keyword of SCHEMA_ARRAY_KEYWORDS) {
      const children = schemaObject[keyword];
      if (Array.isArray(children)) children.forEach((child, i) => visit(child, `${path}/${keyword}/${i}`));
    }
    const dependencies = schemaObject.dependencies;
    if (dependencies && typeof dependencies === "object" && !Array.isArray(dependencies)) {
      for (const [name, child] of Object.entries(dependencies)) {
        if (isSchema(child)) visit(child, `${path}/dependencies/${escapePointerSegment(name)}`);
      }
    }
  }
  if (!isSchema(schema) || typeof schema === "boolean") return;
  visit(schema, "");
}

export function checkSchema(schema: JsonSchema, options: CheckOptions = {}): SchemaIssue[] {
  if (!isSchema(schema)) throw new TypeError("Schema must be a JSON Schema object or boolean.");
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Options must be an object.");
  }
  const { unsupportedKeywords = [], target = "target validator" } = options;
  if (!Array.isArray(unsupportedKeywords) || unsupportedKeywords.some((key) => typeof key !== "string" || key.length === 0)) {
    throw new TypeError("unsupportedKeywords must be an array of non-empty strings.");
  }
  if (typeof target !== "string" || !target.trim()) throw new TypeError("target must be a non-empty string.");
  const unsupported = new Set(unsupportedKeywords);
  const issues: SchemaIssue[] = [];
  visitSchemas(schema, (current, path) => {
    for (const keyword of unsupported) {
      if (Object.hasOwn(current, keyword)) {
        issues.push({
          keyword,
          path: `${path}/${escapePointerSegment(keyword)}`,
          target,
          message: `"${keyword}" may not be supported by ${target}.`
        });
      }
    }
  });
  return issues;
}
