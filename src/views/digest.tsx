import type { DigestNight, DigestRow } from '../digest/types.js';

// A row is marked when it retried three times or more, or when its last run failed. Marking is
// the whole row, so a reader skimming the page cannot miss it (plan 2a).
function marked(row: DigestRow): boolean {
  return row.retries >= 3 || row.lastStatus === 'fail';
}

// Missing data renders as `—`, never as an empty cell (docs/styleguide.md).
function show(value: string | null): string {
  return value === null ? '—' : value;
}

export function DigestBoard({ night }: { night: DigestNight }) {
  return (
    <>
      <h1>digest · {night.night}</h1>
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => (
              <tr class={marked(row) ? 'warn' : undefined}>
                <td>{row.job}</td>
                <td>{show(row.owner)}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{show(row.lastError)}</td>
                <td>{row.first}</td>
                <td>{row.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {night.badLines > 0 ? (
        <p class="mute">
          {night.badLines} line{night.badLines === 1 ? '' : 's'} did not parse
        </p>
      ) : null}
    </>
  );
}
