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
          { path: 'events', element: placeholder('events', '/events') },
          { path: 'events/series', element: placeholder('events', '/events/series') },
          { path: 'imports/members', element: <ImportsPage /> },
          { path: 'imports/attendance', element: placeholder('imports', '/imports/attendance') },
          { path: 'imports/batches', element: <ImportBatchesPage /> },
          {
            path: 'shepherding/officers',
            element: placeholder('shepherding', '/shepherding/officers'),
          },
          {
            path: 'shepherding/roster',
            element: placeholder('shepherding', '/shepherding/roster'),
          },
          {
            path: 'shepherding/report',
            element: placeholder('shepherding', '/shepherding/report'),
          },
          { path: 'admin/ministries', element: placeholder('admin', '/admin/ministries') },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
