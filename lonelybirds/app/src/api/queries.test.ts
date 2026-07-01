import { describe, expect, it } from 'vitest';
import { canAcceptConnection, orderPetPair, partnerPetId } from './queries';

describe('orderPetPair', () => {
  it('puts the lexically smaller id in pet_a_id', () => {
    expect(orderPetPair('aaa', 'bbb')).toEqual({ pet_a_id: 'aaa', pet_b_id: 'bbb' });
    expect(orderPetPair('bbb', 'aaa')).toEqual({ pet_a_id: 'aaa', pet_b_id: 'bbb' });
  });

  it('rejects identical ids', () => {
    expect(() => orderPetPair('aaa', 'aaa')).toThrow();
  });
});

describe('partnerPetId', () => {
  const connection = { pet_a_id: 'aaa', pet_b_id: 'bbb' };

  it('returns the other pet from either side', () => {
    expect(partnerPetId(connection, 'aaa')).toBe('bbb');
    expect(partnerPetId(connection, 'bbb')).toBe('aaa');
  });

  it('throws for a pet outside the connection', () => {
    expect(() => partnerPetId(connection, 'ccc')).toThrow();
  });
});

describe('canAcceptConnection', () => {
  const base = {
    pet_a_id: 'aaa',
    pet_b_id: 'bbb',
    requested_by_pet_id: 'aaa',
    status: 'pending' as const,
  };

  it('is true for the non-requesting side of a pending connection', () => {
    expect(canAcceptConnection(base, 'bbb')).toBe(true);
  });

  it('is false for the requester (no self-accept)', () => {
    expect(canAcceptConnection(base, 'aaa')).toBe(false);
  });

  it('is false once the connection is no longer pending', () => {
    expect(canAcceptConnection({ ...base, status: 'active' }, 'bbb')).toBe(false);
    expect(canAcceptConnection({ ...base, status: 'paused' }, 'bbb')).toBe(false);
    expect(canAcceptConnection({ ...base, status: 'blocked' }, 'bbb')).toBe(false);
  });

  it('is false for a pet outside the connection', () => {
    expect(canAcceptConnection(base, 'ccc')).toBe(false);
  });
});
