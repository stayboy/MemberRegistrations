import { describe, expect, it } from 'vitest';
import { seedEventsListQuery } from './events-list';

function params(values: Record<string, string>): URLSearchParams {
  return new URLSearchParams(values);
}

describe('seedEventsListQuery', () => {
  it('seeds the series filter from a series occurrence link', () => {
    const seed = seedEventsListQuery(
      params({ series: 'series-1', from: '2027-06-15', to: '2027-06-15' }),
    );

    expect(seed).toEqual({ seriesId: 'series-1' });
  });

  it('returns an empty series id when the link has no series filter', () => {
    expect(seedEventsListQuery(params({}))).toEqual({ seriesId: '' });
    expect(seedEventsListQuery(params({ from: '2027-06-15', to: '2027-06-15' }))).toEqual({
      seriesId: '',
    });
  });

  it('trims the series id', () => {
    expect(seedEventsListQuery(params({ series: '  series-1  ' })).seriesId).toBe('series-1');
  });
});
