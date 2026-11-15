import {
  Badge,
  Button,
  Card,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} from '@fluentui/react-components';
import { EditRegular } from '@fluentui/react-icons';
import type { Headcount, HeadcountCurrent } from '../../api/ussd';
import {
  HEADCOUNT_MODE_OPTIONS,
  headcountBucketSummary,
  headcountModeLabel,
} from '../../format/ussd';
import { useUssdStyles } from './ussd-styles';

/**
 * The loaded, read-first body: one row per recorded lane with its own buckets,
 * count, `asOf`, recorder and Correct action, the register-derived Roster beside
 * it, and the append-only history newest first. No write form lives here; Record
 * and Correct are dialogs the page owns. A superseded row stays readable and is
 * valid for its own `asOf`; a row is current only in its own lane (HC-18), and
 * every lane shows its buckets so the total can be checked against the count
 * (HC-28).
 */
export function HeadcountReadFirst({
  current,
  observations,
  roster,
  rosterPending,
  rosterError,
  pending,
  formatInstant,
  onCorrect,
}: {
  current: HeadcountCurrent;
  observations: readonly Headcount[];
  roster: number | undefined;
  rosterPending: boolean;
  rosterError: boolean;
  pending: boolean;
  formatInstant: (value: string) => string;
  onCorrect: (observation: Headcount) => void;
}) {
  const styles = useUssdStyles();
  // One row per recorded live lane, in the menu's lane order. A lane without a
  // current observation is not a row; a retired mixed lane stays in history.
  const lanes = HEADCOUNT_MODE_OPTIONS.flatMap(({ value }) => {
    const row = current[value] ?? null;
    return row ? [row] : [];
  });

  return (
    <>
      <div className={styles.fields}>
        <Card className={styles.panel} style={{ flex: 2, minWidth: '320px' }}>
          <div className={styles.panelBody}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Current headcount</h2>
              <Text size={200} className={styles.muted}>
                One row per lane · each with its own asOf
              </Text>
            </div>
            {lanes.length === 0 ? (
              <Text size={200} className={styles.muted}>
                No headcount recorded for this session yet.
              </Text>
            ) : (
              <div className={styles.tableWrap}>
                <Table
                  className={styles.table}
                  size="small"
                  aria-label="Current headcounts"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Mode</TableHeaderCell>
                      <TableHeaderCell>Buckets</TableHeaderCell>
                      <TableHeaderCell>Count</TableHeaderCell>
                      <TableHeaderCell>As of</TableHeaderCell>
                      <TableHeaderCell>Recorded</TableHeaderCell>
                      <TableHeaderCell>Action</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lanes.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{headcountModeLabel(row.mode)}</TableCell>
                        <TableCell>
                          {row.lines.length === 0 ? (
                            <Text size={200} className={styles.muted}>
                              —
                            </Text>
                          ) : (
                            headcountBucketSummary(row)
                          )}
                        </TableCell>
                        <TableCell>
                          <Text className={styles.code}>{row.total}</Text>
                        </TableCell>
                        <TableCell>{formatInstant(row.asOf)}</TableCell>
                        <TableCell>
                          <Text size={200} className={styles.muted}>
                            {row.recordedBy} · {formatInstant(row.recordedAt)}
                          </Text>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            icon={<EditRegular />}
                            onClick={() => onCorrect(row)}
                            disabled={pending}
                          >
                            Correct
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Card>

        <Card className={styles.panel} style={{ flex: 1, minWidth: '260px' }}>
          <div className={styles.panelBody}>
            <Text size={200} className={styles.muted}>
              Roster
            </Text>
            {rosterPending ? (
              <Spinner size="tiny" label="Loading the roster…" />
            ) : rosterError ? (
              <Text size={200} className={styles.muted}>
                The register-derived roster could not be read.
              </Text>
            ) : (
              <>
                <Text className={styles.code}>{roster ?? 0}</Text>
                <Text size={200} className={styles.muted}>
                  Register-derived attendance. Never merged with the headcount.
                </Text>
              </>
            )}
          </div>
        </Card>
      </div>

      <section className={styles.panel} aria-label="Headcount observations">
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Observation history</h2>
          <Text size={200} className={styles.muted}>
            Newest first · superseded rows stay readable
          </Text>
        </div>
        {observations.length === 0 ? (
          <div className={styles.empty}>
            <Text size={200} className={styles.muted}>
              No observation for this session yet.
            </Text>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <Table className={styles.table} size="small" aria-label="Headcount observations">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>As of</TableHeaderCell>
                  <TableHeaderCell>Mode</TableHeaderCell>
                  <TableHeaderCell>Buckets</TableHeaderCell>
                  <TableHeaderCell>Total</TableHeaderCell>
                  <TableHeaderCell>Recorded</TableHeaderCell>
                  <TableHeaderCell>State</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {observations.map((row) => {
                  // Each lane has its own current observation, so identity is
                  // resolved against that lane's tip — never against another
                  // lane's. A retired mixed observation is read-only history.
                  const isCurrent = (current[row.mode] ?? null)?.id === row.id;
                  const canCorrect = isCurrent && row.mode !== 'mixed';
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{formatInstant(row.asOf)}</TableCell>
                      <TableCell>{headcountModeLabel(row.mode)}</TableCell>
                      <TableCell>{headcountBucketSummary(row)}</TableCell>
                      <TableCell>{row.total}</TableCell>
                      <TableCell>
                        <Text size={200} className={styles.muted}>
                          {row.recordedBy} · {formatInstant(row.recordedAt)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {isCurrent ? (
                          <Badge appearance="tint" color="success" size="small">
                            Current
                          </Badge>
                        ) : row.supersededBy !== null ? (
                          <Badge appearance="tint" color="subtle" size="small">
                            Superseded
                          </Badge>
                        ) : (
                          <Badge appearance="tint" color="subtle" size="small">
                            Earlier
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {canCorrect ? (
                          <Button
                            size="small"
                            icon={<EditRegular />}
                            disabled={pending}
                            onClick={() => onCorrect(row)}
                          >
                            Correct
                          </Button>
                        ) : (
                          <Text size={200} className={styles.muted}>
                            Valid for {formatInstant(row.asOf)}
                          </Text>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
