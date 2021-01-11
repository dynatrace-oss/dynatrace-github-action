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
