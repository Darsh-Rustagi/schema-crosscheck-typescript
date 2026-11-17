# schema-crosscheck-typescript

TypeScript version of `schema-crosscheck`: a static JSON Schema scanner and a runner that compares Ajv and Zod 4 validation results for supplied inputs. A finite set of matching results does not prove that validators are equivalent.

## Requirements and install

Node.js 20 or newer is required.

```sh
npm install
npm run build
npm link                    # optional: install the CLI locally
```

The published package includes compiled ESM JavaScript and TypeScript declarations. Ajv validates the original JSON Schema; Zod's `fromJSONSchema` importer validates the converted schema.

## CLI

Scan a schema file or directory. Hidden directories and `node_modules` are excluded, and `*.cases.json` files are skipped.

```sh
schema-crosscheck-typescript check ./schemas --target Zod --unsupported '$dynamicRef'
schema-crosscheck-typescript check ./schemas --target Zod --unsupported '$dynamicRef' --format json
```

Compare a schema with named inputs from a JSON case file:

```sh
schema-crosscheck-typescript compare ./schemas/user.schema.json ./schemas/user.cases.json
schema-crosscheck-typescript compare ./schemas/user.schema.json ./schemas/user.cases.json --format json
```

Case file format:

```json
[
  { "name": "valid user", "input": { "name": "Alex", "age": 20 } },
  { "name": "invalid age", "input": { "name": "Alex", "age": "wrong" } }
]
```

Exit codes are `0` when execution succeeds with no warnings or mismatches, `1` when scanner warnings or validation mismatches are found, and `2` for invalid arguments, unreadable or malformed files, schema compilation errors, or conversion failures. JSON output is written to stdout; actionable errors may be written to stderr.

## TypeScript API

```ts
import { checkSchema, compareSchema } from "schema-crosscheck-typescript";
import type { JsonSchema, CompareReport } from "schema-crosscheck-typescript";

const schema: JsonSchema = {
  type: "object",
  properties: { name: { type: "string" }, age: { type: "integer" } }
};

const issues = checkSchema(schema, {
  target: "Zod",
  unsupportedKeywords: ["$dynamicRef"]
});

const report: CompareReport = compareSchema(schema, [
  { name: "valid", input: { name: "Alex", age: 20 } },
  { name: "wrong age type", input: { name: "Alex", age: "old" } }
]);
console.log(issues, report.mismatches);
```

`checkSchema(schema, options)` accepts object or boolean schemas and traverses schema-valued keywords, including properties, definitions, items, composition branches, and conditionals. Issue locations are JSON Pointers with escaped segments. The caller supplies `unsupportedKeywords` and `target`; a warning is a configured finding, not proof of a validator bug.

`compareSchema(schema, inputs, options)` accepts a non-empty array of raw values or `{ name, input }` cases. It returns the conversion status, counts, per-input Ajv and Zod results and errors, mismatches, and known unsupported-feature notes. Compilation and conversion failures include a stage and message. Invalid API arguments throw `TypeError`.

## Dialects and limits

Ajv is selected for draft-07 by default, draft 2019-09 when `$schema` names that dialect, and draft 2020-12 when it names that dialect. Other dialect identifiers are reported as compilation failures. Zod's importer does not implement every JSON Schema feature or semantic detail. Unsupported constructs may be ignored, rejected during conversion, or produce a disagreement. The report identifies `$dynamicRef` and `$dynamicAnchor` as unsupported by the tested Zod importer.

The included `dynamic-ref` fixture records a disagreement with Ajv 8.20.0 and Zod 4.5.0: Ajv rejects a string at a recursively referenced numeric `value`, while Zod accepts it. Treat this as observed behavior for those dependency versions and inputs; rerun the fixture after upgrading dependencies.

The package is distributed under the MIT License; see [LICENSE](LICENSE).
