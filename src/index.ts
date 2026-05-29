import { definePlugin, PluginKind, type Subject, type SubjectBackend, type SubjectListParams, type SubjectStatus } from "@launchapp-dev/animus-plugin-sdk";

const NAME = "animus-subject-datacite-dois";
const VERSION = "0.1.0";
const SUBJECT_KIND = "datacite.doi";
const DEFAULT_API_URL = "https://api.datacite.org";
const DEFAULT_QUERY = "machine learning";

interface Config {
  apiUrl: string;
  query: string;
  resourceType?: string;
  publisher?: string;
  registered?: string;
  localQuery?: string;
  limit: number;
}

interface DataCitePerson {
  name?: string;
  nameType?: string;
  givenName?: string;
  familyName?: string;
  affiliation?: Array<{ name?: string }>;
}

interface DataCiteDate {
  date?: string;
  dateType?: string;
}

interface DataCiteTitle {
  title?: string;
  titleType?: string;
}

interface DataCiteDescription {
  description?: string;
  descriptionType?: string;
}

interface DataCiteSubject {
  subject?: string;
  subjectScheme?: string;
}

interface DataCiteDoiAttributes {
  doi?: string;
  url?: string;
  titles?: DataCiteTitle[];
  descriptions?: DataCiteDescription[];
  creators?: DataCitePerson[];
  contributors?: DataCitePerson[];
  publisher?: string;
  publicationYear?: number;
  types?: { resourceTypeGeneral?: string; resourceType?: string; schemaOrg?: string; bibtex?: string };
  subjects?: DataCiteSubject[];
  dates?: DataCiteDate[];
  registered?: string;
  updated?: string;
  state?: string;
  version?: string;
  language?: string;
}

interface DataCiteDoi {
  id?: string;
  type?: string;
  attributes?: DataCiteDoiAttributes;
}

interface DataCiteListResponse {
  data?: DataCiteDoi[];
  meta?: { total?: number };
}

interface DataCiteGetResponse {
  data?: DataCiteDoi;
}

function optionalEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw === "" ? undefined : raw;
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  return (raw ?? fallback).replace(/\/+$/, "");
}

function readPositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function readConfig(): Config {
  return {
    apiUrl: normalizeBaseUrl(optionalEnv("DATACITE_API_URL"), DEFAULT_API_URL),
    query: optionalEnv("DATACITE_QUERY") ?? DEFAULT_QUERY,
    resourceType: optionalEnv("DATACITE_RESOURCE_TYPE"),
    publisher: optionalEnv("DATACITE_PUBLISHER"),
    registered: optionalEnv("DATACITE_REGISTERED"),
    localQuery: optionalEnv("DATACITE_LOCAL_QUERY"),
    limit: readPositiveInt(optionalEnv("DATACITE_LIMIT"), 50, 1000),
  };
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}

function decodePart(value: string): string {
  return decodeURIComponent(value);
}

function doiSubjectId(doi: string): string {
  return `${SUBJECT_KIND}:${encodePart(doi.toLowerCase())}`;
}

function parseDoiSubjectId(id: string): string {
  const raw = id.startsWith(`${SUBJECT_KIND}:`) ? id.slice(`${SUBJECT_KIND}:`.length) : id;
  const doi = decodePart(raw).trim().toLowerCase();
  if (!doi.includes("/")) throw new Error(`expected id '${SUBJECT_KIND}:<doi>', got '${id}'`);
  return doi;
}

function doiFromRecord(record: DataCiteDoi): string {
  return (record.attributes?.doi ?? record.id ?? "").toLowerCase();
}

function firstTitle(record: DataCiteDoi): string | undefined {
  return record.attributes?.titles?.find((title) => title.title)?.title;
}

function firstDescription(record: DataCiteDoi): string | undefined {
  return record.attributes?.descriptions?.find((desc) => desc.description)?.description;
}

function creatorNames(record: DataCiteDoi): string[] {
  return (record.attributes?.creators ?? []).map((creator) => creator.name ?? [creator.givenName, creator.familyName].filter(Boolean).join(" ")).filter(Boolean);
}

function subjectsFromRecord(record: DataCiteDoi): string[] {
  return (record.attributes?.subjects ?? []).map((subject) => subject.subject).filter((subject): subject is string => Boolean(subject));
}

