import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ApiError } from '../../../../api/client';
import {
  seoAdminApi,
  type GraphEdgeType,
  type GraphFilters,
  type GraphNode,
  type GraphNodeDetails,
  type GraphNodeType,
  type GraphResponse,
  type SeoLanguage,
} from '../../../../api/seo';
import { useToast } from '../../../../components/Toast';
import {
  Alert,
  AppIcon,
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SearchField,
  Spinner,
  Toggle,
} from '../../../../components/ui';
import type { IconName } from '../../../../components/ui';
import { getLocale, t } from '../../../../i18n';
import { formatCount, formatDateTime } from '../../../../lib/format';
import { usePageMeta } from '../../../../lib/usePageMeta';
import { blogErrorMessage, useBlogAccess } from '../blogAdminShared';
import { layoutGraph } from './graphLayout';

/**
 * `/admin/blog/graph` — the Knowledge Graph. Everything on the canvas comes
 * from `GET /admin/seo/graph` (server-side filters + limit); node details,
 * link creation/removal and suggestion decisions go through the same API and
 * the canvas re-fetches after each confirmed mutation. Nothing is inferred on
 * the client. Encodings are never colour-only: node type = icon + label,
 * edge type = stroke pattern + marker + legend text, issues = badges.
 */

const NODE_TYPES: GraphNodeType[] = ['post', 'agent', 'keyword', 'category'];
const EDGE_TYPES: GraphEdgeType[] = ['link', 'relation', 'keyword', 'category', 'suggestion', 'translation'];
const NODE_ICON: Record<GraphNodeType, IconName> = { post: 'fileText', agent: 'package', keyword: 'tag', category: 'folder' };
const EDGE_STYLE: Record<GraphEdgeType, { color: string; dash?: string; width: number; marker: boolean }> = {
  link: { color: '#6654e9', width: 3.8, marker: true },
  relation: { color: '#087e8b', dash: '10 5', width: 3.35, marker: true },
  keyword: { color: '#c06a05', dash: '3 5', width: 2.9, marker: false },
  category: { color: '#64748b', dash: '2 6', width: 2.8, marker: false },
  suggestion: { color: '#64748b', dash: '6 5', width: 3, marker: true },
  translation: { color: '#8b5cf6', dash: '13 4 3 4', width: 3.2, marker: false },
};

type GraphNodeData = { node: GraphNode; dim: boolean; selected: boolean };

const KgNode = memo(function KgNode({ data }: NodeProps<Node<GraphNodeData>>) {
  const { node, dim, selected } = data;
  return (
    <div
      className={`kg-node kg-node--${node.type}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${node.published || node.type === 'keyword' || node.type === 'category' ? '' : ' is-unpublished'}`}
      data-testid="kg-node"
      data-type={node.type}
      data-id={node.refId}
    >
      <Handle type="target" position={Position.Top} className="kg-handle" />
      <span className="kg-node__icon">
        <AppIcon name={NODE_ICON[node.type]} size="sm" label={t(`blog.graph.type.${node.type}`)} />
      </span>
      <span className="kg-node__label">{node.label}</span>
      <span className="kg-node__meta">
        {node.language && <span className="kg-tag">{node.language}</span>}
        {node.status && node.type !== 'keyword' && node.type !== 'category' && <span className="kg-tag">{node.status}</span>}
        {node.issues.orphan && <span className="kg-tag kg-tag--warn">{t('blog.graph.issue.orphan')}</span>}
        {node.issues.brokenOut > 0 && (
          <span className="kg-tag kg-tag--danger">{t('blog.graph.issue.broken', { n: formatCount(node.issues.brokenOut) })}</span>
        )}
      </span>
      <Handle type="source" position={Position.Bottom} className="kg-handle" />
    </div>
  );
});
const nodeTypes = { kg: KgNode };

function parseFilters(params: URLSearchParams): GraphFilters {
  const list = <T extends string>(key: string, allowed: readonly T[]): T[] | undefined => {
    const v = params.get(key);
    if (!v) return undefined;
    const out = v.split(',').filter((x): x is T => (allowed as readonly string[]).includes(x));
    return out.length ? out : undefined;
  };
  const language = params.get('language');
  const orphans = params.get('orphans');
  return {
    types: list('types', NODE_TYPES),
    relations: list('relations', EDGE_TYPES),
    language: language === 'fa' || language === 'en' ? language : undefined,
    status: params.get('status') || undefined,
    category: params.get('category') || undefined,
    keyword: params.get('keyword') || undefined,
    orphans: orphans === 'no-inbound' || orphans === 'no-outbound' ? orphans : undefined,
    broken: params.get('broken') === '1' || undefined,
    suggested: params.get('suggested') === '1' || undefined,
    q: params.get('q') || undefined,
    focus: params.get('focus') || undefined,
    limit: Number(params.get('limit')) || undefined,
  };
}

