/*
Copyright 2020 Dynatrace LLC

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
*/
import {wait} from '../src/wait';
import * as process from 'process';
import * as cp from 'child_process';
import * as path from 'path';
import * as dt from '../src/dynatrace';

test('throws invalid number', async () => {
  const input = parseInt('foo', 10);
  await expect(wait(input)).rejects.toThrow('milliseconds not a number');
})

test('wait 500 ms', async () => {
  const start = new Date();
  await wait(500);
  const end = new Date();
  var delta = Math.abs(end.getTime() - start.getTime());
  expect(delta).toBeGreaterThan(450);
})

test('valid metrik key with point', async () => {
  expect(dt.safeMetricKey("metric.key")).toEqual("metric.key");
})

test('invalid metrik key chars conversion', async () => {
  expect(dt.safeMetricKey("metric.k&y")).toEqual("metric.k_y");
})
