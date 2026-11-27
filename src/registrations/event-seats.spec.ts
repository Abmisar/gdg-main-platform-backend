import { expect, it } from 'vitest';
import { seatOffer, type LockedEvent } from './event-seats.js';

it('withholds offers after a queued event is unpublished', () => {
  const event = { startsAt: new Date('2030-01-02Z'), confirmationWindowHours: 2, published: true } as LockedEvent;
  const now = new Date('2030-01-01Z');
  expect(seatOffer(event, now)).toBeTruthy();
  expect(seatOffer({ ...event, published: false }, now)).toBeNull();
});