function serializeFilters(f: GraphFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.types?.length) p.set('types', f.types.join(','));
  if (f.relations?.length) p.set('relations', f.relations.join(','));
  if (f.language) p.set('language', f.language);
  if (f.status) p.set('status', f.status);
  if (f.category) p.set('category', f.category);
  if (f.keyword) p.set('keyword', f.keyword);
  if (f.orphans) p.set('orphans', f.orphans);
  if (f.broken) p.set('broken', '1');
  if (f.suggested) p.set('suggested', '1');
  if (f.q) p.set('q', f.q);
  if (f.focus) p.set('focus', f.focus);
  if (f.limit) p.set('limit', String(f.limit));
  return p;
}

const isDefaultFilters = (f: GraphFilters) => serializeFilters(f).toString() === '';

function Canvas({
  data,
  selectedId,
  onSelect,
  search,
  expanded,
  onToggleExpanded,
}: {
  data: GraphResponse;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  search: string;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const flow = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  // Once the full graph is fitted, this becomes the lower zoom boundary. The
  // overview is therefore the furthest-out view — no empty, unreadable space
  // beyond it — while the user can still zoom in for readable node detail.
  const [overviewZoom, setOverviewZoom] = useState(0.1);
  const positions = useMemo(() => layoutGraph(data.nodes, data.edges), [data]);
  const neighbours = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    set.add(selectedId);
    for (const e of data.edges) {
      if (e.source === selectedId) set.add(e.target);
      if (e.target === selectedId) set.add(e.source);
    }
    return set;
  }, [data.edges, selectedId]);
  const q = search.trim().toLowerCase();

  const nodes = useMemo<Node<GraphNodeData>[]>(
    () =>
      data.nodes.map((node, i) => {
        const matches = !q || node.label.toLowerCase().includes(q) || (node.slug ?? '').toLowerCase().includes(q);
        const dim = (selectedId ? !neighbours.has(node.id) : false) || !matches;
        return {
          id: node.id,
          type: 'kg',
          position: { x: positions[i]?.x ?? 0, y: positions[i]?.y ?? 0 },
          // Keep visual selection in node data. Controlling React Flow's own
          // `selected` field while it emits selection updates can create a
          // render feedback loop in React 19.
          data: { node, dim, selected: node.id === selectedId },
          ariaLabel: `${t(`blog.graph.type.${node.type}`)}: ${node.label}`,
        };
      }),
    [data.nodes, positions, selectedId, neighbours, q],
  );
  const edges = useMemo<Edge[]>(
    () =>
      data.edges.map((e) => {
        const style = EDGE_STYLE[e.type];
        const active = selectedId ? e.source === selectedId || e.target === selectedId : true;
        const broken = e.status === 'broken';
        const cls = `kg-edge kg-edge--${e.type}${broken ? ' is-broken' : ''}${e.status === 'unpublished' ? ' is-unpublished' : ''}${active ? '' : ' is-dim'}`;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'default',
          className: cls,
          style: { stroke: style.color, strokeDasharray: style.dash, strokeWidth: style.width },
          markerEnd: style.marker ? { type: MarkerType.ArrowClosed, color: style.color, width: 20, height: 20 } : undefined,
          label:
            selectedId && active
              ? `${t(`blog.graph.edge.${e.type}`)}${e.anchor ? ` · “${e.anchor}”` : ''}${broken ? ` · ${t('blog.graph.status.broken')}` : ''}`
              : undefined,
          labelBgPadding: [4, 2] as [number, number],
          ariaLabel: `${t(`blog.graph.edge.${e.type}`)} ${e.source} → ${e.target}`,
          focusable: false,
        };
      }),
    [data.edges, selectedId],
  );

  // `useReactFlow()` may expose a new facade while the internal store updates.
  // Keep it in a ref and fit only when the graph topology changes — never when
  // the user selects a node or the inspector loads. This avoids feeding a
  // React Flow store update back into another render/update cycle.
  const flowRef = useRef(flow);
  const fittedTopologyRef = useRef<string | null>(null);
  useEffect(() => {
    flowRef.current = flow;
  }, [flow]);
  const topologyKey = useMemo(
    () => `${data.nodes.map((node) => node.id).join('|')}::${data.edges.map((edge) => edge.id).join('|')}`,
    [data.nodes, data.edges],
  );
  const overviewKey = `${topologyKey}:${expanded ? 'expanded' : 'default'}`;
  useEffect(() => {
    if (!nodesInitialized || fittedTopologyRef.current === overviewKey) return;
    fittedTopologyRef.current = overviewKey;
    let active = true;
    const id = window.setTimeout(() => {
      void flowRef.current.fitView({ padding: expanded ? 0.08 : 0.12, duration: expanded ? 180 : 0 }).then(() => {
        if (!active) return;
        // React Flow has now calculated the exact overview zoom for this
        // topology. Clamp only to the component's safe zoom range.
        setOverviewZoom(Math.max(0.1, Math.min(flowRef.current.getZoom(), 2.75)));
      });
    }, 50);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [overviewKey, nodesInitialized]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      nodesFocusable
      edgesFocusable={false}
      minZoom={overviewZoom}
      maxZoom={2.75}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, node) => {
        if (node.id !== selectedId) onSelect(node.id);
      }}
      onPaneClick={() => {
        if (selectedId) onSelect(null);
      }}
      aria-label={t('blog.graph.canvasLabel')}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.35} />
      <div className="kg-zoom" role="group" aria-label={t('blog.graph.zoom')}>
        <button
          type="button"
          className="cs-tool"
          onClick={() => void flow.zoomIn()}
          aria-label={t('blog.graph.zoomIn')}
          title={t('blog.graph.zoomIn')}
        >
          <AppIcon name="zoomIn" size="xs" />
        </button>
        <button
          type="button"
          className="cs-tool"
          onClick={() => void flow.zoomOut()}
          aria-label={t('blog.graph.zoomOut')}
          title={t('blog.graph.zoomOut')}
        >
          <AppIcon name="zoomOut" size="xs" />
        </button>
        <button
          type="button"
          className="cs-tool"
          onClick={() => void flow.fitView({ padding: expanded ? 0.08 : 0.12, duration: 240 })}
          aria-label={t('blog.graph.fit')}
          title={t('blog.graph.fit')}
          data-testid="kg-fit"
        >
          <AppIcon name="focus" size="xs" />
        </button>
        <button
          type="button"
          className={`cs-tool${expanded ? ' is-active' : ''}`}
          onClick={onToggleExpanded}
          aria-label={expanded ? t('blog.graph.collapse') : t('blog.graph.expand')}
          title={expanded ? t('blog.graph.collapse') : t('blog.graph.expand')}
          aria-pressed={expanded}
          data-testid="kg-expand"
        >
          <AppIcon name="fitView" size="xs" />
        </button>
      </div>
    </ReactFlow>
  );
}

