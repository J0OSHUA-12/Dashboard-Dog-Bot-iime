// Series temporales fuera de React (búferes circulares). Las gráficas las leen
// periódicamente. Las series simuladas y reales viven en espacios separados.
import { Sample } from '../../shared/telemetry';

export type SeriesSpace = 'sim' | 'real';
const MAX = 900;
const data = new Map<string, Sample[]>();
let version = 0;

function key(space: SeriesSpace, id: string) {
  return `${space}:${id}`;
}

export function pushSample(space: SeriesSpace, id: string, t: number, v: number | null) {
  const k = key(space, id);
  let arr = data.get(k);
  if (!arr) {
    arr = [];
    data.set(k, arr);
  }
  arr.push({ t, v });
  if (arr.length > MAX) arr.splice(0, arr.length - MAX);
  version++;
}

export function getSeries(space: SeriesSpace, id: string): Sample[] {
  return data.get(key(space, id)) ?? [];
}

export function seriesVersion() {
  return version;
}

export function clearSpace(space: SeriesSpace) {
  for (const k of [...data.keys()]) if (k.startsWith(space + ':')) data.delete(k);
  version++;
}

export function allSeries(space: SeriesSpace): [string, Sample[]][] {
  return [...data.entries()].filter(([k]) => k.startsWith(space + ':')).map(([k, v]) => [k.slice(space.length + 1), v]);
}
