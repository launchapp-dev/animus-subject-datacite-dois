import { describe, expect, it } from "vitest";
import {
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
} from "./index";

const config = {
  apiUrl: "https://api.datacite.org",
  query: "machine learning",
  limit: 50,
};

const record = {
  id: "10.5281/zenodo.20447933",
  type: "dois",
  attributes: {
    doi: "10.5281/zenodo.20447933",
    url: "https://zenodo.org/records/20447933",
    titles: [{ title: "SapFlower: An automated tool for sap flow data preprocessing" }],
    descriptions: [{ description: "A software record that uses deep learning.", descriptionType: "Abstract" }],
    creators: [{ name: "Ada Lovelace" }, { givenName: "Grace", familyName: "Hopper" }],
    publisher: "Zenodo",
    publicationYear: 2026,
    types: { resourceTypeGeneral: "Software", resourceType: "Tool" },
    subjects: [{ subject: "machine learning" }, { subject: "sap flow" }],
    registered: "2026-05-28T17:59:53Z",
    updated: "2026-05-29T15:00:00Z",
    state: "findable",
    version: "1.0.0",
    language: "en",
  },
};

describe("DataCite DOI helpers", () => {
  it("builds ids", () => {
    expect(doiSubjectId("10.5281/zenodo.20447933")).toBe("datacite.doi:10.5281%2Fzenodo.20447933");
    expect(parseDoiSubjectId("datacite.doi:10.5281%2Fzenodo.20447933")).toBe("10.5281/zenodo.20447933");
  });

  it("maps records to subjects", () => {
    const subject = subjectFromRecord(config, record, "2026-05-29T16:00:00Z");
    expect(subject.id).toBe("datacite.doi:10.5281%2Fzenodo.20447933");
    expect(subject.kind).toBe("datacite.doi");
    expect(subject.status).toBe("done");
    expect(subject.native_status).toBe("findable");
    expect(subject.assignee).toBe("Ada Lovelace");
    expect(subject.custom?.publication_year).toBe(2026);
  });

  it("extracts creators, subjects, status, and priority", () => {
    expect(doiFromRecord(record)).toBe("10.5281/zenodo.20447933");
    expect(creatorNames(record)).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(subjectsFromRecord(record)).toEqual(["machine learning", "sap flow"]);
    expect(nativeStatus(record)).toBe("findable");
    expect(statusFromRecord(record)).toBe("done");
    expect(priorityFromRecord(record, 2026)).toBe(1);
    expect(priorityFromRecord({ ...record, attributes: { ...record.attributes, publicationYear: 2010 } }, 2026)).toBe(3);
  });

  it("labels and filters records", () => {
    expect(labelsFromRecord(config, record)).toEqual([
      "datacite",
      "findable",
      "query:machine learning",
      "type:Software",
      "publisher:Zenodo",
      "year:2026",
      "creator:Ada Lovelace",
      "creator:Grace Hopper",
    ]);
    expect(matchesConfiguredFilters({ ...config, localQuery: "sap flow" }, record)).toBe(true);
    expect(matchesConfiguredFilters({ ...config, localQuery: "does-not-match" }, record)).toBe(false);
    expect(matchesFilters(config, record, { labels_all: ["datacite", "type:Software"] })).toBe(true);
  });

  it("normalizes timestamps", () => {
    expect(toIso("2026-05-29T15:00:00Z")).toBe("2026-05-29T15:00:00.000Z");
    expect(toIso(undefined)).toBeUndefined();
  });
});
