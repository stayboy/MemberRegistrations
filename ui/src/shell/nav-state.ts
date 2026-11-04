export const NAV_STORAGE_KEY = 'mr.nav.v1';

export type SidebarState = 'expanded' | 'collapsed';

export function parseSidebarState(value: string | null): SidebarState {
  return value === 'collapsed' ? 'collapsed' : 'expanded';
}

export function readSidebarState(): SidebarState {
  try {
    return parseSidebarState(window.localStorage.getItem(NAV_STORAGE_KEY));
  } catch {
    return 'expanded';
  }
}

export function persistSidebarState(state: SidebarState): void {
  try {
    window.localStorage.setItem(NAV_STORAGE_KEY, state);
  } catch {
    // The current tab still collapses; only the remembered state is lost.
  }
}
