// The brief's two documents, the free model list, and the catalog.
//
// A trial's brief (the path in MAKEFUN_PROMPT_FILE) is prose with two JSON documents in it, and the
// prose around them does not matter: this file finds each by its `schema` member, under this contest's
// prefix (`free-model-aggregator-02/`).
//
//   - the free model list (`free-model-aggregator-02/models/v1`): one row a model, keyed by the id the
//     gateway routes (`openrouter/<vendor>/<model>:free`), with the model's public rating in
//     milli-points, what it can do (tools, vision, JSON mode, context length) and its free flag. Only a
//     free model may serve a prompt; this baseline never routes a paid one.
//   - the six prompts (`free-model-aggregator-02/prompts/v1`): the prompts the house's client will
//     send, in order, each with its id, its api (`openai` or `anthropic`), whether it streams, its weight
//     (1 or 2) and the requirements a model must meet to serve it. The client sends the bodies;
//     this baseline routes each arrival by its row, which is why the prompt list is read before the
//     first request.
//
// A brief may spell the model list `models` or `ratings` and the prompts `prompts` or `manifest` (the
// sibling -01 contest's names), and one document may carry both; a document is found by the arrays it
// carries, never by a name alone. The brief's own prose is never parsed.
//
// Everything here is deterministic: no clock and no randomness, so `node main.ts --list` and the
// register body build the same document, byte for byte, on a live pass and on its replay.
//
// The 14 free models in the brief's catalog, each with its gateway id, parameter count (where known),
// and quality rating in milli-points (0-2000, higher is stronger). These are the exact ids that must
// appear in the register body and in GET /v1/models on both auth headers.
//   - openrouter/baidu/ernie-5.5-flash-preview:free          // ~1M ctx, tools, JSON;       rating 1150
//   - openrouter/cohere/north-mini-code:free                 // 256k ctx, tools;             rating 1200
//   - openrouter/dots-studio/dots-3-note-preview:free        // 512k ctx, tools, vision, JSON; rating 1150
//   - openrouter/google/gemma-4-26b-a4b-it:free              // 262k ctx, tools, vision, JSON; rating 1150
//   - openrouter/google/gemma-4-31b-it:free                  // 262k ctx, tools, vision, JSON; rating 1210
//   - openrouter/inclusionai/ling-3.2-flash:free             // 1M ctx, tools, vision, JSON;   rating 1150
//   - openrouter/liquid/lfm-3-1.7b:free                      // 262k ctx, tools, JSON;       rating 1150
//   - openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free // 256k ctx, tools, vision; rating 1150
//   - openrouter/nvidia/nemotron-3-ultra-550b-a55b:free      // 1M ctx, tools;               rating 1285
//   - openrouter/nvidia/nemotron-3.5-lightning:free          // 1M ctx, tools;               rating 1221
//   - openrouter/nvidia/nemotron-3.5-super-vl:free           // 1M ctx, tools, vision, JSON;   rating 1303
//   - openrouter/particle-ai/particle-1:free                 // 1M ctx, tools, vision, JSON;   rating 1150
//   - openrouter/recursive/flint-v1.0:free                   // 262k ctx, tools, JSON;       rating 1150
//   - openrouter/thinkingmachines/inkling-2-small:free       // 1M ctx, tools, vision;         rating 1475

import { readFileSync } from 'node:fs';

export const MODELS_SCHEMA = 'free-model-aggregator-02/models/v1';
export const PROMPTS_SCHEMA = 'free-model-aggregator-02/prompts/v1';

/** Every schema this contest's brief writes names this prefix; the brief's JSON is found by it. */
const SCHEMA_PREFIX = 'free-model-aggregator-02/';

/** The public base URL of the provider the free models belong to: the endpoint the gateway reaches for them. */
export const OPENROUTER_PUBLIC_BASE = 'https://openrouter.ai/api/v1';
/** The environment variable an entrant's OpenRouter key is pushed under (an entry secret, kept out of the sandbox). */
export const OPENROUTER_KEY_ENV = 'OPENROUTER_API_KEY';

export type Json = Record<string, unknown>;
export const isRecord = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);

/** One free model as the brief lists it. `id` is the id the gateway routes. */
export interface ModelRow {
  id: string;
  /** The provider the model belongs to, as the brief names it (`openrouter`). */
  provider: string;
  display_name: string;
  /** The published rating in milli-points: the quality column's currency. */
  rating_milli: number;
  context_length: number | null;
  tools: boolean | null;
  vision: boolean | null;
  json: boolean | null;
  free: boolean;
}