function toIso(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const millis = Date.parse(String(value));
  return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined;
}

function nativeStatus(record: DataCiteDoi): string {
  return record.attributes?.state ?? record.attributes?.types?.resourceTypeGeneral ?? "doi";
}

function statusFromRecord(_record: DataCiteDoi): SubjectStatus {
  return "done";
}

function priorityFromRecord(record: DataCiteDoi, nowYear = new Date().getUTCFullYear()): number {
  const year = record.attributes?.publicationYear;
  if (!year) return 3;
  const age = Math.max(0, nowYear - year);
  if (age <= 1) return 1;
  if (age <= 5) return 2;
  return 3;
}

function labelsFromRecord(config: Config, record: DataCiteDoi): string[] {
  const attrs = record.attributes ?? {};
  const labels = new Set<string>(["datacite", nativeStatus(record), `query:${config.query}`]);
  if (attrs.types?.resourceTypeGeneral) labels.add(`type:${attrs.types.resourceTypeGeneral}`);
  if (attrs.publisher) labels.add(`publisher:${attrs.publisher}`);
  if (attrs.publicationYear) labels.add(`year:${attrs.publicationYear}`);
  for (const creator of creatorNames(record).slice(0, 3)) labels.add(`creator:${creator}`);
  return [...labels];
}

function subjectFromRecord(config: Config, record: DataCiteDoi, fetchedAt = new Date().toISOString()): Subject {
  const attrs = record.attributes ?? {};
  const doi = doiFromRecord(record);
  const updatedAt = toIso(attrs.updated) ?? toIso(attrs.registered) ?? fetchedAt;
  const creators = creatorNames(record);
  return {
    id: doiSubjectId(doi),
    kind: SUBJECT_KIND,
    title: firstTitle(record) ?? doi,
    description: firstDescription(record) ?? `DataCite DOI ${doi}`,
    status: statusFromRecord(record),
    created_at: toIso(attrs.registered) ?? updatedAt,
    updated_at: updatedAt,
    labels: labelsFromRecord(config, record),
    assignee: creators[0],
    url: attrs.url ?? (doi ? `https://doi.org/${doi}` : undefined),
    native_status: nativeStatus(record),
    priority: priorityFromRecord(record),
    custom: {
      doi,
      publisher: attrs.publisher,
      publication_year: attrs.publicationYear,
      type: attrs.types,
      creators,
      contributors: attrs.contributors,
      subjects: subjectsFromRecord(record),
      dates: attrs.dates,
      registered: attrs.registered,
      updated: attrs.updated,
      version: attrs.version,
      language: attrs.language,
      raw: record,
    },
  };
}

