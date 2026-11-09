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
import type { Headcount } from '../../api/ussd';
import { headcountBucketSummary, headcountModeLabel } from '../../format/ussd';
import { useUssdStyles } from './ussd-styles';

/**
 * The loaded, read-first body: the current observation with its Correct action,
 * the register-derived Roster beside it, and the append-only history newest
 * first. No write form lives here; Record and Correct are dialogs the page owns.
 * A superseded row stays readable and is valid for its own `asOf`.
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
  current: Headcount | null;
  observations: readonly Headcount[];
  roster: number | undefined;
  rosterPending: boolean;
  rosterError: boolean;
  pending: boolean;
  formatInstant: (value: string) => string;
  onCorrect: (observation: Headcount) => void;
}) {
  const styles = useUssdStyles();

  return (
    <>
      <div className={styles.fields}>
        <Card className={styles.panel} style={{ flex: 1, minWidth: '260px' }}>
          <div className={styles.panelBody}>
            <Text size={200} className={styles.muted}>
              Current headcount
            </Text>
            {current ? (
              <>
                <Text className={styles.code}>{current.total}</Text>
                <div className={styles.badgeRow}>
                  <Badge appearance="tint" color="brand" size="small">
                    {headcountModeLabel(current.mode)}
                  </Badge>
                  <Text size={200}>as of {formatInstant(current.asOf)}</Text>
                </div>
                <Text size={200} className={styles.muted}>
                  {headcountBucketSummary(current)} · recorded {formatInstant(current.recordedAt)}
                </Text>
                <div>
                  <Button
                    size="small"
                    icon={<EditRegular />}
                    onClick={() => onCorrect(current)}
                    disabled={pending}
                  >
                    Correct
                  </Button>
                </div>
              </>
            ) : (
              <Text size={200} className={styles.muted}>
                No headcount recorded for this session yet.
              </Text>
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
                  // The API's `current` is the newest non-superseded observation. A
                  // second uncorrected record leaves an older non-superseded row, so
                  // identity with `current` — not `supersededBy` alone — decides which
                  // row offers Correct and which is only valid for its own asOf.
                  const isCurrent = row.id === current?.id;
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
                        {isCurrent ? (
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
