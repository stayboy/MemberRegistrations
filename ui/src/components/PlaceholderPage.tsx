import { Badge, makeStyles, shorthands, tokens } from '@fluentui/react-components';
import { DocumentRegular, type FluentIcon } from '@fluentui/react-icons';
import { PageFrame } from './PageFrame';
import type { SectionId } from '../shell/navigation';

const useStyles = makeStyles({
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: tokens.spacingVerticalS,
    minHeight: '320px',
    padding: tokens.spacingHorizontalXXL,
    ...shorthands.border('1px', 'dashed', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  icon: {
    fontSize: '40px',
    color: tokens.colorNeutralForeground3,
  },
  title: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  body: {
    margin: 0,
    maxWidth: '56ch',
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
  },
});

export function PlaceholderPage({
  sectionId,
  title,
  submenu,
  description,
  icon: Icon = DocumentRegular,
}: {
  sectionId: SectionId;
  title: string;
  submenu?: string;
  description?: string;
  icon?: FluentIcon;
}) {
  const styles = useStyles();

  return (
    <PageFrame sectionId={sectionId} title={title} submenu={submenu} description={description}>
      <section className={styles.placeholder} aria-label={`${title} placeholder`}>
        <Icon className={styles.icon} aria-hidden="true" />
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>
          The shell, session gate, appearance controls and navigation are live. This surface&apos;s
          content is scaffolded by the shell ticket and arrives with its own implementation ticket.
        </p>
        <Badge appearance="tint" color="informative">
          Placeholder
        </Badge>
      </section>
    </PageFrame>
  );
}
