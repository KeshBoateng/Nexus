import { describe, expect, it } from 'vitest';
import { isNetworkError } from './offline';

describe('isNetworkError', () => {
  it('recognises network failures but not permission or validation errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ message: 'TypeError: NetworkError when attempting to fetch resource.' })).toBe(true);
    expect(isNetworkError(new Error('permission denied for table courses'))).toBe(false);
    expect(isNetworkError(new Error('Invalid input'))).toBe(false);
  });
});
