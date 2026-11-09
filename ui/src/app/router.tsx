import { lazy } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
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
const ImportsAttendancePage = lazy(() =>
  import('../pages/ImportsAttendancePage').then(({ ImportsAttendancePage: page }) => ({
    default: page,
  })),
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
const SeriesListPage = lazy(() =>
  import('../pages/SeriesListPage').then(({ SeriesListPage: page }) => ({ default: page })),
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
const UssdHeadcountPage = lazy(() =>
  import('../pages/ussd/UssdHeadcountPage').then(({ UssdHeadcountPage: page }) => ({
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
          { path: 'events/series', element: <SeriesListPage /> },
          { path: 'events/series/new', element: <SeriesFormPage /> },
          { path: 'events/series/:id', element: <SeriesDetailPage /> },
          { path: 'events/series/:id/edit', element: <SeriesFormPage /> },
          { path: 'events/offerings', element: <OfferingsPage /> },
          { path: 'events/:id', element: <EventDetailPage /> },
          { path: 'imports/members', element: <ImportsPage /> },
          { path: 'imports/attendance', element: <ImportsAttendancePage /> },
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
          { path: 'ussd/headcount', element: <UssdHeadcountPage /> },
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
