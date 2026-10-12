import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterNavGroups, PANEL_NAV_GROUPS } from './AppShell.tsx';
import { NavDrawer } from './NavDrawer.tsx';
import {
  InstitutionBrand,
  resetInstitutionCacheForTesting,
} from './InstitutionBrand.tsx';
import { LoginForm } from '../features/auth/LoginForm.tsx';
import { AuthProvider } from '../features/auth/AuthContext.tsx';
import { error, json, mockApi } from '../test/mockApi.ts';
import type { PublicInstitution } from '../features/public/types.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  resetInstitutionCacheForTesting();
});

describe('filterNavGroups', () => {
  it('filtra grupos vacíos cuando el usuario no tiene permisos para sus secciones', () => {
    // Sin permisos: solo grupos con items sin permiso requerido (Inicio y Cuenta)
    const sinPermisos = filterNavGroups(PANEL_NAV_GROUPS, []);
    const titulosSinPermisos = sinPermisos.map((g) => g.title).filter(Boolean);
    expect(titulosSinPermisos).toEqual(['Cuenta']);
    expect(sinPermisos.flatMap((g) => g.items.map((i) => i.label))).toEqual([
      'Inicio',
      'Notificaciones',
      'Mi cuenta',
    ]);

    // Con permiso de deportes: aparece 'Competencias' solo con 'Deportes'
    const conDeportes = filterNavGroups(PANEL_NAV_GROUPS, ['sports:read']);
    expect(conDeportes.map((g) => g.title).filter(Boolean)).toEqual([
      'Competencias',
      'Cuenta',
    ]);
    const itemsCompetencias = conDeportes.find(
      (g) => g.title === 'Competencias',
    )?.items;
    expect(itemsCompetencias?.map((i) => i.label)).toEqual(['Deportes']);
  });
});

describe('NavDrawer', () => {
  it('no muestra nada cuando isOpen es false', () => {
    render(
      <NavDrawer isOpen={false} onClose={vi.fn()}>
        <a href="#/uno">Enlace 1</a>
      </NavDrawer>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abre cuando isOpen es true, atrapa Tab y cierra con Escape devolviendo el foco', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Abrir menú';
    document.body.appendChild(trigger);
    trigger.focus();
    const triggerRef = { current: trigger };

    const onClose = vi.fn();
    const { unmount } = render(
      <NavDrawer
        isOpen={true}
        onClose={onClose}
        triggerRef={triggerRef}
        title="Menú de navegación"
      >
        <a href="#/seccion-1" id="link-1">
          Sección 1
        </a>
        <a href="#/seccion-2" id="link-2">
          Sección 2
        </a>
      </NavDrawer>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Menú de navegación' });
    expect(dialog).toBeVisible();

    // Escape llama a onClose
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Ciclo de Tab (foco atrapado)
    const closeBtn = screen.getByRole('button', { name: 'Cerrar menú' });
    screen.getByRole('link', { name: 'Sección 1' });
    const link2 = screen.getByRole('link', { name: 'Sección 2' });

    // Cuando el foco está en el último elemento (link2) y se presiona Tab, salta al primero (closeBtn)
    link2.focus();
    expect(document.activeElement).toBe(link2);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    // Cuando el foco está en el primer elemento (closeBtn) y se presiona Shift+Tab, salta al último (link2)
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(link2);

    unmount();
    document.body.removeChild(trigger);
  });
});

describe('InstitutionBrand', () => {
  const baseInstitution: PublicInstitution = {
    name: 'Liga Cantonal de Quero',
    shortName: 'Liga de Quero',
    affiliation: 'Federación Deportiva de Tungurahua',
    canton: 'Quero',
    address: 'Calle Central',
    email: 'contacto@liga.example',
    phone: '0999999999',
    website: null,
    about: null,
    contactInfo: null,
    privacyPolicy: null,
    presidentName: null,
    secretaryName: null,
    hasLogo: true,
    hasCover: false,
    publication: {
      clubs: true,
      athletes: true,
      news: true,
      resolutions: true,
    },
  };

  it('con hasLogo: true muestra la imagen y el nombre sin rol de encabezado', async () => {
    mockApi({
      'GET /public/institution': () => json(baseInstitution),
    });

    render(<InstitutionBrand showSubtitle />);

    const img = await screen.findByRole('img', {
      name: 'Logotipo de Liga Cantonal de Quero',
    });
    expect(img).toHaveAttribute('src', '/api/public/institution/logo');
    expect(screen.getByText('Liga Cantonal de Quero')).toBeInTheDocument();
    expect(
      screen.getByText('Federación Deportiva de Tungurahua'),
    ).toBeInTheDocument();

    // No debe tener rol de encabezado
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('con hasLogo: false muestra el escudo incluido y el nombre sin encabezado', async () => {
    mockApi({
      'GET /public/institution': () =>
        json({
          ...baseInstitution,
          hasLogo: false,
          hasCover: false,
          affiliation: null,
        }),
    });

    render(<InstitutionBrand />);

    expect(
      await screen.findByText('Liga Cantonal de Quero'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Logotipo de Liga Cantonal de Quero' }),
    ).not.toHaveAttribute('src', '/api/public/institution/logo');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('LoginForm', () => {
  const dummyInstitution: PublicInstitution = {
    name: 'Liga Cantonal de Quero',
    shortName: 'Liga de Quero',
    affiliation: null,
    canton: 'Quero',
    address: null,
    email: null,
    phone: null,
    website: null,
    about: null,
    contactInfo: null,
    privacyPolicy: null,
    presidentName: null,
    secretaryName: null,
    hasLogo: false,
    hasCover: false,
    publication: { clubs: true, athletes: true, news: true, resolutions: true },
  };

  it('muestra el lema de identidad sin pedir resultados a la API', async () => {
    const api = mockApi({
      'GET /auth/session': () => error(401, 'No autenticado'),
      'GET /public/institution': () => json(dummyInstitution),
    });

    render(
      <AuthProvider>
        <LoginForm sessionExpired={false} />
      </AuthProvider>,
    );

    expect(
      await screen.findByText(
        'Gestión deportiva cantonal, resultados transparentes y actas oficiales.',
      ),
    ).toBeVisible();
    expect(api.calls.some((c) => c.path === '/public/home')).toBe(false);
    expect(
      screen.queryByLabelText('Último resultado oficial'),
    ).not.toBeInTheDocument();
  });
});
