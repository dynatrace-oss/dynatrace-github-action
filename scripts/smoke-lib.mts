/*
Copyright 2024 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable '${name}'`)
  }
  return value
}

export async function scenario(
  name: string,
  run: () => Promise<void>
): Promise<void> {
  console.log(`\n=== ${name} ===`)
  try {
    await run()
    console.log(`--- OK: ${name} ---`)
  } catch (error) {
    console.error(`--- FAILED: ${name} ---`)
    console.error(error)
    process.exitCode = 1
  }
}

// For scenarios where the *correct* outcome is Dynatrace rejecting the
// request - passes only if it fails with a message containing `expected`.
export async function expectFailure(
  name: string,
  expected: string,
  run: () => Promise<void>
): Promise<void> {
  console.log(`\n=== ${name} ===`)
  // sendEvents() calls core.setFailed() internally before re-throwing, which
  // sets process.exitCode = 1 as a side effect even when we go on to treat
  // the rejection as the expected/correct outcome below - remember the prior
  // value so we can undo that side effect in the expected case.
  const previousExitCode = process.exitCode
  try {
    await run()
    console.error(
      `--- FAILED: ${name} (expected it to be rejected, but it succeeded) ---`
    )
    process.exitCode = 1
  } catch (error) {
    const message = (error as Error).message
    if (message.includes(expected)) {
      console.log(`--- OK: ${name} (rejected as expected) ---`)
      process.exitCode = previousExitCode
    } else {
      console.error(
        `--- FAILED: ${name} (rejected, but not with the expected message) ---`
      )
      console.error(error)
      process.exitCode = 1
    }
  }
}
