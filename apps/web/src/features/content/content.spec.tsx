import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { error, json, mockApi, noContent, page } from '../../test/mockApi.ts';
import { AnnouncementsPage } from './AnnouncementsPage.tsx';
import type { Announcement } from './types.ts';

const ID = '0197aaaa-0000-7000-8000-0000000000a1';

const DRAFT: Announcement = {
  id: ID,
  kind: 'noticia',
  title: 'Arranca el campeonato',
  slug: 'arranca-el-campeonato',
  summary: 'La Liga inaugura la temporada.',
  status: 'borrador',
  publishDate: '2026-06-20',
  publishedAt: null,
  scheduled: false,
  updatedAt: '2026-06-20T12:00:00.000Z',
  author: 'Editor Demo',
  cover: null,
};

const FULL = [
  'announcements:read',
  'announcements:manage',
  'announcements:publish',
  'announcements:delete',
];

afterEach(() => vi.unstubAllGlobals());

describe('noticias y comunicados (administración)', () => {
  it('un redactor sin permiso de publicar no ve publicar, retirar, archivar ni eliminar', async () => {
    mockApi({
      'GET /announcements': () => page([DRAFT]),
      'GET /media': () => page([]),
    });
    render(
      <AnnouncementsPage
        permissions={['announcements:read', 'announcements:manage']}
      />,
    );
    expect(await screen.findByText('Arranca el campeonato')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeVisible();
    for (const name of ['Publicar', 'Archivar', 'Eliminar']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('un lector solo consulta', async () => {
    mockApi({ 'GET /announcements': () => page([DRAFT]) });
    render(<AnnouncementsPage permissions={['announcements:read']} />);
    await screen.findByText('Arranca el campeonato');
    expect(
      screen.queryByRole('button', { name: 'Nueva publicación' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();
  });

  it('crea un borrador validando los campos', async () => {
    const api = mockApi({
      'GET /announcements': () => page([]),
      'GET /media': () => page([]),
      'POST /announcements': () => json(DRAFT, 201),
    });
    render(<AnnouncementsPage permissions={FULL} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva publicación' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      screen.getByText('El título necesita al menos 5 caracteres.'),
    ).toBeVisible();
    expect(
      screen.getByText('El resumen necesita al menos 10 caracteres.'),
    ).toBeVisible();
    expect(
      screen.getByText('El contenido necesita al menos 20 caracteres.'),
    ).toBeVisible();
    expect(api.of('POST', '/announcements')).toHaveLength(0);

    await userEvent.type(
      screen.getByLabelText(/Título/),
      'Arranca el campeonato',
    );
    await userEvent.type(
      screen.getByLabelText(/Resumen/),
      'La Liga inaugura la temporada.',
    );
    await userEvent.type(
      screen.getByLabelText(/Contenido/),
      'Primer párrafo de la noticia.\n\nSegundo párrafo.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('Se creó el borrador «Arranca el campeonato».'),
    ).toBeVisible();
    expect(api.of('POST', '/announcements')[0]!.body).toMatchObject({
      kind: 'noticia',
      title: 'Arranca el campeonato',
      coverId: null,
    });
  });

  it('publica, retira y archiva desde la lista', async () => {
    let current: Announcement = { ...DRAFT };
    const api = mockApi({
      'GET /announcements': () => page([current]),
      [`POST /announcements/${ID}/publish`]: () => {
        current = {
          ...current,
          status: 'publicado',
          publishedAt: '2026-06-21T12:00:00.000Z',
        };
        return json(current);
      },
      [`POST /announcements/${ID}/unpublish`]: () => {
        current = { ...current, status: 'borrador', publishedAt: null };
        return json(current);
      },
      [`POST /announcements/${ID}/archive`]: () => {
        current = { ...current, status: 'archivado' };
        return json(current);
      },
    });
    render(<AnnouncementsPage permissions={FULL} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Publicar' }),
    );
    expect(
      await screen.findByText('Se publicó «Arranca el campeonato».'),
    ).toBeVisible();
    expect(
      await screen.findByRole('link', { name: 'Ver en el portal' }),
    ).toHaveAttribute('href', '#/portal/noticias/arranca-el-campeonato');
    await userEvent.click(screen.getByRole('button', { name: 'Archivar' }));
    expect(
      await screen.findByText('Se archivó «Arranca el campeonato».'),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Restaurar' }),
    ).toBeVisible();
    expect(api.of('POST', `/announcements/${ID}/publish`)).toHaveLength(1);
    expect(api.of('POST', `/announcements/${ID}/archive`)).toHaveLength(1);
  });

  it('solo ofrece eliminar borradores y confirma antes de hacerlo', async () => {
    const api = mockApi({
      'GET /announcements': () =>
        page([
          DRAFT,
          {
            ...DRAFT,
            id: 'b',
            title: 'Otra publicada',
            status: 'publicado' as const,
            publishedAt: '2026-06-21T12:00:00.000Z',
          },
        ]),
      [`DELETE /announcements/${ID}`]: () => noContent(),
    });
    render(<AnnouncementsPage permissions={FULL} />);
    const buttons = await screen.findAllByRole('button', { name: 'Eliminar' });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Eliminar borrador' }),
    );
    expect(await screen.findByText('Se eliminó el borrador.')).toBeVisible();
    expect(api.of('DELETE', `/announcements/${ID}`)).toHaveLength(1);
  });

  it('sube una imagen con su texto alternativo y muestra el error del servidor', async () => {
    const api = mockApi({
      'GET /announcements': () => page([]),
      'GET /media': () => page([]),
      'POST /media': () => error(400, 'El archivo no es una imagen PNG válida'),
    });
    render(<AnnouncementsPage permissions={FULL} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Imágenes' }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Subir imagen' }),
    );
    expect(
      await screen.findByText(/Elija una imagen y describa su contenido/),
    ).toBeVisible();
    expect(api.of('POST', '/media')).toHaveLength(0);

    await userEvent.type(
      screen.getByLabelText(/Descripción de la imagen/),
      'Equipo campeón',
    );
    await userEvent.upload(
      screen.getByLabelText(/Archivo \(JPG, PNG o WEBP/),
      new File(['x'], 'foto.png', { type: 'image/png' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Subir imagen' }));
    expect(
      await screen.findByText('El archivo no es una imagen PNG válida'),
    ).toBeVisible();
    expect(api.of('POST', '/media')).toHaveLength(1);
  });

  it('sube una imagen desde el formulario y la deja como portada', async () => {
    const MEDIA_ID = '0197aaaa-0000-7000-8000-0000000000b1';
    let uploaded = false;
    const api = mockApi({
      'GET /announcements': () => page([]),
      'GET /media': () =>
        page(
          uploaded
            ? [
                {
                  id: MEDIA_ID,
                  altText: 'Equipo campeón',
                  visibility: 'publico',
                  createdAt: '2026-06-20T12:00:00.000Z',
                  sizeBytes: 1,
                  mimeType: 'image/png',
                  usedIn: 0,
                },
              ]
            : [],
        ),
      'POST /media': () => {
        uploaded = true;
        return json({ id: MEDIA_ID }, 201);
      },
      'POST /announcements': () => json(DRAFT, 201),
    });
    render(<AnnouncementsPage permissions={FULL} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva publicación' }),
    );
    expect(
      screen.queryByLabelText(/Descripción de la imagen/),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByLabelText('Imagen de portada'),
      'Subir imagen…',
    );
    const subir = screen.getByRole('button', {
      name: 'Subir y usar como portada',
    });
    await userEvent.click(subir);
    expect(
      screen.getByText(/Elija una imagen y describa su contenido/),
    ).toBeVisible();
    expect(api.of('POST', '/media')).toHaveLength(0);

    await userEvent.type(
      screen.getByLabelText(/Descripción de la imagen/),
      'Equipo campeón',
    );
    await userEvent.upload(
      screen.getByLabelText(/Archivo \(JPG, PNG o WEBP/),
      new File(['x'], 'foto.png', { type: 'image/png' }),
    );
    await userEvent.click(subir);
    expect(
      await screen.findByAltText('Vista previa de la portada'),
    ).toHaveAttribute('src', `/api/public/media/${MEDIA_ID}`);
    expect(screen.getByLabelText('Imagen de portada')).toHaveValue(MEDIA_ID);
    expect(
      screen.queryByLabelText(/Descripción de la imagen/),
    ).not.toBeInTheDocument();
    expect(api.of('POST', '/media')[0]!.body).toMatchObject({
      altText: 'Equipo campeón',
    });

    await userEvent.type(
      screen.getByLabelText(/Título/),
      'Arranca el campeonato',
    );
    await userEvent.type(
      screen.getByLabelText(/Resumen/),
      'La Liga inaugura la temporada.',
    );
    await userEvent.type(
      screen.getByLabelText(/Contenido/),
      'Primer párrafo de la noticia.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Se creó el borrador «Arranca el campeonato».');
    expect(api.of('POST', '/announcements')[0]!.body).toMatchObject({
      coverId: MEDIA_ID,
    });
  });

  it('una fecha futura avisa el día de publicación y queda programada', async () => {
    let current: Announcement = { ...DRAFT, publishDate: '2099-01-15' };
    mockApi({
      'GET /announcements': () => page([current]),
      'GET /media': () => page([]),
      [`GET /announcements/${ID}`]: () => json({ ...current, content: 'x' }),
      [`POST /announcements/${ID}/publish`]: () => {
        current = {
          ...current,
          status: 'publicado',
          publishedAt: '2099-01-15T05:00:00.000Z',
          scheduled: true,
        };
        return json(current);
      },
    });
    render(<AnnouncementsPage permissions={FULL} />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar' }),
    );
    expect(screen.getByLabelText(/Fecha de publicación/)).toHaveValue(
      '2099-01-15',
    );
    expect(
      screen.getByText('Se publicará el día 15 de enero de 2099.'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    expect(
      await screen.findByText(
        '«Arranca el campeonato» se publicará el día 15 de enero de 2099.',
      ),
    ).toBeVisible();
    expect(await screen.findByText('Programada')).toBeVisible();
  });
});
