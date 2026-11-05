/**
 * The events-list deep link from a series occurrence (FR-43):
 * `/events?series=<id>&from=<date>&to=<date>`. The page reads it once at mount.
 * The `from`/`to` window belongs to `useDateWindow`; only the series filter is
 * seeded here so the two paths cannot disagree.
 */
export interface EventsListSeed {
  readonly seriesId: string;
}

export function seedEventsListQuery(searchParams: Pick<URLSearchParams, 'get'>): EventsListSeed {
  return { seriesId: searchParams.get('series')?.trim() ?? '' };
}
