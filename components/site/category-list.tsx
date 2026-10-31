import { GENRE_MARKERS, MARKERS } from './category-markers';
import { TickList } from './tick-list';

/**
 * The kinds of event (or of tour) as chips in the filter panel.
 */
export function CategoryList(props: {
  action: string;
  values: Record<string, string | undefined>;
  counts: Map<string, number>;
  of?: 'events' | 'tours';
}) {
  const tours = props.of === 'tours';
  const options = (tours ? Object.entries(GENRE_MARKERS) : MARKERS).map(([t, Icon]) => [t, t, Icon] as const);
  return <TickList title={tours ? 'Kinds of tour' : 'Kinds of event'} action={props.action} values={props.values} param={tours ? 'genre' : 'type'} options={options} counts={props.counts} />;
}
