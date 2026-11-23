import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../../api/client';
import type { GraphNodeDetails, GraphResponse } from '../../../../../api/seo';
import { ToastProvider } from '../../../../../components/Toast';
import { ThemeProvider } from '../../../../../theme';
import { AdminKnowledgeGraphPage } from '../AdminKnowledgeGraphPage';

/**
 * Knowledge Graph — real vs suggested edges, server-side filters through the
 * URL, node details, link create/delete with server confirmation, invalid
 * targets, orphans and role gating. @xyflow/react renders in jsdom with a
 * ResizeObserver stub (no layout, so we assert on node DOM + API calls).
 */

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', RO);
vi.stubGlobal(
  'DOMMatrixReadOnly',
  class {
    m22 = 1;
  },
);

const api = vi.hoisted(() => ({
  graph: vi.fn(),
  node: vi.fn(),
  createLink: vi.fn(),
  deleteLink: vi.fn(),
  removeRelation: vi.fn(),
  rescan: vi.fn(),
  approveSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
  generateSuggestions: vi.fn(),
}));
const access = vi.hoisted(() => ({ manage: true }));
vi.mock('../../../../../api/seo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../api/seo')>();
  return { ...actual, seoAdminApi: { ...actual.seoAdminApi, ...api } };
});
vi.mock('../../blogAdminShared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../blogAdminShared')>();
  return {
    ...actual,
    useBlogAccess: () => ({ access: { can: { view: true, manage: access.manage, publish: access.manage } }, loading: false, error: null }),
  };
});

const graph: GraphResponse = {
  nodes: [
    {
      id: 'post:p1',
      type: 'post',
      refId: 'p1',
      label: 'راهنمای عامل',
      slug: 'agent-guide',
      path: '/blog/agent-guide',
      language: 'fa',
      status: 'published',
      published: true,
      categoryId: 'c1',
      inbound: 0,
      outbound: 1,
      issues: { orphan: true, brokenOut: 1, noOutbound: false },
    },
    {
      id: 'post:p2',
      type: 'post',
      refId: 'p2',
      label: 'درآمد و تسویه',
      slug: 'earnings',
      path: '/blog/earnings',
      language: 'fa',
      status: 'published',
      published: true,
      categoryId: 'c1',
      inbound: 1,
      outbound: 0,
      issues: { orphan: false, brokenOut: 0, noOutbound: true },
    },
    {
      id: 'agent:a1',
      type: 'agent',
      refId: 'a1',
      label: 'Mesh Writer',
      slug: 'mesh-writer',
      path: '/agents/mesh-writer',
      language: 'en',
      status: 'published',
      published: true,
      categoryId: null,
      inbound: 0,
      outbound: 0,
      issues: { orphan: true, brokenOut: 0, noOutbound: true },
    },
    {
      id: 'keyword:k1',
      type: 'keyword',
      refId: 'k1',
      label: 'اتوماسیون',
      slug: null,
      path: null,
      language: null,
      status: null,
      published: true,
      categoryId: null,
      inbound: 2,
      outbound: 0,
      issues: { orphan: false, brokenOut: 0, noOutbound: false },
    },
  ],
  edges: [
    {
      id: 'l1',
      source: 'post:p1',
      target: 'post:p2',
      type: 'link',
      anchor: 'تسویه',
      status: 'ok',
      position: 2,
      language: 'fa',
      suggestionId: null,
      reason: null,
      score: null,
      linkId: 'l1',
    },
    {
      id: 's1',
      source: 'post:p2',
      target: 'agent:a1',
      type: 'suggestion',
      anchor: null,
      status: null,
      position: null,
      language: null,
      suggestionId: 's1',
      reason: 'shared_keyword',
      score: 70,
      linkId: null,
    },
    {
      id: 'k1e',
      source: 'post:p1',
      target: 'keyword:k1',
      type: 'keyword',
      anchor: null,
      status: null,
      position: null,
      language: null,
      suggestionId: null,
      reason: null,
      score: null,
      linkId: null,
    },
  ],
  meta: {
    nodes: 4,
    edges: 3,
    truncated: false,
    limit: 400,
    generatedAt: '2026-10-15T08:00:00.000Z',
    counts: { post: 2, agent: 1, keyword: 1, category: 0, suggestions: 1, broken: 1, orphans: 2 },
  },
};

