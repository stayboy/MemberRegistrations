import { lazy } from 'react';
import { createHashRouter, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { AppShell } from '../shell/AppShell';
import { SECTIONS, type SectionId } from '../shell/navigation';
import { RequireSession } from '../auth/RequireSession';
import { PlaceholderPage } from '../components/PlaceholderPage';
import { ConnectPage } from '../pages/ConnectPage';
import { NotFoundPage } from '../pages/NotFoundPage';

// Route-level split: the sign-in screen and the tiny placeholder/not-found pages
// stay eager so the first paint never waits on a chunk; the four data pages load
// on demand behind the shell's single Suspense boundary.
const MembersPage = lazy(() =>
  import('../pages/MembersPage').then(({ MembersPage: page }) => ({ default: page })),
);
const MemberDetailPage = lazy(() =>
  import('../pages/MemberDetailPage').then(({ MemberDetailPage: page }) => ({ default: page })),
);
const MemberFormPage = lazy(() =>
  import('../pages/MemberFormPage').then(({ MemberFormPage: page }) => ({ default: page })),
);
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then(({ SettingsPage: page }) => ({ default: page })),
);
const ImportsPage = lazy(() =>
  import('../pages/ImportsPage').then(({ ImportsPage: page }) => ({ default: page })),
);
const ImportBatchesPage = lazy(() =>
  import('../pages/ImportBatchesPage').then(({ ImportBatchesPage: page }) => ({ default: page })),
);
const ShepherdingOfficersPage = lazy(() =>
  import('../pages/ShepherdingOfficersPage').then(({ ShepherdingOfficersPage: page }) => ({
    default: page,
  })),
);
const ShepherdingRosterPage = lazy(() =>
  import('../pages/ShepherdingRosterPage').then(({ ShepherdingRosterPage: page }) => ({
    default: page,
  })),
);
const ShepherdingReportPage = lazy(() =>
  import('../pages/ShepherdingReportPage').then(({ ShepherdingReportPage: page }) => ({
    default: page,
  })),
);
const EventsListPage = lazy(() =>
  import('../pages/EventsListPage').then(({ EventsListPage: page }) => ({ default: page })),
);
const EventDetailPage = lazy(() =>
  import('../pages/EventDetailPage').then(({ EventDetailPage: page }) => ({ default: page })),
);
const SeriesDetailPage = lazy(() =>
  import('../pages/SeriesDetailPage').then(({ SeriesDetailPage: page }) => ({ default: page })),
);
const SeriesFormPage = lazy(() =>
  import('../pages/SeriesFormPage').then(({ SeriesFormPage: page }) => ({ default: page })),
);
const OfferingsPage = lazy(() =>
  import('../pages/offerings/OfferingsPage').then(({ OfferingsPage: page }) => ({
    default: page,
  })),
);
const UssdCodesPage = lazy(() =>
  import('../pages/ussd/UssdCodesPage').then(({ UssdCodesPage: page }) => ({ default: page })),
);
const UssdRegistrationsPage = lazy(() =>
  import('../pages/ussd/UssdRegistrationsPage').then(({ UssdRegistrationsPage: page }) => ({
    default: page,
  })),
);
const UssdClockingPage = lazy(() =>
  import('../pages/ussd/UssdClockingPage').then(({ UssdClockingPage: page }) => ({
    default: page,
  })),
);
const UssdOfferingsPage = lazy(() =>
  import('../pages/ussd/UssdOfferingsPage').then(({ UssdOfferingsPage: page }) => ({
    default: page,
  })),
);
const UssdActivitiesPage = lazy(() =>
  import('../pages/ussd/UssdActivitiesPage').then(({ UssdActivitiesPage: page }) => ({
    default: page,
  })),
);
const UssdProductsPage = lazy(() =>
  import('../pages/ussd/UssdProductsPage').then(({ UssdProductsPage: page }) => ({
    default: page,
  })),
);
const UssdClaimsPage = lazy(() =>
  import('../pages/ussd/UssdClaimsPage').then(({ UssdClaimsPage: page }) => ({ default: page })),
);
const UssdSimulatorPage = lazy(() =>
  import('../pages/ussd/UssdSimulatorPage').then(({ UssdSimulatorPage: page }) => ({
    default: page,
  })),
);

