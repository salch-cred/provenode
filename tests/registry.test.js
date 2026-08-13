import { describe, it, expect, afterEach, vi } from 'vitest';
import { MODEL_REGISTRY_ADDRESS, SHELBY_RPC } from '../lib/registry.js';

describe('lib/registry.js', () => {
  afterEach(() => {
    delete process.env.MOVE_CONTRACT_ADDRESS;
    delete process.env.SHELBY_NETWORK;
    vi.resetModules();
  });

  it('defaults to the deployed Shelbynet contract', () => {
    expect(MODEL_REGISTRY_ADDRESS).toBe('0x77f8cb3dde7d8347cbaa1043889e79077489af6ed828e273f0283bfeccd39d18');
  });

  it('defaults to the shelbynet RPC (never testnet)', () => {
    expect(SHELBY_RPC).toBe('https://api.shelbynet.shelby.xyz/v1');
  });

  it('honors MOVE_CONTRACT_ADDRESS and testnet opt-out', async () => {
    vi.resetModules();
    process.env.MOVE_CONTRACT_ADDRESS = '0xabc';
    process.env.SHELBY_NETWORK = 'testnet';
    const m = await import('../lib/registry.js');
    expect(m.MODEL_REGISTRY_ADDRESS).toBe('0xabc');
    expect(m.SHELBY_RPC).toBe('https://api.testnet.shelby.xyz/v1');
  });
});