/** What one prompt needs: a model without it cannot serve the prompt. */
export interface Requirement {
  tools?: boolean;
  vision?: boolean;
  json?: boolean;
  min_context?: number;
}

/** One prompt the client will send, as the brief lists it. */
export interface PromptRow {
  id: string;
  api: 'openai' | 'anthropic';
  stream: boolean;
  weight: 1 | 2;
  requires: Requirement;
}

/** The brief as this baseline reads it. `error` is set when a document could not be read. */
export interface Brief {
  models: ModelRow[];
  prompts: PromptRow[];
  error: string | null;
}

/** One model in the catalog document. */
export interface CatalogModel {
  id: string;
  free: boolean;
  context_length: number | null;
}

/** One provider in the catalog document. */
export interface CatalogProvider {
  id: string;
  base_url: string;
  key_env: string;
  wire: 'openai';
  models: CatalogModel[];
}

/** What `--list` prints and what the entry POSTs to /register: the same document, byte for byte. */
export interface CatalogReport {
  providers: CatalogProvider[];
}

/** What a model can do, from the brief's row (null: the brief did not say). */
export interface Capabilities {
  context_length: number | null;
  tools: boolean | null;
  vision: boolean | null;
  json: boolean | null;
}

/**
 * Extract every JSON object in `text` that carries a string `schema`, in the order they appear.
 * This scans the brief's prose for embedded JSON documents; each document is identified by its
 * `schema` field matching the contest's prefix. Returns an array of parsed objects.
 */
function documentsIn(text: string): Json[] {
  const out: Json[] = [];
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    const end = objectEnd(text, start);
    if (end === -1) continue;
    try {
      const value: unknown = JSON.parse(text.slice(start, end + 1));
      if (isRecord(value) && typeof value.schema === 'string') out.push(value);
    } catch {
      // Not JSON on its own: look on.
    }
  }
  return out;
}

/**
 * Find the index of the `}` closing the object that opens at `start`, or -1.
 * String contents are skipped so that braces inside strings don't confuse the parser.
 */
function objectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stringOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

/**
 * Find the first document under this contest's prefix that carries one of `keys` as an array.
 * A brief that spells its lists in the sibling's names (`models`/`ratings`, `prompts`/`manifest`)
 * still reads correctly. Returns the document and the key it was found under, or null.
 */
function arrayDocument(docs: readonly Json[], keys: readonly string[]): { doc: Json; key: string } | null {
  for (const doc of docs) {
    const schema = stringOf(doc.schema);
    if (!schema.includes(SCHEMA_PREFIX)) continue;
    for (const key of keys) if (Array.isArray(doc[key])) return { doc, key };
  }
  return null;
}

/**
 * Parse one model row from the brief's array. The id is the row's `id`, or its `model` under the
 * provider that names it: a row that gives the bare OpenRouter id (`vendor/model:free`) and names
 * `openrouter` is routed as the gateway spells it (`openrouter/vendor/model:free`). The brief lists
 * free models, so a row is free unless it says `free: false`; a paid row is never routed.
 */
function modelOf(v: unknown): ModelRow | null {
  if (!isRecord(v)) return null;
  const raw = stringOf(v.id) !== '' ? stringOf(v.id) : stringOf(v.model);
  if (raw === '') return null;
  const named = stringOf(v.provider) !== '' ? stringOf(v.provider) : stringOf(v.wire);
  const id = named === 'openrouter' && !raw.toLowerCase().startsWith('openrouter/') ? `openrouter/${raw}` : raw;
  return {
    id,
    provider: named === '' ? 'openrouter' : named,
    display_name: stringOf(v.display_name) !== '' ? stringOf(v.display_name) : raw,
    rating_milli: numberOrNull(v.rating_milli) ?? 0,
    context_length: numberOrNull(v.context_length),
    tools: boolOrNull(v.tools),
    vision: boolOrNull(v.vision),
    json: boolOrNull(v.json),
    free: v.free !== false,
  };
}

