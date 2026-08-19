# Dynatrace GitHub Action

[![GitHub Super-Linter](https://github.com/dynatrace-oss/dynatrace-github-action/actions/workflows/linter.yaml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/dynatrace-oss/dynatrace-github-action/actions/workflows/ci.yaml/badge.svg)
[![Check dist/](https://github.com/dynatrace-oss/dynatrace-github-action/actions/workflows/check-dist.yaml/badge.svg)](https://github.com/dynatrace-oss/dynatrace-github-action/actions/workflows/check-dist.yaml)
[![CodeQL](https://github.com/dynatrace-oss/dynatrace-github-action/actions/workflows/codeql.yaml/badge.svg)](https://github.com/dynatrace-oss/dynatrace-github-action/actions/workflows/codeql.yaml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

This GitHub Action enables CI/CD workflows to report
[Events](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/events-v2)
and
[Metrics](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/metric-v2)
to a Dynatrace monitoring environment using the REST API. For additional context
and details please refer to the
[Dynatrace API](https://docs.dynatrace.com/docs/dynatrace-api).

This repository was bootstrapped using the
[typescript-action](https://github.com/actions/typescript-action) template.

---

- [Dynatrace GitHub Action](#dynatrace-github-action)
  - [Tags](#tags)
  - [Usage](#usage)
    - [Inputs](#inputs)
    - [API Tokens](#api-tokens)
      - [Classic Access Tokens](#classic-access-tokens)
      - [Platform Tokens](#platform-tokens)
    - [Metric Formats](#metric-formats)
    - [Event Types](#event-types)
    - [SDLC Events](#sdlc-events)
  - [Examples](#examples)
    - [Sending a Metric](#sending-a-metric)
    - [Sending an Event](#sending-an-event)
    - [Sending an Event to Smartscape 2 Nodes](#sending-an-event-to-smartscape-2-nodes)
    - [Sending an SDLC Event](#sending-an-sdlc-event)
  - [Local Development](#local-development)
    - [Smoke Testing Against a Real Tenant](#smoke-testing-against-a-real-tenant)
  - [Support](#support)
  - [Contributing](#contributing)
  - [License](#license)

## Tags

The following tags are available for the `dynatrace-oss/dynatrace-github-action`
action.

- `main`
- `v$MAJOR` (eg: `v2`)
- `v$MAJOR.$MINOR` (eg: `v2.1`)
- `v$MAJOR.$MINOR.$PATCH` (eg: `v2.1.6`)

> [!NOTE]
>
> See to the
> [Releases](https://github.com/dynatrace-oss/dynatrace-github-action/releases)
> page for all available versions.

## Usage

### Inputs

| Name          | Type   | Description                                              | Default    |
| ------------- | ------ | -------------------------------------------------------- | ---------- |
| `url`         | String | Dynatrace URL [1]                                        | _required_ |
| `token`       | String | Dynatrace API-Token                                      | _required_ |
| `metrics`     | YAML   | Inline YAML list of Metrics to send                      | `[]`       |
| `events`      | YAML   | Inline YAML list of Events to send                       | `[]`       |
| `sdlc-events` | YAML   | Inline YAML list of SDLC Events to send via OpenPipeline | `[]`       |

> 1. `url` should be the LIVE Dynatrace domain, eg:
>    `https://{your-environment-id}.live.dynatrace.com`

### API Tokens

#### Classic Access Tokens

For classic tenants, your `token` must be a Dynatrace Access Token (`dt0c01.*`)
with the following permissions granted to it:

- Read Metrics (`metrics.read`)
- Read Events (`events.read`)
- Ingest Metrics (`metrics.ingest`)
- Ingest Events (`events.ingest`)
- Ingest SDLC Events (`openpipeline.events_sdlc`) — required only when using
  `sdlc-events`

> [!NOTE]
>
> `nodeSelectorFilter` requires a Platform Token — classic access tokens cannot
> read Grail data.

#### Platform Tokens

For Platform / Grail tenants, your `token` must be a Dynatrace Platform Token
(`dt0s16.*`) with the following permissions granted to it:

- Read Metrics (`storage:metrics:read`)
- Read Events (`storage:events:read`)
- Ingest Metrics (`storage:metrics:write`)
- Ingest Events (`storage:events:write`)
- Ingest SDLC Events (`openpipeline.events_sdlc`) — required only when using
  `sdlc-events`
- Read Grail buckets (`storage:buckets:read`) and Smartscape
  (`storage:smartscape:read`) — required only when using `nodeSelectorFilter`

### Metric Formats

Optionally supplied Metric formats support the following:

- `gauge`
- `count`

### Event Types

Event types must be one of the following:

- `AVAILABILITY_EVENT`
- `CUSTOM_ALERT`
- `CUSTOM_ANNOTATION`
- `CUSTOM_CONFIGURATION`
- `CUSTOM_DEPLOYMENT`
- `CUSTOM_INFO`
- `ERROR_EVENT`
- `MARKED_FOR_TERMINATION`
- `PERFORMANCE_EVENT`
- `RESOURCE_CONTENTION_EVENT`

### SDLC Events

SDLC (Software Development Lifecycle) events are ingested via the Dynatrace
[OpenPipeline Ingest API](https://docs.dynatrace.com/docs/platform/openpipeline/reference/openpipeline-ingest-api/sdlc-events/events-sdlc-builtin)
at the `/platform/ingest/v1/events.sdlc` endpoint.

Each SDLC event must include the `event.id` field. Any additional properties are
forwarded as-is to the OpenPipeline.

The `token` must have the `openpipeline.events_sdlc` scope.

## Examples

> [!IMPORTANT]
>
> Make sure to use the latest version from the
> [Releases](https://github.com/dynatrace-oss/dynatrace-github-action/releases)
> tab!

### Sending a Metric

The following will send a generic untyped metric named `github.my.custom.metric`
to Dynatrace with a value of `1.0` and several dimensions to filter against. In
this example you could get all metrics for single repository using the
`github.repository` dimension.

```yaml
- name: Send metrics to Dynatrace
  uses: dynatrace-oss/dynatrace-github-action@v9
  with:
    url: ${{ secrets.DT_URL }}
    token: ${{ secrets.DT_TOKEN }}
    metrics: |
      - metric: "github.my.custom.metric"
        value: "1.0"
        dimensions:
          github.repository: "${{ github.repository }}"
          github.ref: "${{ github.ref }}"
          github.event_name: "${{ github.event_name }}"
          github.actor: "${{ github.actor }}"
```

### Sending an Event

The following will send a `INFO` event named `GitHub Event`, targeting the
entity `type(host),entityName(myHost)`, with a several properties on the event.
In this example you could get all events for single repository using the
`github.repository` property.

See the
[Entity Selector](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/entity-v2/entity-selector)
API for help creating selectors. Below are a few examples:

- `type(host),tag(prod)` - Selects all Hosts with a Tag `prod`.
- `type(service),entityName(login)` - Selects all Services with the name `login`

> [!WARNING]
>
> `entitySelector` is **deprecated** and does not work on Dynatrace SaaS tenants
> that have migrated to Smartscape 2 / Grail (Phase 3) — it remains fully
> functional for tenants that haven't migrated yet. For Smartscape 2 tenants,
> use [`nodeSelectorFilter`](#sending-an-event-to-smartscape-2-nodes) instead.

```yaml
- name: Send events to Dynatrace
  uses: dynatrace-oss/dynatrace-github-action@v9
  with:
    url: ${{ secrets.DT_URL }}
    token: ${{ secrets.DT_TOKEN }}
    events: |
      - title: GitHub Event
        type: CUSTOM_INFO
        entitySelector: type(host),entityName(myHost)
        properties:
          source: GitHub
          description: This is an example
          github.repository: "${{ github.repository }}"
          github.ref: "${{ github.ref }}"
          github.event_name: "${{ github.event_name }}"
          github.actor: "${{ github.actor }}"
```

### Sending an Event to Smartscape 2 Nodes

On Dynatrace SaaS tenants using Smartscape 2 / Grail, entities are resolved via
a DQL filter instead of the classic `entitySelector`. Set `nodeSelectorFilter`
to a
[DQL `smartscapeNodes` filter expression](https://docs.dynatrace.com/docs/platform/grail/dynatrace-query-language/commands/smartscape-commands)
and the action will:

1. Query Grail for all Smartscape nodes matching the filter.
1. Send the event once per matched node, automatically attaching
   `dt.smartscape_source.id` and `dt.smartscape_source.type` properties for that
   node (in addition to any `properties` you configure).

If a node matches zero entities, the event is skipped for that run and a warning
is logged — the workflow step is not failed. If both `entitySelector` and
`nodeSelectorFilter` are set on the same event, `nodeSelectorFilter` takes
precedence and `entitySelector` is ignored.

```yaml
- name: Send events to Dynatrace
  uses: dynatrace-oss/dynatrace-github-action@v9
  with:
    url: ${{ secrets.DT_URL }}
    token: ${{ secrets.DT_TOKEN }}
    events: |
      - title: GitHub Event
        type: CUSTOM_INFO
        nodeSelectorFilter: 'type=="SERVICE" and name == "astroshop-shipping"'
        properties:
          source: GitHub
          description: This is an example
          github.repository: "${{ github.repository }}"
          github.ref: "${{ github.ref }}"
          github.event_name: "${{ github.event_name }}"
          github.actor: "${{ github.actor }}"
```

### Sending an SDLC Event

The following sends a deployment SDLC event to the Dynatrace OpenPipeline. Any
additional properties beyond `event.id` are forwarded to the pipeline as-is.

```yaml
- name: Send SDLC event to Dynatrace
  uses: dynatrace-oss/dynatrace-github-action@v9
  with:
    url: ${{ secrets.DT_URL }}
    token: ${{ secrets.DT_TOKEN }}
    sdlc-events: |
      - event.id: "${{ github.run_id }}"
        event.type: deployment
        event.category: DEPLOY
        git.repository: "${{ github.repository }}"
        git.commit: "${{ github.sha }}"
        git.ref: "${{ github.ref }}"
        actor: "${{ github.actor }}"
```

## Local Development

Install the dependencies

```bash
npm install
```

Lint, test and build the TypeScript and package it for distribution

```bash
npm run all
```

### Smoke Testing Against a Real Tenant

`npm test` only runs against mocked HTTP calls. To verify behavior against a
real Dynatrace tenant (e.g. after changing anything in `src/dynatrace.ts`), run
the local-only smoke test scripts. They are **never run in CI** and never touch
GitHub Secrets — they read tenant URLs/tokens from your local environment only.

Create an untracked `.env.smoke-test` file (already gitignored) in the
repository root:

```bash
DT_CLASSIC_URL=https://{classic-environment-id}.live.dynatrace.com
DT_CLASSIC_TOKEN=dt0c01.xxxxx
DT_SMARTSCAPE_URL=https://{smartscape-2-environment-id}.live.dynatrace.com
DT_SMARTSCAPE_TOKEN=dt0c01.xxxxx
# Optional overrides:
# DT_ENTITY_SELECTOR=type(HOST)
# DT_SMARTSCAPE_NODE_FILTER=type=="HOST"
```

Then run either or both, depending on which tenant you want to verify against:

```bash
npm run smoke:classic     # entitySelector + a metric, against a classic tenant
npm run smoke:smartscape  # entitySelector (expected no-op) + nodeSelectorFilter, against a Smartscape 2 / Grail tenant
```

Each prints the result of every scenario so you can cross-check the actual
events/metrics in the Dynatrace UI.

## Support

This open source project is **community-supported**. It is not officially
supported by Dynatrace. For questions, bug reports, and feature requests, please
use
[GitHub Issues](https://github.com/dynatrace-oss/dynatrace-github-action/issues).

## Contributing

Bug reports and pull requests are welcome on GitHub at
<https://github.com/dynatrace-oss/dynatrace-github-action>. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request and note
that all participants are expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

See [LICENSE](LICENSE)
