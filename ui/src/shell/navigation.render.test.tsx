import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DateTimeProvider } from './DateTimeProvider';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { SECTIONS, sectionForPath, visibleNavItems } from './navigation';
import { ThemeProvider } from '../theme/ThemeProvider';

function ussdSection() {
  const section = SECTIONS.find((candidate) => candidate.id === 'ussd');
  if (!section) throw new Error('The USSD section is missing.');
  return section;
}

describe('USSD section render', () => {
  it('renders one USSD top-level link between Shepherding and Admin', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <TopNav activeSection={ussdSection()} isNarrow={false} />
      </MemoryRouter>,
    );

    expect(markup).toContain('>USSD<');
    expect(markup).toContain('href="/ussd/codes"');
    expect(markup).toContain('aria-current="page"');
    expect(markup.indexOf('Shepherding')).toBeLessThan(markup.indexOf('>USSD<'));
    expect(markup.indexOf('>USSD<')).toBeLessThan(markup.indexOf('Admin'));
  });

  it('renders the USSD submenu in the shared sidebar', () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider>
        <DateTimeProvider>
          <MemoryRouter>
            <Sidebar
              section={ussdSection()}
              collapsed={false}
              showToggle={false}
              onToggle={() => {}}
            />
          </MemoryRouter>
        </DateTimeProvider>
      </ThemeProvider>,
    );

    for (const label of [
      'Codes',
      'Registrations',
      'Clocking',
      'Headcount',
      'Activities',
      'Products',
      'Claims',
      'Simulator',
    ]) {
      expect(markup).toContain(`>${label}<`);
    }
    expect(markup).toContain('href="/ussd/headcount"');
    expect(markup).toContain('href="/ussd/simulator"');
    expect(markup).toContain('aria-label="USSD navigation"');
  });

  it('resolves every USSD route to the USSD section', () => {
    for (const item of ussdSection().items) {
      expect(sectionForPath(item.path).id).toBe('ussd');
      expect(sectionForPath(`${item.path}/detail`).id).toBe('ussd');
    }
  });

  it('drops the development-only Simulator in production but keeps every other item', () => {
    const productionItems = visibleNavItems(ussdSection(), true).map((item) => item.label);

    expect(productionItems).not.toContain('Simulator');
    expect(productionItems).toEqual([
      'Codes',
      'Registrations',
      'Clocking',
      'Headcount',
      'Offerings count',
      'Activities',
      'Products',
      'Claims',
    ]);

    const developmentItems = visibleNavItems(ussdSection(), false).map((item) => item.label);
    expect(developmentItems).toContain('Simulator');
  });
});