const details: GraphNodeDetails = {
  content: {
    type: 'post',
    id: 'p1',
    title: 'راهنمای عامل',
    slug: 'agent-guide',
    path: '/blog/agent-guide',
    status: 'published',
    published: true,
    updatedAt: '2026-10-15T08:00:00.000Z',
  },
  language: 'fa',
  robots: 'index,follow',
  keywords: { focus: 'عامل هوشمند', related: ['اتوماسیون'] },
  translations: [],
  outbound: [
    {
      id: 'l1',
      href: '/blog/earnings',
      anchor: 'تسویه',
      position: 2,
      status: 'ok',
      target: { type: 'post', id: 'p2', title: 'درآمد و تسویه', path: '/blog/earnings', published: true, status: 'published' },
    },
    { id: 'l2', href: '/blog/missing', anchor: 'گم‌شده', position: 5, status: 'broken', target: null },
  ],
  inbound: [],
  relations: [],
  agentRelations: [],
  suggestions: [
    {
      id: 's9',
      reason: 'same_category',
      score: 55,
      status: 'pending',
      evidence: { category: 'automation' },
      direction: 'outbound',
      source: null,
      target: { type: 'agent', id: 'a1', title: 'Mesh Writer', path: '/agents/mesh-writer', published: true, status: 'published' },
    },
  ],
  issues: { orphan: true, noOutbound: false, brokenOut: 1, unpublishedOut: 0 },
};

function Probe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}
function renderAt(path = '/admin/blog/graph') {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/blog/graph" element={<AdminKnowledgeGraphPage />} />
          </Routes>
          <Probe />
        </MemoryRouter>
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/blog/graph');
  for (const fn of Object.values(api)) fn.mockReset();
  access.manage = true;
  api.graph.mockResolvedValue(graph);
  api.node.mockResolvedValue(details);
});

