import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from './index.ts';

describe('@bridge/mesh', () => {
  it('exports its package name', () => {
    expect(PACKAGE_NAME).toBe('@bridge/mesh');
  });
});
