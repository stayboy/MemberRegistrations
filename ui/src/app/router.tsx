import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from '../shell/AppShell';
import { SECTIONS, type SectionId } from '../shell/navigation';
import { RequireSession } from '../auth/RequireSession';
import { PlaceholderPage } from '../components/PlaceholderPage';
import { ConnectPage } from '../pages/ConnectPage';
import { MemberDetailPage } from '../pages/MemberDetailPage';
import { MemberFormPage } from '../pages/MemberFormPage';
import { MembersPage } from '../pages/MembersPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { SettingsPage } from '../pages/SettingsPage';

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
          { path: 'imports/events', element: placeholder('imports', '/imports/events') },
          { path: 'imports/attendance', element: placeholder('imports', '/imports/attendance') },
          { path: 'imports/batches', element: placeholder('imports', '/imports/batches') },
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