function matchesConfiguredFilters(config: Config, record: DataCiteDoi): boolean {
  if (!config.localQuery) return true;
  const needle = config.localQuery.toLowerCase();
  const haystack = [
    doiFromRecord(record),
    firstTitle(record),
    firstDescription(record),
    record.attributes?.publisher,
    record.attributes?.types?.resourceTypeGeneral,
    record.attributes?.types?.resourceType,
    ...creatorNames(record),
    ...subjectsFromRecord(record),
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function matchesFilters(config: Config, record: DataCiteDoi, params: SubjectListParams): boolean {
  if (!matchesConfiguredFilters(config, record)) return false;
  const subject = subjectFromRecord(config, record);
  if (params.status && params.status.length > 0 && !params.status.includes(subject.status)) return false;
  if (params.assignee && params.assignee.length > 0 && (!subject.assignee || !params.assignee.includes(subject.assignee))) return false;
  const labels = new Set(subject.labels ?? []);
  if (params.labels_all && !params.labels_all.every((label) => labels.has(label))) return false;
  if (params.labels_any && params.labels_any.length > 0 && !params.labels_any.some((label) => labels.has(label))) return false;
  if (params.updated_since && new Date(subject.updated_at) < new Date(params.updated_since)) return false;
  return true;
}

class DataCiteDoisClient {
  constructor(private readonly config: Config) {}

  async requestJson<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.config.apiUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.api+json",
        "User-Agent": `${NAME}/${VERSION} (https://github.com/launchapp-dev/${NAME}; mailto:opensource@launchapp.dev)`,
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`DataCite API ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    return JSON.parse(text) as T;
  }

  async list(): Promise<DataCiteDoi[]> {
    const response = await this.requestJson<DataCiteListResponse>("/dois", {
      query: this.config.query,
      "page[size]": this.config.limit,
      "resource-type-id": this.config.resourceType,
      "publisher-id": this.config.publisher,
      registered: this.config.registered,
    });
    return response.data ?? [];
  }

  async get(doi: string): Promise<DataCiteDoi> {
    const response = await this.requestJson<DataCiteGetResponse>(`/dois/${encodePart(doi)}`);
    if (!response.data) throw new Error(`DataCite DOI not found: ${doi}`);
    return response.data;
  }
}

function buildBackend(): SubjectBackend {
  let cached: { client: DataCiteDoisClient; config: Config } | null = null;
  const runtime = (): { client: DataCiteDoisClient; config: Config } => {
    if (!cached) {
      const config = readConfig();
      cached = { client: new DataCiteDoisClient(config), config };
    }
    return cached;
  };
  return {
    async list(params) {
      const { client, config } = runtime();
      const records = await client.list();
      return {
        subjects: records.filter((record) => matchesFilters(config, record, params)).map((record) => subjectFromRecord(config, record)),
        next_cursor: null,
        fetched_at: new Date().toISOString(),
      };
    },
    async get(params) {
      const { client, config } = runtime();
      return subjectFromRecord(config, await client.get(parseDoiSubjectId(params.id)));
    },
    schema() {
      return {
        kinds: [SUBJECT_KIND],
        status_values: ["ready", "in-progress", "blocked", "done", "cancelled"],
        supports_watch: false,
        supports_create: false,
        supports_pagination: false,
        native_status_values: ["findable", "registered", "draft", "doi"],
        status_dispatch_hints: [{ native_status: "findable", status: "done" }],
        custom_fields: ["doi", "publisher", "publication_year", "type", "creators", "contributors", "subjects", "dates", "registered", "updated", "version", "language", "raw"],
      };
    },
    async health() {
      try {
        const { client } = runtime();
        await client.list();
        return { status: "healthy", uptime_ms: null, memory_usage_bytes: null, last_error: null };
      } catch (err) {
        return { status: "unhealthy", uptime_ms: null, memory_usage_bytes: null, last_error: String(err) };
      }
    },
  };
}

export {
  DataCiteDoisClient,
  creatorNames,
  doiFromRecord,
  doiSubjectId,
  labelsFromRecord,
  matchesConfiguredFilters,
  matchesFilters,
  nativeStatus,
  parseDoiSubjectId,
  priorityFromRecord,
  statusFromRecord,
  subjectFromRecord,
  subjectsFromRecord,
  toIso,
};

const plugin = definePlugin({
  kind: PluginKind.SubjectBackend,
  name: NAME,
  version: VERSION,
  description: "DataCite DOI metadata subject backend plugin for Animus",
  subject_kinds: [SUBJECT_KIND],
  env_required: [
    { name: "DATACITE_QUERY", description: `Optional DOI metadata search query. Defaults to ${DEFAULT_QUERY}.`, required: false },
    { name: "DATACITE_RESOURCE_TYPE", description: "Optional DataCite resource type filter, such as Dataset or Software.", required: false },
    { name: "DATACITE_PUBLISHER", description: "Optional DataCite publisher ID filter.", required: false },
    { name: "DATACITE_REGISTERED", description: "Optional registered date range filter supported by DataCite.", required: false },
    { name: "DATACITE_API_URL", description: `Optional DataCite API base URL. Defaults to ${DEFAULT_API_URL}.`, required: false },
    { name: "DATACITE_LOCAL_QUERY", description: "Optional local text query applied to DOI records after fetch.", required: false },
    { name: "DATACITE_LIMIT", description: "Optional maximum DOI count from 1 to 1000. Defaults to 50.", required: false },
  ],
  impl: buildBackend(),
});

function isDirectRun(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("index.cjs") || entry.endsWith("index.js") || entry.endsWith(NAME);
}

if (isDirectRun()) {
  plugin.run().catch((err) => {
    process.stderr.write(`[${NAME}] fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