function Legend() {
  return (
    <details className="kg-legend" data-testid="kg-legend">
      <summary>{t('blog.graph.legend')}</summary>
      <div className="kg-legend__cols">
        <ul aria-label={t('blog.graph.legend.nodes')}>
          {NODE_TYPES.map((type) => (
            <li key={type}>
              <span className={`kg-legend__node kg-node--${type}`}>
                <AppIcon name={NODE_ICON[type]} size="xs" />
              </span>
              {t(`blog.graph.type.${type}`)}
            </li>
          ))}
        </ul>
        <ul aria-label={t('blog.graph.legend.edges')}>
          {EDGE_TYPES.map((type) => (
            <li key={type}>
              <svg width="44" height="10" aria-hidden="true" className={`kg-edge kg-edge--${type}`}>
                <line x1="0" y1="5" x2="44" y2="5" strokeDasharray={EDGE_STYLE[type].dash} strokeWidth={EDGE_STYLE[type].width} />
              </svg>
              {t(`blog.graph.edge.${type}`)}
            </li>
          ))}
          <li>
            <svg width="44" height="10" aria-hidden="true" className="kg-edge is-broken">
              <line x1="0" y1="5" x2="44" y2="5" strokeWidth="2" />
            </svg>
            {t('blog.graph.status.broken')}
          </li>
        </ul>
      </div>
    </details>
  );
}

