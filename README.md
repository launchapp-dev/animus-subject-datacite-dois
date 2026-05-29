# animus-subject-datacite-dois

Animus subject backend for DataCite DOI metadata records.

The plugin queries the DataCite REST API, maps DOI records into Animus subjects, and supports local filtering by status, assignee, labels, and update time.

## Configuration

All settings are optional.

| Environment variable | Description |
| --- | --- |
| `DATACITE_QUERY` | DOI metadata search query. Defaults to `machine learning`. |
| `DATACITE_RESOURCE_TYPE` | DataCite resource type filter, such as `Dataset` or `Software`. |
| `DATACITE_PUBLISHER` | DataCite publisher ID filter. |
| `DATACITE_REGISTERED` | Registered date range filter supported by DataCite. |
| `DATACITE_API_URL` | API base URL. Defaults to `https://api.datacite.org`. |
| `DATACITE_LOCAL_QUERY` | Local text query applied after fetch. |
| `DATACITE_LIMIT` | Maximum DOI records to fetch, 1-1000. Defaults to `50`. |

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run manifest
```

## Install

```bash
animus plugin install launchapp-dev/animus-subject-datacite-dois
```
