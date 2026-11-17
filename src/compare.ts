import { Ajv as AjvDraft7, type ValidateFunction } from "ajv";
import { Ajv2019 } from "ajv/dist/2019.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import * as z from "zod";
import { JsonSchema, visitSchemas } from "./check.js";

export interface NamedInput {
  name?: string;
  input: unknown;
}

export type InputCase = unknown | NamedInput;

export interface CompareOptions {
  zod?: Record<string, unknown>;
}

export interface ValidationError {
  instancePath?: string;
  schemaPath?: string;
  keyword?: string;
  message?: string;
  params?: Record<string, unknown>;
  code?: string;
  path?: PropertyKey[];
}

export interface ValidatorResult {
  accepts: boolean;
  errors: ValidationError[];
}

export interface ComparisonResult {
  index: number;
  name: string;
  input: unknown;
  ajv: ValidatorResult;
  zod: ValidatorResult;
  agrees: boolean;
}

export interface UnsupportedFeature {
  validator: "Zod";
  keyword: string;
  path: string;
  message: string;
}

export interface CompareReport {
  conversionSucceeded: boolean;
  totalInputs: number;
  agreements: number;
  mismatchCount: number;
  results: ComparisonResult[];
  mismatches: Array<ComparisonResult & { classification: "unsupported-feature" | "observed-mismatch" }>;
  unsupportedFeatures?: UnsupportedFeature[];
  conversionError?: { stage: "ajv-compilation" | "zod-conversion"; message: string };
}

interface NormalizedInput { index: number; name: string; input: unknown }

function createAjv(schema: JsonSchema): { compile(schema: never): ValidateFunction } {
  const dialect = schema && typeof schema === "object" ? schema.$schema : "";
  const options = { allErrors: true, strict: false };
  if (typeof dialect === "string" && dialect.includes("2020-12")) return new Ajv2020(options);
  if (typeof dialect === "string" && dialect.includes("2019-09")) return new Ajv2019(options);
  if (!dialect || (typeof dialect === "string" && (dialect.includes("draft-07") || dialect.includes("draft/7")))) return new AjvDraft7(options);
  throw new Error(`Unsupported JSON Schema dialect: ${String(dialect)}`);
}

function normalizeCases(inputs: unknown): NormalizedInput[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TypeError("inputs must be a non-empty array.");
  }
  return inputs.map((item: unknown, index: number) => {
    if (item && typeof item === "object" && !Array.isArray(item) && Object.hasOwn(item, "input")) {
      const named = item as Record<string, unknown>;
      if (named.name !== undefined && typeof named.name !== "string") {
        throw new TypeError(`inputs[${index}].name must be a string.`);
      }
      return { index, name: (named.name as string | undefined) ?? `input ${index + 1}`, input: named.input };
    }
    return { index, name: `input ${index + 1}`, input: item };
  });
}

function emptyFailure(cases: NormalizedInput[], stage: "ajv-compilation" | "zod-conversion", error: unknown): CompareReport {
  return {
    conversionSucceeded: false,
    totalInputs: cases.length,
    agreements: 0,
    mismatchCount: 0,
    results: [],
    mismatches: [],
    conversionError: { stage, message: error instanceof Error ? error.message : String(error) }
  };
}

export function compareSchema(schema: JsonSchema, inputs: unknown, options: CompareOptions = {}): CompareReport {
  if (!(typeof schema === "boolean" || (typeof schema === "object" && schema !== null && !Array.isArray(schema)))) {
    throw new TypeError("Schema must be a JSON Schema object or boolean.");
  }
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Options must be an object.");
  }
  const cases = normalizeCases(inputs);
  let validate: ValidateFunction;
  let zodSchema: z.ZodType;
  try {
    validate = createAjv(schema).compile(schema as never);
  } catch (error) {
    return emptyFailure(cases, "ajv-compilation", error);
  }
  try {
    zodSchema = z.fromJSONSchema(schema as never, (options.zod ?? {}) as never);
  } catch (error) {
    return emptyFailure(cases, "zod-conversion", error);
  }

  const unsupportedFeatures: UnsupportedFeature[] = [];
  visitSchemas(schema, (current, path) => {
    for (const keyword of ["$dynamicRef", "$dynamicAnchor"]) {
      if (Object.hasOwn(current, keyword)) unsupportedFeatures.push({
        validator: "Zod", keyword,
        path: `${path}/${keyword}`,
        message: `Zod's JSON Schema importer does not implement ${keyword}; results involving this feature are observed behavior, not supported conversion.`
      });
    }
  });

  const results: ComparisonResult[] = cases.map(({ index, name, input }) => {
    const ajvAccepts = Boolean(validate(input));
    const ajvErrors: ValidationError[] = validate.errors ? validate.errors.map((error) => ({
      instancePath: error.instancePath,
      schemaPath: error.schemaPath,
      keyword: error.keyword,
      ...(error.message === undefined ? {} : { message: error.message }),
      params: error.params
    })) : [];
    const zodResult = zodSchema.safeParse(input);
    const zodAccepts = zodResult.success;
    return {
      index, name, input,
      ajv: { accepts: ajvAccepts, errors: ajvErrors },
      zod: {
        accepts: zodAccepts,
        errors: zodAccepts ? [] : zodResult.error.issues.map(({ code, path, message }) => ({ code, path, message }))
      },
      agrees: ajvAccepts === zodAccepts
    };
  });
  const mismatches = results.filter((result) => !result.agrees).map((result) => ({
    ...result,
    classification: unsupportedFeatures.length ? "unsupported-feature" as const : "observed-mismatch" as const
  }));
  return {
    conversionSucceeded: true,
    totalInputs: cases.length,
    agreements: results.length - mismatches.length,
    mismatchCount: mismatches.length,
    results,
    mismatches,
    unsupportedFeatures
  };
}
