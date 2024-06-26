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
    - [API Token](#api-token)
    - [Metric Formats](#metric-formats)
    - [Event Types](#event-types)
  - [Examples](#examples)
    - [Sending a Metric](#sending-a-metric)
    - [Sending an Event](#sending-an-event)
  - [Local Development](#local-development)
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

| Name      | Type   | Description                         | Default    |
| --------- | ------ | ----------------------------------- | ---------- |
| `url`     | String | Dynatrace URL [1]                   | _required_ |
| `token`   | String | Dynatrace API-Token                 | _required_ |
| `metrics` | YAML   | Inline YAML list of Metrics to send | `[]`       |
| `events`  | YAML   | Inline YAML list of Events to send  | `[]`       |

> 1. `url` should be the LIVE Dynatrace domain, eg:
>    `https://{your-environment-id}.live.dynatrace.com`

### API Token

Your `token` must be Dynatrace APIv2 Token with the following permissions
granted to it:

- Read Metrics
- Read Events
- Ingest Metrics
- Ingest Events

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

## Local Development

Install the dependencies

```bash
npm install
```

Lint, test and build the TypeScript and package it for distribution

```bash
npm run all
```

## Contributing

Bug reports and pull requests are welcome on GitHub at
<https://github.com/dynatrace-oss/dynatrace-github-action>.

## License

See [LICENSE](LICENSE)
