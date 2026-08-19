/*
Copyright 2024 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

// Local-only smoke test against a Smartscape 2 / Grail Dynatrace tenant.
// Never run in CI - credentials are read from the local environment and
// must never be committed. See README.md > Local Development > Smoke Testing.

// eslint-disable-next-line import/extensions -- required for Node's native TypeScript execution
import * as dt from '../src/dynatrace.ts'
// eslint-disable-next-line import/extensions, import/no-unresolved -- required for Node's native TypeScript execution
import { requireEnv, scenario, expectFailure } from './smoke-lib.mts'

async function main(): Promise<void> {
  const url = requireEnv('DT_SMARTSCAPE_URL')
  const token = requireEnv('DT_SMARTSCAPE_TOKEN')
  const entitySelector = process.env.DT_ENTITY_SELECTOR ?? 'type(HOST)'
  const nodeFilter = process.env.DT_SMARTSCAPE_NODE_FILTER ?? 'type=="HOST"'

  // Dynatrace rejects entitySelector outright on Smartscape 2 / Grail
  // tenants (400, "no longer supported") - this is the correct, expected
  // outcome, not a no-op.
  await expectFailure(
    'smartscape tenant: entitySelector (expected to be rejected)',
    'no longer supported',
    async () =>
      dt.sendEvents(url, token, [
        {
          title: 'Smoke test: entitySelector on Smartscape 2',
          type: 'CUSTOM_INFO',
          entitySelector,
          properties: { source: 'smoke-test' }
        }
      ])
  )

  await scenario(
    'smartscape tenant: nodeSelectorFilter with matches',
    async () =>
      dt.sendEvents(url, token, [
        {
          title: 'Smoke test: nodeSelectorFilter match',
          type: 'CUSTOM_INFO',
          nodeSelectorFilter: nodeFilter,
          properties: { source: 'smoke-test' }
        }
      ])
  )

  await scenario(
    'smartscape tenant: nodeSelectorFilter with zero matches',
    async () =>
      dt.sendEvents(url, token, [
        {
          title: 'Smoke test: nodeSelectorFilter no match',
          type: 'CUSTOM_INFO',
          nodeSelectorFilter:
            'type=="HOST" and name=="definitely-does-not-exist-12345"',
          properties: { source: 'smoke-test' }
        }
      ])
  )

  console.log('\nDone. Cross-check the events in the Smartscape tenant.')
}

try {
  await main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
}