describe('AdminKnowledgeGraphPage', () => {
  it('renders real nodes with type icons/labels, issue badges, counts and legend', async () => {
    renderAt();
    const nodes = await screen.findAllByTestId('kg-node');
    expect(nodes.map((n) => n.getAttribute('data-type'))).toEqual(['post', 'post', 'agent', 'keyword']);
    expect(within(nodes[0]).getByText(/یتیم|orphan/)).toBeInTheDocument();
    expect(within(nodes[0]).getByText(/شکسته|broken/)).toBeInTheDocument();
    expect(screen.getByTestId('kg-meta')).toHaveTextContent(/[4۴]/);
    expect(screen.getByTestId('kg-legend')).toHaveTextContent(/پیشنهاد|Suggestion/);
    expect(screen.queryByTestId('kg-canvas-guide')).not.toBeInTheDocument();
    expect(api.graph).toHaveBeenCalledWith({});
  });

  it('expands the graph into focus mode and returns to the page layout', async () => {
    renderAt();
    await screen.findAllByTestId('kg-node');
    const canvas = screen.getByTestId('kg-canvas');
    fireEvent.click(screen.getByTestId('kg-expand'));
    expect(canvas.parentElement).toHaveClass('kg-layout--expanded');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(canvas.parentElement).not.toHaveClass('kg-layout--expanded'));
  });

  it('applies server-side filters through the URL and resets them', async () => {
    renderAt();
    await screen.findAllByTestId('kg-node');
    fireEvent.click(screen.getByTestId('kg-type-keyword'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('types=post%2Cagent%2Ccategory'));
    await waitFor(() => expect(api.graph).toHaveBeenLastCalledWith(expect.objectContaining({ types: ['post', 'agent', 'category'] })));
    fireEvent.change(screen.getByTestId('kg-orphans'), { target: { value: 'no-inbound' } });
    fireEvent.click(screen.getByTestId('kg-broken'));
    await waitFor(() => expect(api.graph).toHaveBeenLastCalledWith(expect.objectContaining({ orphans: 'no-inbound', broken: true })));
    fireEvent.change(screen.getByTestId('kg-search'), { target: { value: 'درآمد' } });
    await waitFor(() => expect(api.graph).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'درآمد' })));
    fireEvent.click(screen.getByTestId('kg-reset'));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(''));
    await waitFor(() => expect(api.graph).toHaveBeenLastCalledWith({}));
  });

  it('shows an empty state with a reset action when filters match nothing', async () => {
    api.graph.mockResolvedValue({ ...graph, nodes: [], edges: [], meta: { ...graph.meta, nodes: 0, edges: 0 } });
    renderAt('/admin/blog/graph?language=en');
    expect(await screen.findByTestId('kg-empty')).toHaveTextContent(/فیلتر|filters/);
  });

  it('opens node details from the server and routes link removal / suggestion decisions through the API', async () => {
    api.deleteLink.mockResolvedValue({ id: 'l2', removed: true, version: 4 });
    api.approveSuggestion.mockResolvedValue({
      applied: 'link',
      sourceId: 'p1',
      targetId: 'a1',
      href: '/agents/mesh-writer',
      anchor: null,
      version: 5,
    });
    renderAt();
    const nodes = await screen.findAllByTestId('kg-node');
    fireEvent.click(nodes[0]);
    const panel = await screen.findByTestId('kg-details');
    expect(window.location.search).toContain('node=post%3Ap1');
    await waitFor(() => expect(api.node).toHaveBeenCalledWith('post', 'p1'));
    expect(await within(panel).findByText('عامل هوشمند')).toBeInTheDocument();
    const outbound = within(panel).getByTestId('kg-outbound');
    expect(
      within(outbound)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('data-status')),
    ).toEqual(['ok', 'broken']);
    fireEvent.click(within(outbound).getAllByTestId('kg-link-delete')[1]);
    await waitFor(() => expect(api.deleteLink).toHaveBeenCalledWith('l2'));
    await waitFor(() => expect(api.graph).toHaveBeenCalledTimes(2));
    fireEvent.click(await within(panel).findByTestId('kg-suggestion-approve'));
    await waitFor(() => expect(api.approveSuggestion).toHaveBeenCalledWith('s9'));
  });

  it('only shows the inspector for a selected node and lets the operator close it', async () => {
    renderAt();
    expect(screen.queryByTestId('kg-details')).not.toBeInTheDocument();
    fireEvent.click((await screen.findAllByTestId('kg-node'))[0]);
    const panel = await screen.findByTestId('kg-details');
    fireEvent.click(within(panel).getByTestId('kg-details-close'));
    await waitFor(() => expect(screen.queryByTestId('kg-details')).not.toBeInTheDocument());
    expect(window.location.search).not.toContain('node=');
  });

  it('does not reselect an already open node', async () => {
    renderAt();
    const node = (await screen.findAllByTestId('kg-node'))[0];
    fireEvent.click(node);
    await screen.findByTestId('kg-details');
    await waitFor(() => expect(api.node).toHaveBeenCalledTimes(1));
    fireEvent.click(node);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(api.node).toHaveBeenCalledTimes(1);
  });

  it('creates a link only for a real target and surfaces INVALID_STATE from the server', async () => {
    api.createLink.mockRejectedValueOnce(new ApiError('INVALID_STATE', 'archived', 409)).mockResolvedValueOnce({
      applied: 'link',
      sourceId: 'p1',
      targetId: 'a1',
      href: '/agents/mesh-writer',
      anchor: 'Writer',
      version: 6,
    });
    renderAt();
    fireEvent.click((await screen.findAllByTestId('kg-node'))[0]);
    const form = await screen.findByTestId('kg-create-link');
    const target = within(form).getByLabelText(/مقصد|Target/);
    fireEvent.change(target, { target: { value: 'ناموجود' } });
    fireEvent.click(within(form).getByTestId('kg-create-submit'));
    expect(within(form).getByRole('alert')).toHaveTextContent(/فهرست|list/);
    expect(api.createLink).not.toHaveBeenCalled();
    fireEvent.change(target, { target: { value: 'Mesh Writer' } });
    fireEvent.change(within(form).getByLabelText(/لنگر|Anchor/), { target: { value: 'Writer' } });
    fireEvent.click(within(form).getByTestId('kg-create-submit'));
    await waitFor(() =>
      expect(api.createLink).toHaveBeenCalledWith({
        sourceType: 'post',
        sourceId: 'p1',
        targetType: 'agent',
        targetId: 'a1',
        anchor: 'Writer',
      }),
    );
    expect(await screen.findByText(/بایگانی شده|archived or cannot/)).toBeInTheDocument();
    fireEvent.click(within(form).getByTestId('kg-create-submit'));
    await waitFor(() => expect(api.createLink).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/پیوند ایجاد و در مقاله ذخیره شد|Link created and saved/)).toBeInTheDocument();
  });

  it('hides mutations from viewers without blog:manage', async () => {
    access.manage = false;
    renderAt();
    fireEvent.click((await screen.findAllByTestId('kg-node'))[0]);
    const panel = await screen.findByTestId('kg-details');
    await within(panel).findByText('عامل هوشمند');
    expect(within(panel).queryByTestId('kg-create-link')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('kg-link-delete')).not.toBeInTheDocument();
    expect(within(panel).queryByTestId('kg-suggestion-approve')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kg-rescan')).not.toBeInTheDocument();
  });

  it('shows the error state with retry when the graph endpoint fails', async () => {
    api.graph.mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce(graph);
    renderAt();
    expect(await screen.findByRole('alert')).toHaveTextContent('db down');
    fireEvent.click(screen.getByRole('button', { name: /تلاش مجدد|Retry|تلاش دوباره/ }));
    expect(await screen.findAllByTestId('kg-node')).toHaveLength(4);
  });
});