function NodeDetails({
  id,
  nodes,
  canManage,
  onChanged,
  onFocus,
  onClose,
}: {
  id: string;
  nodes: GraphNode[];
  canManage: boolean;
  onChanged: () => void;
  onFocus: (id: string) => void;
  onClose: () => void;
}) {
  const toast = useToast();
  const [type, refId] = id.split(':') as [GraphNodeType, string];
  const contentType = (type === 'agent' ? 'agent' : 'post') as 'post' | 'agent';
  const graphNode = nodes.find((n) => n.id === id) ?? null;
  const [details, setDetails] = useState<GraphNodeDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [anchor, setAnchor] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const lang = getLocale();
  const isContent = type === 'post' || type === 'agent';

  // State resets per node because the parent keys this component by node id.
  const load = useCallback(() => {
    if (!isContent) return;
    let cancelled = false;
    seoAdminApi
      .node(contentType, refId)
      .then((d) => !cancelled && setDetails(d))
      .catch((e: unknown) => !cancelled && setError(blogErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [contentType, refId, isContent]);
  useEffect(() => load(), [load]);

  const run = async (key: string, action: () => Promise<unknown>, success: string): Promise<boolean> => {
    setBusy(key);
    try {
      await action();
      toast.success(success);
      setDetails(null);
      load();
      onChanged();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError && e.code === 'INVALID_STATE' ? t('blog.graph.err.invalidTarget') : blogErrorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const candidates = nodes.filter((n) => (n.type === 'post' || n.type === 'agent') && n.id !== id);
  const createLink = async () => {
    const chosen = candidates.find((n) => n.id === target || n.label === target || n.slug === target);
    if (!chosen) {
      setCreateError(t('blog.graph.err.pickTarget'));
      return;
    }
    setCreateError(null);
    const ok = await run(
      'create',
      () =>
        seoAdminApi.createLink({
          sourceType: contentType,
          sourceId: refId,
          targetType: chosen.type as 'post' | 'agent',
          targetId: chosen.refId,
          anchor: anchor.trim() || null,
        }),
      t('blog.graph.linkCreated'),
    );
    if (ok) {
      setTarget('');
      setAnchor('');
    }
  };

  if (!isContent) {
    return (
      <aside className="kg-details" aria-label={t('blog.graph.details')} data-testid="kg-details">
        <header className="kg-details__title-row">
          <div>
            <p className="kg-details__eyebrow">{t(`blog.graph.type.${type}`)}</p>
            <h3>
              <AppIcon name={NODE_ICON[type]} size="sm" /> {graphNode?.label ?? refId}
            </h3>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label={t('blog.graph.closeDetails')}
            title={t('blog.graph.closeDetails')}
            data-testid="kg-details-close"
          >
            <AppIcon name="close" size="xs" />
          </Button>
        </header>
        {graphNode && (
          <p className="kg-details__stat">
            {t('blog.graph.degree', { inbound: formatCount(graphNode.inbound), outbound: formatCount(graphNode.outbound) })}
          </p>
        )}
        <Button size="sm" variant="secondary" onClick={() => onFocus(id)}>
          <AppIcon name="focus" size="xs" /> {t('blog.graph.focusNode')}
        </Button>
      </aside>
    );
  }

  return (
    <aside className="kg-details" aria-label={t('blog.graph.details')} data-testid="kg-details" aria-busy={!details && !error}>
      <Button
        size="sm"
        variant="ghost"
        className="kg-details__close"
        onClick={onClose}
        aria-label={t('blog.graph.closeDetails')}
        title={t('blog.graph.closeDetails')}
        data-testid="kg-details-close"
      >
        <AppIcon name="close" size="xs" />
      </Button>
      {error && <ErrorState description={error} retry={load} />}
      {!details && !error && (
        <p className="row" style={{ gap: 8 }}>
          <Spinner /> <span className="muted small">{t('blog.graph.loadingNode')}</span>
        </p>
      )}
      {details && (
        <>
          <header className="kg-details__head">
            <div className="kg-details__title-row">
              <div>
                <p className="kg-details__eyebrow">{t(`blog.graph.type.${type}`)}</p>
                <h3>
                  <AppIcon name={NODE_ICON[type]} size="sm" /> {details.content.title}
                </h3>
              </div>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <Badge tone={details.content.published ? 'success' : 'neutral'}>{details.content.status}</Badge>
              <Badge tone="info">{details.language}</Badge>
              <Badge tone={details.robots.includes('noindex') ? 'warning' : 'neutral'}>{details.robots}</Badge>
              {details.issues.orphan && <Badge tone="warning">{t('blog.graph.issue.orphan')}</Badge>}
              {details.issues.noOutbound && <Badge tone="warning">{t('blog.graph.issue.noOutbound')}</Badge>}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Link
                className="btn btn--secondary btn--xs"
                to={type === 'post' ? `/admin/blog/posts/${refId}` : `/admin/agents?focus=${refId}`}
              >
                <AppIcon name="edit" size="xs" /> {t('blog.graph.openEditor')}
              </Link>
              <a className="btn btn--ghost btn--xs" href={details.content.path} target="_blank" rel="noopener noreferrer">
                {t('blog.graph.openPublic')} <AppIcon name="external" size="xs" />
              </a>
              <Button size="sm" variant="ghost" onClick={() => onFocus(id)}>
                <AppIcon name="focus" size="xs" /> {t('blog.graph.focusNode')}
              </Button>
            </div>
            <p className="small muted">{t('blog.graph.updated', { when: formatDateTime(details.content.updatedAt) })}</p>
          </header>

          <section>
            <h4>{t('blog.graph.keywords')}</h4>
            {details.keywords.focus || details.keywords.related.length ? (
              <div className="blog-chips__row">
                {details.keywords.focus && <Badge tone="accent">{details.keywords.focus}</Badge>}
                {details.keywords.related.map((k) => (
                  <Badge key={k}>{k}</Badge>
                ))}
              </div>
            ) : (
              <p className="small muted">{t('blog.graph.noKeywords')}</p>
            )}
          </section>

          <section data-testid="kg-outbound">
            <h4>
              {t('blog.graph.outbound')} <span className="muted">({formatCount(details.outbound.length)})</span>
            </h4>
            {details.outbound.length ? (
              <ul className="kg-list">
                {details.outbound.map((l) => (
                  <li key={l.id} data-status={l.status}>
                    <Badge tone={l.status === 'ok' ? 'success' : l.status === 'broken' ? 'danger' : 'warning'}>
                      {t(`blog.graph.status.${l.status}`)}
                    </Badge>
                    <span className="kg-list__main">
                      {l.target ? (
                        <button type="button" className="link-button" onClick={() => onFocus(`${l.target?.type}:${l.target?.id}`)}>
                          {l.target.title}
                        </button>
                      ) : (
                        <span dir="ltr">{l.href}</span>
                      )}
                      {l.anchor && <small className="muted"> · “{l.anchor}”</small>}
                      <small className="muted"> · {t('blog.graph.block', { n: formatCount(l.position + 1) })}</small>
                    </span>
                    {canManage && type === 'post' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => void run(l.id, () => seoAdminApi.deleteLink(l.id), t('blog.graph.linkRemoved'))}
                        aria-label={t('blog.graph.removeLink')}
                        title={t('blog.graph.removeLink')}
                        data-testid="kg-link-delete"
                      >
                        <AppIcon name="unlink" size="xs" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">{t('blog.graph.noOutbound')}</p>
            )}
          </section>

          <section data-testid="kg-inbound">
            <h4>
              {t('blog.graph.inbound')} <span className="muted">({formatCount(details.inbound.length)})</span>
            </h4>
            {details.inbound.length ? (
              <ul className="kg-list">
                {details.inbound.map((l) => (
                  <li key={l.id}>
                    <Badge tone={l.status === 'ok' ? 'success' : 'warning'}>{t(`blog.graph.status.${l.status}`)}</Badge>
                    <span className="kg-list__main">
                      {l.source ? (
                        <button type="button" className="link-button" onClick={() => onFocus(`${l.source?.type}:${l.source?.id}`)}>
                          {l.source.title}
                        </button>
                      ) : (
                        '—'
                      )}
                      {l.anchor && <small className="muted"> · “{l.anchor}”</small>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">{t('blog.graph.noInbound')}</p>
            )}
          </section>

          {(details.relations.length > 0 || details.agentRelations.length > 0) && (
            <section>
              <h4>{t('blog.graph.relations')}</h4>
              <ul className="kg-list">
                {[...details.relations, ...details.agentRelations].map((r) => (
                  <li key={`${r.type}:${r.id}`}>
                    <Badge>{t(`blog.graph.type.${r.type}`)}</Badge>
                    <span className="kg-list__main">
                      <button type="button" className="link-button" onClick={() => onFocus(`${r.type}:${r.id}`)}>
                        {r.title}
                      </button>
                    </span>
                    {canManage && type === 'post' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() =>
                          void run(
                            `rel-${r.id}`,
                            () => seoAdminApi.removeRelation({ sourceId: refId, targetType: r.type, targetId: r.id }),
                            t('blog.graph.relationRemoved'),
                          )
                        }
                        aria-label={t('blog.graph.removeRelation')}
                        title={t('blog.graph.removeRelation')}
                      >
                        <AppIcon name="x" size="xs" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {details.translations.length > 0 && (
            <section>
              <h4>{t('blog.seo.translations')}</h4>
              <ul className="kg-list">
                {details.translations.map((tr) => (
                  <li key={tr.id}>
                    <Badge tone="info">{tr.language}</Badge>
                    <span className="kg-list__main">
                      <button type="button" className="link-button" onClick={() => onFocus(`${tr.type}:${tr.id}`)}>
                        {tr.title}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section data-testid="kg-suggestions">
            <h4>
              {t('blog.graph.suggestions')}{' '}
              <span className="muted">({formatCount(details.suggestions.filter((s) => s.status === 'pending').length)})</span>
            </h4>
            {details.suggestions.length ? (
              <ul className="kg-list kg-list--stack">
                {details.suggestions.map((s) => {
                  const other = s.direction === 'outbound' ? s.target : s.source;
                  const terms = (s.evidence.terms as string[] | undefined) ?? (s.evidence.overlap as string[] | undefined) ?? [];
                  return (
                    <li key={s.id} data-status={s.status} data-testid="kg-suggestion">
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <Badge tone={s.status === 'pending' ? 'accent' : s.status === 'approved' ? 'success' : 'neutral'}>
                          {t(`blog.graph.suggestion.${s.status}`)}
                        </Badge>
                        <Badge>{t(`blog.graph.reason.${s.reason}`)}</Badge>
                        <span className="small muted">{t('blog.graph.score', { n: formatCount(s.score) })}</span>
                      </div>
                      <p className="small">
                        {s.direction === 'outbound' ? t('blog.graph.suggestTo') : t('blog.graph.suggestFrom')}{' '}
                        {other ? (
                          <button type="button" className="link-button" onClick={() => onFocus(`${other.type}:${other.id}`)}>
                            {other.title}
                          </button>
                        ) : (
                          '—'
                        )}
                      </p>
                      <p className="small muted">
                        {t('blog.graph.evidence')}:{' '}
                        {terms.length
                          ? terms.join('، ')
                          : typeof s.evidence.category === 'string'
                            ? s.evidence.category
                            : typeof s.evidence.inbound === 'number'
                              ? t('blog.graph.evidenceInbound', { n: formatCount(s.evidence.inbound) })
                              : '—'}
                      </p>
                      {canManage && s.status === 'pending' && s.direction === 'outbound' && (
                        <div className="row" style={{ gap: 6 }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() => void run(s.id, () => seoAdminApi.approveSuggestion(s.id), t('blog.graph.suggestionApproved'))}
                            data-testid="kg-suggestion-approve"
                          >
                            <AppIcon name="check" size="xs" /> {t('blog.graph.approve')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null}
                            onClick={() =>
                              void run(`rej-${s.id}`, () => seoAdminApi.rejectSuggestion(s.id), t('blog.graph.suggestionRejected'))
                            }
                            data-testid="kg-suggestion-reject"
                          >
                            <AppIcon name="x" size="xs" /> {t('blog.graph.reject')}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="small muted">{t('blog.graph.noSuggestions')}</p>
            )}
            {canManage && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    'gen',
                    () => seoAdminApi.generateSuggestions(type === 'post' ? refId : undefined),
                    t('blog.graph.suggestionsGenerated'),
                  )
                }
                data-testid="kg-generate"
              >
                <AppIcon name="refreshCw" size="xs" /> {t('blog.graph.generate')}
              </Button>
            )}
          </section>

          {canManage && type === 'post' && (
            <section className="kg-create" data-testid="kg-create-link">
              <h4>{t('blog.graph.createLink')}</h4>
              <p className="small muted">{t('blog.graph.createLinkHint')}</p>
              <label className="field__label" htmlFor="kg-target">
                {t('blog.graph.target')}
              </label>
              <Input
                id="kg-target"
                list="kg-targets"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={t('blog.graph.targetPlaceholder')}
              />
              <datalist id="kg-targets">
                {candidates.map((n) => (
                  <option key={n.id} value={n.label}>
                    {t(`blog.graph.type.${n.type}`)} · {n.slug}
                  </option>
                ))}
              </datalist>
              <label className="field__label" htmlFor="kg-anchor">
                {t('blog.graph.anchor')}
              </label>
              <Input
                id="kg-anchor"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
                maxLength={120}
                placeholder={t('blog.graph.anchorPlaceholder')}
              />
              {createError && (
                <p className="field__error" role="alert">
                  {createError}
                </p>
              )}
              <Button
                size="sm"
                variant="primary"
                disabled={busy !== null || !target.trim()}
                onClick={() => void createLink()}
                data-testid="kg-create-submit"
              >
                {busy === 'create' ? t('blog.common.working') : t('blog.graph.createLinkAction')}
              </Button>
            </section>
          )}
        </>
      )}
      <p className="small muted" lang={lang}>
        {t('blog.graph.serverTruth')}
      </p>
    </aside>
  );
}

export function AdminKnowledgeGraphPage() {
  usePageMeta(t('blog.graph.title'), undefined, 'MESH', { robots: 'noindex,nofollow' });
  const { access } = useBlogAccess();
  const canManage = access?.can.manage ?? false;
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const [data, setData] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const filtersKey = JSON.stringify(filters);
  const [reloadTick, setReloadTick] = useState(0);
  const loading = loadedKey !== `${filtersKey}#${reloadTick}` && !error;
  const [selected, setSelected] = useState<string | null>(params.get('node'));
  const [search, setSearch] = useState(filters.q ?? '');
  const [rescanBusy, setRescanBusy] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const toast = useToast();
  const reloadRef = useRef(0);

  useEffect(() => {
    if (!graphExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGraphExpanded(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [graphExpanded]);

  const update = (patch: Partial<GraphFilters>) => {
    const next = serializeFilters({ ...filters, ...patch });
    if (selected) next.set('node', selected);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  useEffect(() => {
    const token = (reloadRef.current += 1);
    const key = `${filtersKey}#${reloadTick}`;
    seoAdminApi
      .graph(JSON.parse(filtersKey) as GraphFilters)
      .then((g) => {
        if (token !== reloadRef.current) return;
        setData(g);
        setError(null);
        setLoadedKey(key);
      })
      .catch((e: unknown) => {
        if (token !== reloadRef.current) return;
        setError(blogErrorMessage(e));
        setLoadedKey(key);
      });
  }, [filtersKey, reloadTick]);
  const load = useCallback(() => {
    setError(null);
    setReloadTick((n) => n + 1);
  }, []);

  // Search: debounce into the server-side `q` filter; the canvas highlights matches immediately.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if ((filters.q ?? '') !== search.trim()) update({ q: search.trim() || undefined });
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const replaceSelectedNodeInAddress = (id: string | null) => {
    // Selecting a visual node is local canvas interaction, not route
    // navigation. Update the shareable address without asking React Router to
    // navigate/restore scroll, which keeps the viewport exactly where it is.
    const next = new URLSearchParams(window.location.search);
    if (id) next.set('node', id);
    else next.delete('node');
    const search = next.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
  };

  const select = (id: string | null) => {
    if (id === selected) return;
    setSelected(id);
    replaceSelectedNodeInAddress(id);
  };
  const focusNode = (id: string) => {
    if (id === selected && filters.focus === id.split(':')[1]) return;
    const [type, refId] = id.split(':');
    setSelected(id);
    const next = serializeFilters({ ...filters, focus: type === 'post' || type === 'agent' ? refId : undefined });
    next.set('node', id);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const toggleIn = <T extends string>(list: T[] | undefined, all: T[], value: T): T[] | undefined => {
    const current = list?.length ? list : all;
    const next = current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
    return next.length === all.length ? undefined : next;
  };
  const activeTypes = filters.types?.length ? filters.types : NODE_TYPES;
  const activeRelations = filters.relations?.length ? filters.relations : EDGE_TYPES;

  return (
    <div className="container page kg-page" data-testid="admin-knowledge-graph">
      <PageHeader
        title={t('blog.graph.title')}
        description={t('blog.graph.subtitle')}
        icon="graph"
        actions={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {canManage && (
              <Button
                size="sm"
                variant="secondary"
                disabled={rescanBusy}
                onClick={() => {
                  setRescanBusy(true);
                  seoAdminApi
                    .rescan()
                    .then((r) => {
                      toast.success(t('blog.graph.rescanDone', { links: formatCount(r.links), broken: formatCount(r.broken) }));
                      load();
                    })
                    .catch((e: unknown) => toast.error(blogErrorMessage(e)))
                    .finally(() => setRescanBusy(false));
                }}
                data-testid="kg-rescan"
              >
                <AppIcon name="refreshCw" size="xs" /> {rescanBusy ? t('blog.common.working') : t('blog.graph.rescan')}
              </Button>
            )}
            <Link className="btn btn--ghost btn--sm" to="/admin/blog">
              {t('blog.common.backToList')}
            </Link>
          </div>
        }
      />

      <section className="card kg-filters" aria-label={t('blog.graph.filters')} data-testid="kg-filters">
        <div className="kg-filters__toolbar">
          <SearchField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('blog.graph.searchPlaceholder')}
            aria-label={t('blog.graph.search')}
            data-testid="kg-search"
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={isDefaultFilters(filters) && !search}
            onClick={() => {
              setSearch('');
              setSelected(null);
              setParams(new URLSearchParams(), { replace: true, preventScrollReset: true });
            }}
            data-testid="kg-reset"
          >
            <AppIcon name="refreshCw" size="xs" /> {t('blog.graph.reset')}
          </Button>
        </div>

        <div className="kg-filter-section">
          <p className="kg-filter-section__label">{t('blog.graph.filter.types')}</p>
          <div className="kg-filter-group kg-filter-group--nodes" role="group" aria-label={t('blog.graph.filter.types')}>
            {NODE_TYPES.map((type) => (
              <Chip
                key={type}
                active={activeTypes.includes(type)}
                onClick={() => update({ types: toggleIn(filters.types, NODE_TYPES, type) })}
                data-testid={`kg-type-${type}`}
              >
                <AppIcon name={NODE_ICON[type]} size="xs" /> {t(`blog.graph.type.${type}`)}
                {data && <span className="kg-filter-count">{formatCount(data.meta.counts[type] ?? 0)}</span>}
              </Chip>
            ))}
          </div>
        </div>

        <div className="kg-filter-section">
          <p className="kg-filter-section__label">{t('blog.graph.filter.relations')}</p>
          <div className="kg-filter-group kg-filter-group--relations" role="group" aria-label={t('blog.graph.filter.relations')}>
            {EDGE_TYPES.map((type) => (
              <Chip
                key={type}
                active={activeRelations.includes(type)}
                onClick={() => update({ relations: toggleIn(filters.relations, EDGE_TYPES, type) })}
                data-testid={`kg-rel-${type}`}
              >
                {t(`blog.graph.edge.${type}`)}
              </Chip>
            ))}
          </div>
        </div>

        <details className="kg-advanced-filters">
          <summary>
            <AppIcon name="sliders" size="xs" /> {t('blog.graph.moreFilters')}
          </summary>
          <div className="kg-advanced-filters__body">
            <label className="kg-filter">
              <span>{t('blog.seo.language')}</span>
              <select
                value={filters.language ?? ''}
                onChange={(e) => update({ language: (e.target.value || undefined) as SeoLanguage | undefined })}
                data-testid="kg-language"
              >
                <option value="">{t('blog.graph.any')}</option>
                <option value="fa">فارسی</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="kg-filter">
              <span>{t('blog.graph.filter.status')}</span>
              <select value={filters.status ?? ''} onChange={(e) => update({ status: e.target.value || undefined })} data-testid="kg-status">
                <option value="">{t('blog.graph.any')}</option>
                {['draft', 'in_review', 'approved', 'scheduled', 'published', 'archived'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="kg-filter">
              <span>{t('blog.graph.filter.orphans')}</span>
              <select
                value={filters.orphans ?? ''}
                onChange={(e) => update({ orphans: (e.target.value || undefined) as GraphFilters['orphans'] })}
                data-testid="kg-orphans"
              >
                <option value="">{t('blog.graph.any')}</option>
                <option value="no-inbound">{t('blog.graph.orphans.noInbound')}</option>
                <option value="no-outbound">{t('blog.graph.orphans.noOutbound')}</option>
              </select>
            </label>
            <label className="kg-filter">
              <span>{t('blog.graph.filter.keyword')}</span>
              <Input
                value={filters.keyword ?? ''}
                onChange={(e) => update({ keyword: e.target.value || undefined })}
                placeholder={t('blog.seo.focusKeyword')}
              />
            </label>
            <label className="kg-filter kg-filter--toggle">
              <Toggle
                checked={Boolean(filters.broken)}
                onChange={(v) => update({ broken: v || undefined })}
                label={t('blog.graph.filter.broken')}
                data-testid="kg-broken"
              />
              <span>{t('blog.graph.filter.broken')}</span>
            </label>
            <label className="kg-filter kg-filter--toggle">
              <Toggle
                checked={Boolean(filters.suggested)}
                onChange={(v) => update({ suggested: v || undefined })}
                label={t('blog.graph.filter.suggested')}
                data-testid="kg-suggested"
              />
              <span>{t('blog.graph.filter.suggested')}</span>
            </label>
            {filters.focus && (
              <Badge tone="accent" className="kg-focus-chip">
                {t('blog.graph.focused')}{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => update({ focus: undefined })}
                  aria-label={t('blog.graph.clearFocus')}
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
        </details>
      </section>

      <div className={`kg-layout${selected && data ? ' kg-layout--inspecting' : ''}${graphExpanded ? ' kg-layout--expanded' : ''}`}>
        <div className="kg-canvas card" data-testid="kg-canvas" aria-busy={loading}>
          {error ? (
            <ErrorState description={error} retry={load} />
          ) : data && data.nodes.length === 0 && !loading ? (
            <EmptyState
              title={t('blog.graph.empty.title')}
              description={isDefaultFilters(filters) ? t('blog.graph.empty.noContent') : t('blog.graph.empty.filtered')}
              action={
                !isDefaultFilters(filters) ? (
                  <Button size="sm" variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true, preventScrollReset: true })}>
                    {t('blog.graph.reset')}
                  </Button>
                ) : (
                  <Link className="btn btn--secondary btn--sm" to="/admin/blog/posts/new">
                    {t('blog.admin.newPost')}
                  </Link>
                )
              }
              testId="kg-empty"
            />
          ) : data ? (
            <ReactFlowProvider>
              <Canvas
                data={data}
                selectedId={selected}
                onSelect={select}
                search={search}
                expanded={graphExpanded}
                onToggleExpanded={() => setGraphExpanded((value) => !value)}
              />
            </ReactFlowProvider>
          ) : (
            <p className="row kg-loading" style={{ gap: 8 }}>
              <Spinner /> <span className="muted small">{t('blog.graph.loading')}</span>
            </p>
          )}
          {data && (
            <div className="kg-summary" data-testid="kg-meta" aria-label={t('blog.graph.summary')}>
              <dl>
                <div>
                  <dt>{t('blog.graph.metric.nodes')}</dt>
                  <dd>{formatCount(data.meta.nodes)}</dd>
                </div>
                <div>
                  <dt>{t('blog.graph.metric.edges')}</dt>
                  <dd>{formatCount(data.meta.edges)}</dd>
                </div>
                <div>
                  <dt>{t('blog.graph.metric.orphans')}</dt>
                  <dd>{formatCount(data.meta.counts.orphans)}</dd>
                </div>
                <div>
                  <dt>{t('blog.graph.metric.broken')}</dt>
                  <dd>{formatCount(data.meta.counts.broken)}</dd>
                </div>
                <div>
                  <dt>{t('blog.graph.metric.suggestions')}</dt>
                  <dd>{formatCount(data.meta.counts.suggestions)}</dd>
                </div>
              </dl>
              <p className="kg-summary__updated">
                {t('blog.graph.metric.updated', { when: formatDateTime(data.meta.generatedAt) })}
              </p>
            </div>
          )}
          {data?.meta.truncated && (
            <Alert kind="warning" title={t('blog.graph.truncated.title')}>
              {t('blog.graph.truncated.body', { limit: formatCount(data.meta.limit) })}
            </Alert>
          )}
          {data && <Legend />}
        </div>
        {selected && data && (
          <NodeDetails
            key={selected}
            id={selected}
            nodes={data.nodes}
            canManage={canManage}
            onChanged={load}
            onFocus={focusNode}
            onClose={() => select(null)}
          />
        )}
      </div>
    </div>
  );
}
