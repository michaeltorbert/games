import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeFailureCode, sanitizeResourceUrl } from './football-resource-diagnostics.mjs';

const origin = 'http://127.0.0.1:8090';

test('resource URLs retain HTTP origin and path without userinfo, query, or fragment', () => {
  assert.equal(sanitizeResourceUrl(`${origin}/football/?token=secret#private`), `${origin}/football/`);
  assert.equal(sanitizeResourceUrl(`http://user:pass@127.0.0.1:8090/shared/a.js?secret=x`), 'http://127.0.0.1:8090/shared/a.js');
  assert.equal(sanitizeResourceUrl('https://external.test/assets/a.js?secret=x'), 'https://external.test/assets/a.js');
});

test('unsafe and non-HTTP locations never preserve their payload', () => {
  for (const value of [
    'data:text/plain,private-canary',
    'javascript:private-canary',
    'blob:https://example.test/private-canary',
    'file:///private/private-canary',
    'not a URL private-canary',
  ]) {
    assert.doesNotMatch(sanitizeResourceUrl(value), /private-canary/);
  }
  assert.equal(sanitizeResourceUrl('data:text/plain,private-canary'), '[non-http-url]');
});

test('failure codes are reduced to known canonical representations', () => {
  assert.equal(sanitizeFailureCode('net::ERR_FAILED'), 'net::ERR_FAILED');
  assert.equal(sanitizeFailureCode('NSURLErrorDomain Code=-1001'), 'NSURLErrorDomain Code=-1001');
  assert.equal(sanitizeFailureCode('Blocked by Web Inspector'), 'Blocked by Web Inspector');
  assert.equal(sanitizeFailureCode('Load failed'), 'load failed');
  assert.equal(sanitizeFailureCode('Blocked by Web Inspector at https://private.test/?secret=x'), '[unavailable]');
  assert.equal(sanitizeFailureCode('failed https://private.test/?token=secret'), '[unavailable]');
  assert.equal(sanitizeFailureCode(undefined), '[unavailable]');
});