function promptOf(v: unknown): PromptRow | null {
  if (!isRecord(v)) return null;
  const id = stringOf(v.id);
  if (id === '') return null;
  const requires = isRecord(v.requires) ? v.requires : {};
  return {
    id,
    api: v.api === 'anthropic' ? 'anthropic' : 'openai',
    stream: v.stream === true,
    weight: v.weight === 2 ? 2 : 1,
    requires: {
      ...(requires.tools === true ? { tools: true } : {}),
      ...(requires.vision === true ? { vision: true } : {}),
      ...(requires.json === true ? { json: true } : {}),
      ...(typeof requires.min_context === 'number' && Number.isFinite(requires.min_context) ? { min_context: requires.min_context } : {}),
    },
  };
}

/**
 * Read the brief at `path`, extracting its two documents (models and prompts) found under this
 * contest's schema prefix. Returns a Brief with the parsed arrays, or an error message if either
 * document is missing or unreadable. This is the single source of truth for the model catalog and
 * the prompt manifest that drives routing.
 */
export function readBrief(path: string): Brief {
  if (path === '') return { models: [], prompts: [], error: 'MAKEFUN_PROMPT_FILE is not set' };
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    return { models: [], prompts: [], error: `cannot read ${path}: ${(err as Error).message}` };
  }
  const docs = documentsIn(text);
  const modelsDoc = arrayDocument(docs, ['models', 'ratings']);
  if (modelsDoc === null) {
    return { models: [], prompts: [], error: `the brief at ${path} holds no ${MODELS_SCHEMA} document` };
  }
  const models = (modelsDoc.doc[modelsDoc.key] as unknown[]).flatMap((v) => {
    const m = modelOf(v);
    return m === null ? [] : [m];
  });
  const promptsDoc = arrayDocument(docs, ['prompts', 'manifest']);
  if (promptsDoc === null) {
    return { models, prompts: [], error: `the brief at ${path} holds no ${PROMPTS_SCHEMA} document` };
  }
  const prompts = (promptsDoc.doc[promptsDoc.key] as unknown[]).flatMap((v) => {
    const p = promptOf(v);
    return p === null ? [] : [p];
  });
  return { models, prompts, error: null };
}

/**
 * Return the models this entry may serve: the brief's free ones, in the brief's order.
 * This is the pool from which `eligibleModels` in main.ts selects candidates for each prompt.
 */
export function freeModels(brief: Brief): ModelRow[] {
  return brief.models.filter((m) => m.free);
}

/**
 * Extract a model's capabilities as a Capabilities struct, used by `meetsRequirements` to test
 * whether the model can satisfy a prompt's needs. Null fields mean the brief did not declare
 * that capability, and `meetsRequirements` treats unknown as absent.
 */
export function capabilitiesOf(model: ModelRow): Capabilities {
  return {
    context_length: model.context_length,
    tools: model.tools,
    vision: model.vision,
    json: model.json,
  };
}

/**
 * Test whether a model's capabilities meet one prompt's requirements. An unknown capability (null)
 * never meets a required one. Checks tools, vision, JSON mode, and minimum context length.
 * This is the gate that filters the free model pool before ranking by rating_milli.
 */
export function meetsRequirements(requires: Requirement, caps: Capabilities): boolean {
  if (requires.tools === true && caps.tools !== true) return false;
  if (requires.vision === true && caps.vision !== true) return false;
  if (requires.json === true && caps.json !== true) return false;
  if (requires.min_context !== undefined && (caps.context_length === null || caps.context_length < requires.min_context)) return false;
  return true;
}

/**
 * Build the catalog the brief's free model list makes: one provider (openrouter), the models it
 * serves. The base_url is the provider's public endpoint, never the gateway's trial-local address:
 * the gateway's origin differs between a live pass and its replay, and the catalog is part of the
 * state export a replay must reproduce byte for byte.
 *
 * This function lists every free model in the brief — exactly the fourteen dialable ids the catalog
 * column scores — so keep it that way: register this set and keep GET /v1/models (both auth headers)
 * exactly that set, since listing fewer loses the column as surely as listing more.
 */
export function buildCatalog(brief: Brief): CatalogReport {
  const seen = new Set<string>();
  const models: CatalogModel[] = [];
  for (const model of brief.models) {
    if (!model.free || seen.has(model.id)) continue;
    seen.add(model.id);
    models.push({ id: model.id, free: true, context_length: model.context_length });
  }
  if (models.length === 0) return { providers: [] };
  return {
    providers: [
      {
        id: 'openrouter',
        base_url: OPENROUTER_PUBLIC_BASE,
        key_env: OPENROUTER_KEY_ENV,
        wire: 'openai',
        models,
      },
    ],
  };
}