function placeholder(sectionId: SectionId, path: string, title?: string) {
  const section = SECTIONS.find((candidate) => candidate.id === sectionId) ?? SECTIONS[0];
  const item = section.items.find((candidate) => candidate.path === path) ?? section.items[0];

  return (
    <PlaceholderPage
      sectionId={sectionId}
      title={title ?? item.label}
      submenu={item.label}
      description={item.description}
      icon={item.icon}
    />
  );
}

/**
 * Hash routing keeps GitHub Pages deep links working on a hard refresh: no
 * 404.html copy of index.html and no server rewrite are needed (AC-25).
 */
/**
 * The retired series detail lands on the activity detail with its kind, so a bookmark still resolves
 * (AC-51). The API keeps the two reads apart, which is why the kind travels in the route rather than
 * being guessed from the id's shape.
 */
function SeriesRedirect() {
  const { id } = useParams();
  return <Navigate to={`/events/${encodeURIComponent(id ?? '')}?kind=series`} replace />;
}

/** One activity detail serves a standalone event and a series (owner, 2026-11-15). */
function ActivityPage() {
  const [params] = useSearchParams();
  return params.get('kind') === 'series' ? <SeriesDetailPage /> : <EventDetailPage />;
}

/**
 * The retired operator headcount page lands on the activity detail, because a count needs the event
 * it is recorded against (AC-51, owner 2026-11-15). A bare link carries no activity, so it goes to the
 * list.
 */
function HeadcountRedirect() {
  const [params] = useSearchParams();
  const eventId = params.get('event');
  return (
    <Navigate
      to={eventId ? `/events/${encodeURIComponent(eventId)}?kind=event` : '/events'}
      replace
    />
  );
}

/**
 * The retired attendance import page lands on the activity detail, which opens the panel for the date
 * the link named (AC-51, FR-8a). A link with no event goes to the member import, where the operator can
 * start from the activity instead.
 */
function AttendanceImportRedirect() {
  const [params] = useSearchParams();
  const eventId = params.get('event');
  if (!eventId) return <Navigate to="/imports/members" replace />;
  const date = params.get('date');
  const query = date ? `?kind=event&import=${encodeURIComponent(date)}` : '?kind=event';
  return <Navigate to={`/events/${encodeURIComponent(eventId)}${query}`} replace />;
}

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/members" replace /> },
      { path: 'connect', element: <ConnectPage /> },
      {
        element: <RequireSession />,
        children: [
          { path: 'members', element: <MembersPage /> },
          { path: 'members/new', element: <MemberFormPage /> },
          { path: 'members/archived', element: <MembersPage defaultStatus="archived" /> },
          { path: 'members/:memberNo', element: <MemberDetailPage /> },
          { path: 'members/:memberNo/edit', element: <MemberFormPage /> },
          { path: 'events', element: <EventsListPage /> },
          { path: 'events/series', element: <Navigate to="/events" replace /> },
          { path: 'events/series/new', element: <SeriesFormPage /> },
          { path: 'events/series/:id', element: <SeriesRedirect /> },
          { path: 'events/series/:id/edit', element: <SeriesFormPage /> },
          { path: 'events/offerings', element: <OfferingsPage /> },
          { path: 'events/:id', element: <ActivityPage /> },
          { path: 'imports/members', element: <ImportsPage /> },
          { path: 'imports/attendance', element: <AttendanceImportRedirect /> },
          { path: 'imports/batches', element: <ImportBatchesPage /> },
          {
            path: 'shepherding/officers',
            element: <ShepherdingOfficersPage />,
          },
          {
            path: 'shepherding/roster',
            element: <ShepherdingRosterPage />,
          },
          {
            path: 'shepherding/report',
            element: <ShepherdingReportPage />,
          },
          { path: 'ussd', element: <Navigate to="/ussd/codes" replace /> },
          { path: 'ussd/codes', element: <UssdCodesPage /> },
          { path: 'ussd/registrations', element: <UssdRegistrationsPage /> },
          { path: 'ussd/clocking', element: <UssdClockingPage /> },
          { path: 'ussd/headcount', element: <HeadcountRedirect /> },
          { path: 'ussd/offerings', element: <UssdOfferingsPage /> },
          { path: 'ussd/activities', element: <UssdActivitiesPage /> },
          { path: 'ussd/products', element: <UssdProductsPage /> },
          { path: 'ussd/claims', element: <UssdClaimsPage /> },
          { path: 'ussd/simulator', element: <UssdSimulatorPage /> },
          { path: 'admin/ministries', element: placeholder('admin', '/admin/ministries') },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
