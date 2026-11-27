import { BadRequestException } from '@nestjs/common';

export function parseRiyadhDateTime(input: string) {
  const wallTime = /^\d{4}-\d{2}-\d{2}$/.test(input) ? input + 'T00:00' : input;
  const explicit = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(wallTime);
  const deadline = new Date(explicit ? wallTime : wallTime + '+03:00');
  if (!Number.isFinite(deadline.getTime())) throw new BadRequestException('Invalid date and time.');
  return deadline;
}
