import { t } from '../../i18n';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BLOG_COMMENT_MAX_LENGTH,
  BLOG_COMMENT_MIN_LENGTH,
  BLOG_COMMENT_REPORT_REASONS,
  BLOG_COMMENT_SORTS,
  blogEngagementApi,
  type BlogCommentReportReason,
  type BlogCommentSort,
  type BlogEngagementMe,
  type BlogEngagementSummary,
  type PublicBlogComment,
} from '../../api/blog';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { AppIcon } from '../../components/ui/AppIcon';
import { errorMessage } from '../../lib/error';
import { AuthorAvatar, faDate, faNum, faRating, faRelative } from './blogShared';

/**
 * Reader engagement on an article (2026-10-14): star rating + threaded
 * comments. Public aggregates and the thread are anonymous reads; the
 * reader's own state (`me`) is a separate authenticated request so the
 * public payloads stay cacheable. Writes need a signed-in account — guests
 * see one clear sign-in call to action, never a disabled form.
 *
 * Persian copy lives inline like the rest of the public blog
 * (docs/blog/MESH_Blog_Decisions_FA.md).
 */

// ---- helpers ---------------------------------------------------------------

const SORT_LABELS: Record<BlogCommentSort, string> = { newest: 'blog.reader.latest', oldest: 'blog.reader.oldest', top: 'blog.reader.mostPopular' };
const REASON_LABELS: Record<BlogCommentReportReason, string> = {
  spam: 'blog.reader.spamOrAdvertising',
  abuse: 'blog.reader.abuseOrHarassment',
  off_topic: 'blog.reader.unrelatedToTheArticle',
  other: 'blog.reader.other',
};
const BADGE_LABELS = { author: 'blog.reader.author', staff: 'blog.reader.meshTeam' } as const;
const STAR_WORDS = ['', 'blog.reader.poor', 'blog.reader.fair', 'blog.reader.good', 'blog.reader.veryGood', 'blog.reader.excellent'] as const;

function isBlocked(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    typeof error.details === 'object' &&
    error.details !== null &&
    (error.details as { reason?: string }).reason === 'COMMENTS_BLOCKED'
  );
}

// ---- rating ----------------------------------------------------------------

export function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="blog-stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => (
        <AppIcon
          key={star}
          name="star"
          size={size}
          filled={star <= Math.round(value)}
          strokeWidth={star <= Math.round(value) ? 1.5 : 2}
          className={star <= Math.round(value) ? 'on' : ''}
        />
      ))}
    </span>
  );
}

export function BlogRatingWidget({
  slug,
  summary,
  me,
  onSummary,
  onMe,
}: {
  slug: string;
  summary: BlogEngagementSummary;
  me: BlogEngagementMe | null;
  onSummary: (summary: BlogEngagementSummary) => void;
  onMe: (patch: Partial<BlogEngagementMe>) => void;
}) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const mine = me?.myRating ?? null;
  const shown = hover || mine || 0;
  const { average, count, distribution } = summary.rating;
  const max = Math.max(1, ...Object.values(distribution));

  const rate = async (value: number) => {
    if (busy) return;
    setBusy(true);
    try {
      if (mine === value) {
        const next = await blogEngagementApi.unrate(slug);
        onSummary(next);
        onMe({ myRating: null });
        toast.info(t('blog.reader.yourRatingWasRemoved'));
      } else {
        const next = await blogEngagementApi.rate(slug, value);
        onSummary({ rating: next.rating, commentCount: next.commentCount });
        onMe({ myRating: next.myRating });
        toast.success(mine ? t('blog.reader.yourRatingWasUpdated') : t('blog.reader.thankYouYourRatingWasSaved'));
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="blog-rating" id="rating" aria-labelledby="blog-rating-h" data-testid="blog-rating">
      <div className="blog-rating__score">
        <b data-testid="blog-rating-average">{count ? faRating(average) : '—'}</b>
        <StarRow value={count ? average : 0} size={16} />
        <small>{count ? t('blog.reader.ratingCount', { n: faNum(count) }) : t('blog.reader.noRatingsYet')}</small>
      </div>
      <div className="blog-rating__main">
        <h2 id="blog-rating-h">{t('blog.reader.howUsefulWasThisArticle')}</h2>
        {isAuthenticated ? (
          <>
            <div className="blog-rating__input" role="radiogroup" aria-label={t('blog.reader.yourRatingForThisArticle')} onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={mine === star}
                  aria-label={t('blog.reader.starLabel', { n: faNum(star), name: t(STAR_WORDS[star]) })}
                  className={star <= shown ? 'on' : ''}
                  disabled={busy}
                  onMouseEnter={() => setHover(star)}
                  onFocus={() => setHover(star)}
                  onBlur={() => setHover(0)}
                  onClick={() => void rate(star)}
                  data-testid={`blog-rating-star-${star}`}
                >
                  <AppIcon name="star" size={28} filled={star <= shown} strokeWidth={star <= shown ? 1.5 : 1.75} />
                </button>
              ))}
              <span className="blog-rating__hint" aria-live="polite">
                {shown ? t(STAR_WORDS[shown]) : mine ? '' : t('blog.reader.selectAStar')}
              </span>
            </div>
            {mine ? (
              <small className="blog-rating__mine" data-testid="blog-rating-mine">
                {t('blog.reader.yourRating')}{faNum(mine)} {t('blog.reader.outOf5SelectTheSameStar')}</small>
            ) : null}
          </>
        ) : (
          <p className="blog-engagement-cta" data-testid="blog-rating-login">
            {t('blog.reader.toRateThisArticle')}{' '}
            <Link to="/login" state={{ from: `${location.pathname}#rating` }}>
              {t('blog.reader.signInToYourAccount')}</Link>
            .
          </p>
        )}
      </div>
      <dl className="blog-rating__bars" aria-label={t('blog.reader.ratingDistribution')}>
        {[5, 4, 3, 2, 1].map((star) => {
          const n = distribution[String(star) as keyof typeof distribution] ?? 0;
          return (
            <div key={star}>
              <dt>{faNum(star)}</dt>
              <dd>
                <span style={{ width: `${Math.round((n / max) * 100)}%` }} />
              </dd>
              <dd className="blog-rating__n">{faNum(n)}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

// ---- comments --------------------------------------------------------------

function CommentForm({
  onSubmit,
  placeholder,
  submitLabel,
  initial = '',
  autoFocus = false,
  onCancel,
  compact = false,
  testId,
}: {
  onSubmit: (body: string) => Promise<void>;
  placeholder: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  compact?: boolean;
  testId: string;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const trimmed = body.trim();
  const tooShort = trimmed.length < BLOG_COMMENT_MIN_LENGTH;
  const tooLong = trimmed.length > BLOG_COMMENT_MAX_LENGTH;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (tooShort || tooLong || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setBody(initial ? trimmed : '');
    } catch {
      /* the owner already surfaced the failure (toast / blocked state); the draft stays for a retry */
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={`blog-comment-form${compact ? ' blog-comment-form--compact' : ''}`}
      onSubmit={(e) => void submit(e)}
      data-testid={testId}
    >
      <label className="sr-only" htmlFor={`${testId}-body`}>
        {placeholder}
      </label>
      <textarea
        id={`${testId}-body`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={compact ? 2 : 4}
        maxLength={BLOG_COMMENT_MAX_LENGTH + 200}
        autoFocus={autoFocus}
        aria-invalid={tooLong || undefined}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void submit(e);
          if (e.key === 'Escape' && onCancel) onCancel();
        }}
      />
      <div className="blog-comment-form__foot">
        <small className={tooLong ? 'over' : ''} aria-live="polite">
          {faNum(trimmed.length)} / {faNum(BLOG_COMMENT_MAX_LENGTH)}
        </small>
        <span className="blog-comment-form__actions">
          {onCancel && (
            <button type="button" className="blog-btn blog-btn--ghost" onClick={onCancel}>
              {t('blog.reader.cancel')}</button>
          )}
          <button
            type="submit"
            className="blog-btn blog-btn--primary"
            disabled={tooShort || tooLong || busy}
            data-testid={`${testId}-submit`}
          >
            {busy ? t('blog.reader.submitting') : submitLabel}
          </button>
        </span>
      </div>
    </form>
  );
}

function ReportDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: BlogCommentReportReason, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<BlogCommentReportReason>('spam');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(reason, note.trim());
      setNote('');
      setReason('spam');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      title={t('blog.reader.reportComment')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {t('blog.reader.cancel')}</button>
          <button type="button" className="btn btn--primary" onClick={() => void submit()} disabled={busy} data-testid="blog-report-submit">
            {busy ? t('blog.reader.submitting') : t('blog.reader.submitReport')}
          </button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        {t('blog.reader.yourReportIsConfidentialAndWillBe')}</p>
      <fieldset className="blog-report-reasons">
        <legend className="sr-only">{t('blog.reader.reportReason')}</legend>
        {BLOG_COMMENT_REPORT_REASONS.map((r) => (
          <label key={r}>
            <input type="radio" name="blog-report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
            <span>{t(REASON_LABELS[r])}</span>
          </label>
        ))}
      </fieldset>
      <label className="small" htmlFor="blog-report-note" style={{ display: 'block', marginTop: 12 }}>
        {t('blog.reader.detailsOptional')}</label>
      <textarea
        id="blog-report-note"
        className="input"
        rows={3}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        style={{ width: '100%' }}
      />
    </Modal>
  );
}

interface CommentItemProps {
  comment: PublicBlogComment;
  me: BlogEngagementMe | null;
  depth: 0 | 1;
  onReply: (parentId: string, body: string) => Promise<void>;
  onEdit: (id: string, body: string) => Promise<void>;
  onWithdraw: (id: string) => void;
  onLike: (id: string, liked: boolean) => Promise<void>;
  onReport: (id: string) => void;
  highlighted: boolean;
}

function CommentItem({ comment, me, depth, onReply, onEdit, onWithdraw, onLike, onReport, highlighted }: CommentItemProps) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const mine = me?.myCommentIds.includes(comment.id) ?? false;
  const liked = me?.likedCommentIds.includes(comment.id) ?? false;
  const reported = me?.reportedCommentIds.includes(comment.id) ?? false;
  const live = comment.status === 'published';

  const like = async () => {
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      await onLike(comment.id, !liked);
    } finally {
      setLikeBusy(false);
    }
  };

  return (
    <li
      className={`blog-comment${depth ? ' blog-comment--reply' : ''}${highlighted ? ' blog-comment--highlight' : ''}`}
      id={`comment-${comment.id}`}
      data-testid="blog-comment"
      data-comment-id={comment.id}
    >
      {live ? (
        <article aria-label={t('blog.reader.commentLabel', { name: comment.author?.name ?? '' })}>
          <header className="blog-comment__head">
            <AuthorAvatar author={comment.author} size={depth ? 28 : 34} />
            <div className="blog-comment__who">
              <b>
                {comment.author?.name ?? t('blog.reader.meshReader')}
                {comment.author?.badge && (
                  <span className={`blog-comment__badge blog-comment__badge--${comment.author.badge}`}>
                    {t(BADGE_LABELS[comment.author.badge])}
                  </span>
                )}
                {mine && <span className="blog-comment__badge blog-comment__badge--me">{t('blog.reader.you')}</span>}
              </b>
              <small>
                <time dateTime={comment.createdAt} title={faDate(comment.createdAt)}>
                  {faRelative(comment.createdAt)}
                </time>
                {comment.editedAt && <span title={faDate(comment.editedAt)}> {t('blog.reader.edited')}</span>}
              </small>
            </div>
          </header>
          {editing ? (
            <CommentForm
              initial={comment.body}
              placeholder={t('blog.reader.editComment')}
              submitLabel={t('blog.reader.save')}
              autoFocus
              compact
              onCancel={() => setEditing(false)}
              onSubmit={async (body) => {
                await onEdit(comment.id, body);
                setEditing(false);
              }}
              testId={`blog-comment-edit-${comment.id}`}
            />
          ) : (
            <p className="blog-comment__body" data-testid="blog-comment-body">
              {comment.body}
            </p>
          )}
          <footer className="blog-comment__actions">
            <button
              type="button"
              className={`blog-comment__action${liked ? ' is-on' : ''}`}
              aria-pressed={liked}
              aria-label={t('blog.reader.likesLabel', { name: liked ? t('blog.reader.unlike') : t('blog.reader.like'), n: faNum(comment.likeCount) })}
              disabled={likeBusy}
              onClick={() => {
                if (!isAuthenticated) return;
                void like();
              }}
              {...(!isAuthenticated ? { title: t('blog.reader.signInToLike') } : {})}
              data-testid="blog-comment-like"
            >
              <AppIcon name="thumbsUp" size="xs" filled={liked} />
              <span>{faNum(comment.likeCount)}</span>
            </button>
            {depth === 0 && (
              <button
                type="button"
                className="blog-comment__action"
                onClick={() => setReplying((v) => !v)}
                aria-expanded={replying}
                data-testid="blog-comment-reply"
              >
                <AppIcon name="reply" size="xs" />
                <span>{t('blog.reader.reply')}</span>
              </button>
            )}
            {mine && (
              <>
                <button
                  type="button"
                  className="blog-comment__action"
                  onClick={() => setEditing((v) => !v)}
                  data-testid="blog-comment-edit"
                >
                  <AppIcon name="edit" size="xs" />
                  <span>{t('blog.reader.edit')}</span>
                </button>
                <button
                  type="button"
                  className="blog-comment__action blog-comment__action--danger"
                  onClick={() => onWithdraw(comment.id)}
                  data-testid="blog-comment-delete"
                >
                  <AppIcon name="trash" size="xs" />
                  <span>{t('blog.reader.delete')}</span>
                </button>
              </>
            )}
            {isAuthenticated && !mine && (
              <button
                type="button"
                className="blog-comment__action"
                onClick={() => onReport(comment.id)}
                disabled={reported}
                title={reported ? t('blog.reader.yourReportHasBeenSubmitted') : undefined}
                data-testid="blog-comment-report"
              >
                <AppIcon name="flag" size="xs" />
                <span>{reported ? t('blog.reader.reported') : t('blog.reader.report')}</span>
              </button>
            )}
          </footer>
          {replying && (
            <div className="blog-comment__replybox">
              {isAuthenticated ? (
                me && !me.canComment ? (
                  <p className="blog-engagement-note">{t('blog.reader.commentingIsNotEnabledForYourAccount')}</p>
                ) : (
                  <CommentForm
                    placeholder={t('blog.reader.replyTo', { name: comment.author?.name ?? t('blog.reader.thisComment') })}
                    submitLabel={t('blog.reader.postReply')}
                    autoFocus
                    compact
                    onCancel={() => setReplying(false)}
                    onSubmit={async (body) => {
                      await onReply(comment.id, body);
                      setReplying(false);
                    }}
                    testId={`blog-reply-form-${comment.id}`}
                  />
                )
              ) : (
                <p className="blog-engagement-cta">
                  {t('blog.reader.toReply')}{' '}
                  <Link to="/login" state={{ from: `${location.pathname}#comment-${comment.id}` }}>
                    {t('blog.reader.signIn')}</Link>
                  .
                </p>
              )}
            </div>
          )}
        </article>
      ) : (
        <p className="blog-comment__placeholder" data-testid="blog-comment-placeholder">
          {comment.status === 'removed' ? t('blog.reader.thisCommentWasRemovedByTheEditorial') : t('blog.reader.thisCommentWasWithdrawnByItsAuthor')}
        </p>
      )}
      {comment.replies.length > 0 && (
        <ul className="blog-comment__replies" aria-label={t('blog.reader.replies')}>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              me={me}
              depth={1}
              onReply={onReply}
              onEdit={onEdit}
              onWithdraw={onWithdraw}
              onLike={onLike}
              onReport={onReport}
              highlighted={false}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function BlogComments({
  slug,
  me,
  onMe,
  onCount,
  initialCount,
}: {
  slug: string;
  me: BlogEngagementMe | null;
  onMe: (patch: Partial<BlogEngagementMe>) => void;
  onCount: (delta: number) => void;
  initialCount: number;
}) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [sort, setSort] = useState<BlogCommentSort>('newest');
  const [items, setItems] = useState<PublicBlogComment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // The first page is "loading" until a result (or failure) for the current
  // slug+sort arrived — derived at render time, no setState inside the effect.
  const listKey = `${slug}|${sort}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const loading = loadedKey !== listKey;
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const highlight = location.hash.startsWith('#comment-') ? location.hash.slice('#comment-'.length) : null;
  const scrolledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await blogEngagementApi.comments(slug, { sort, page: 1 });
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.meta.total);
        setPage(res.meta.page);
        setTotalPages(res.meta.totalPages);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoadedKey(listKey);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [slug, sort, listKey, reloadTick]);

  const retry = () => {
    setLoadedKey(null);
    setError(null);
    setReloadTick((t) => t + 1);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await blogEngagementApi.comments(slug, { sort, page: page + 1 });
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.meta.total);
      setPage(res.meta.page);
      setTotalPages(res.meta.totalPages);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  // Deep link from a notification: scroll the referenced comment into view once it is rendered.
  useEffect(() => {
    if (!highlight || scrolledRef.current || loading) return;
    const el = document.getElementById(`comment-${highlight}`);
    if (el) {
      scrolledRef.current = true;
      el.scrollIntoView({ block: 'center' });
    }
  }, [highlight, loading, items]);

  const canComment = isAuthenticated && !blocked && (me ? me.canComment : true);

  const replaceComment = (next: PublicBlogComment) =>
    setItems((prev) =>
      prev.map((c) =>
        c.id === next.id
          ? { ...next, replies: c.replies }
          : { ...c, replies: c.replies.map((r) => (r.id === next.id ? { ...next, replies: [] } : r)) },
      ),
    );

  const create = async (body: string, parentId?: string) => {
    try {
      const created = await blogEngagementApi.createComment(slug, body, parentId);
      if (parentId) {
        setItems((prev) =>
          prev.map((c) => (c.id === parentId ? { ...c, replyCount: c.replyCount + 1, replies: [...c.replies, created] } : c)),
        );
      } else {
        setItems((prev) => (sort === 'oldest' ? [...prev, created] : [created, ...prev]));
        setTotal((n) => n + 1);
      }
      onMe({ myCommentIds: [...(me?.myCommentIds ?? []), created.id] });
      onCount(1);
      toast.success(parentId ? t('blog.reader.yourReplyWasPublished') : t('blog.reader.yourCommentWasPublished'));
    } catch (error) {
      if (isBlocked(error)) {
        setBlocked(true);
        onMe({ canComment: false });
      }
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const edit = async (id: string, body: string) => {
    try {
      const updated = await blogEngagementApi.updateComment(id, body);
      replaceComment(updated);
      toast.success(t('blog.reader.commentUpdated'));
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  };

  const withdraw = async (id: string) => {
    await blogEngagementApi.withdrawComment(id);
    const root = items.find((c) => c.id === id);
    if (root && root.replies.length === 0) setTotal((n) => Math.max(0, n - 1));
    setItems((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target) {
        if (target.replies.length === 0) return prev.filter((c) => c.id !== id);
        return prev.map((c) => (c.id === id ? { ...c, status: 'hidden', body: '', author: null, likeCount: 0 } : c));
      }
      return prev.map((c) => ({
        ...c,
        replies: c.replies.filter((r) => r.id !== id),
        replyCount: c.replies.some((r) => r.id === id) ? Math.max(0, c.replyCount - 1) : c.replyCount,
      }));
    });
    onCount(-1);
    toast.info(t('blog.reader.commentRemoved'));
  };

  const like = async (id: string, next: boolean) => {
    const bump = (c: PublicBlogComment): PublicBlogComment =>
      c.id === id ? { ...c, likeCount: Math.max(0, c.likeCount + (next ? 1 : -1)) } : c;
    setItems((prev) => prev.map((c) => ({ ...bump(c), replies: c.replies.map(bump) })));
    onMe({ likedCommentIds: next ? [...(me?.likedCommentIds ?? []), id] : (me?.likedCommentIds ?? []).filter((x) => x !== id) });
    try {
      const res = next ? await blogEngagementApi.like(id) : await blogEngagementApi.unlike(id);
      const settle = (c: PublicBlogComment): PublicBlogComment => (c.id === id ? { ...c, likeCount: res.likeCount } : c);
      setItems((prev) => prev.map((c) => ({ ...settle(c), replies: c.replies.map(settle) })));
    } catch (error) {
      const undo = (c: PublicBlogComment): PublicBlogComment =>
        c.id === id ? { ...c, likeCount: Math.max(0, c.likeCount + (next ? -1 : 1)) } : c;
      setItems((prev) => prev.map((c) => ({ ...undo(c), replies: c.replies.map(undo) })));
      onMe({ likedCommentIds: next ? (me?.likedCommentIds ?? []).filter((x) => x !== id) : [...(me?.likedCommentIds ?? []), id] });
      toast.error(errorMessage(error));
    }
  };

  const report = async (reason: BlogCommentReportReason, note: string) => {
    if (!reportId) return;
    try {
      await blogEngagementApi.report(reportId, reason, note || undefined);
      onMe({ reportedCommentIds: [...(me?.reportedCommentIds ?? []), reportId] });
      toast.success(t('blog.reader.reportSubmittedForReviewByTheEditorial'));
      setReportId(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const count = Math.max(initialCount, 0);

  return (
    <section className="blog-comments" id="comments" aria-labelledby="blog-comments-h" data-testid="blog-comments">
      <div className="blog-comments__head">
        <h2 id="blog-comments-h">
          {t('blog.reader.comments123')}<span data-testid="blog-comments-count">({faNum(count)})</span>
        </h2>
        <label className="blog-comments__sort">
          <span>{t('blog.reader.sortBy124')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as BlogCommentSort)} data-testid="blog-comments-sort">
            {BLOG_COMMENT_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(SORT_LABELS[s])}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isAuthenticated ? (
        canComment ? (
          <CommentForm
            placeholder={t('blog.reader.shareYourThoughtsOnThisArticle')}
            submitLabel={t('blog.reader.postComment')}
            onSubmit={(body) => create(body)}
            testId="blog-comment-form"
          />
        ) : (
          <p className="blog-engagement-note" role="status" data-testid="blog-comments-blocked">
            {t('blog.reader.commentingIsNotEnabledForYourAccount127')}</p>
        )
      ) : (
        <p className="blog-engagement-cta" data-testid="blog-comments-login">
          {t('blog.reader.toLeaveAComment')}{' '}
          <Link to="/login" state={{ from: `${location.pathname}#comments` }}>
            {t('blog.reader.signInToYourAccount')}</Link>{' '}
          {t('blog.reader.or')}{' '}
          <Link to="/register" state={{ from: `${location.pathname}#comments` }}>
            {t('blog.reader.createAnAccount')}</Link>
          .
        </p>
      )}

      {loading ? (
        <ul className="blog-comments__list" aria-busy="true" aria-label={t('blog.reader.loadingComments')}>
          {[0, 1, 2].map((i) => (
            <li key={i} className="blog-comment blog-comment--skeleton" aria-hidden="true">
              <span />
              <span />
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="blog-engagement-note" role="alert">
          {t('blog.reader.unableToLoadComments')}{' '}
          <button type="button" className="blog-btn blog-btn--ghost" onClick={retry}>
            {t('blog.reader.tryAgain')}</button>
        </div>
      ) : items.length === 0 ? (
        <p className="blog-comments__empty" data-testid="blog-comments-empty">
          {t('blog.reader.noCommentsYetBeTheFirst')}</p>
      ) : (
        <>
          <ul className="blog-comments__list">
            {items.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                me={me}
                depth={0}
                onReply={(parentId, body) => create(body, parentId)}
                onEdit={edit}
                onWithdraw={setWithdrawId}
                onLike={like}
                onReport={setReportId}
                highlighted={highlight === comment.id || comment.replies.some((r) => r.id === highlight)}
              />
            ))}
          </ul>
          {page < totalPages && (
            <div className="blog-comments__more">
              <button
                type="button"
                className="blog-btn blog-btn--ghost"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                data-testid="blog-comments-more"
              >
                {loadingMore ? t('blog.reader.loading') : t('blog.reader.moreComments', { n: faNum(total - items.length) })}
              </button>
            </div>
          )}
        </>
      )}

      <ReportDialog open={reportId !== null} onClose={() => setReportId(null)} onSubmit={report} />
      <ConfirmDialog
        open={withdrawId !== null}
        title={t('blog.reader.deleteComment')}
        description={t('blog.reader.yourCommentWillBeRemovedFromThe')}
        confirmLabel={t('blog.reader.deleteComment')}
        cancelLabel={t('blog.reader.cancel')}
        destructive
        onConfirm={async () => {
          if (withdrawId) await withdraw(withdrawId);
        }}
        onClose={() => setWithdrawId(null)}
      />
    </section>
  );
}

// ---- section wrapper -------------------------------------------------------

export function ArticleEngagement({
  slug,
  initial,
  onSummary,
}: {
  slug: string;
  initial: { ratingAvg: number; ratingCount: number; commentCount: number };
  onSummary?: (summary: BlogEngagementSummary) => void;
}) {
  const { isAuthenticated } = useAuth();
  const [summary, setSummary] = useState<BlogEngagementSummary>({
    rating: { average: initial.ratingAvg, count: initial.ratingCount, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } },
    commentCount: initial.commentCount,
  });
  const [me, setMe] = useState<BlogEngagementMe | null>(null);

  useEffect(() => {
    let cancelled = false;
    void blogEngagementApi
      .summary(slug)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => {
        /* the article payload already carries the counters */
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void blogEngagementApi
      .me(slug)
      .then((m) => {
        if (!cancelled) setMe(m);
      })
      .catch(() => {
        if (!cancelled) setMe({ myRating: null, myCommentIds: [], likedCommentIds: [], reportedCommentIds: [], canComment: true });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, isAuthenticated]);

  useEffect(() => {
    onSummary?.(summary);
  }, [summary, onSummary]);

  const patchMe = useCallback((patch: Partial<BlogEngagementMe>) => {
    setMe((prev) => ({
      ...(prev ?? { myRating: null, myCommentIds: [], likedCommentIds: [], reportedCommentIds: [], canComment: true }),
      ...patch,
    }));
  }, []);

  // A signed-out visitor never sees stale personal state, whatever was fetched before.
  const effectiveMe = isAuthenticated ? me : null;

  return (
    <div className="blog-engagement" data-testid="blog-engagement">
      <BlogRatingWidget slug={slug} summary={summary} me={effectiveMe} onSummary={setSummary} onMe={patchMe} />
      <BlogComments
        slug={slug}
        me={effectiveMe}
        onMe={patchMe}
        initialCount={summary.commentCount}
        onCount={(delta) => setSummary((s) => ({ ...s, commentCount: Math.max(0, s.commentCount + delta) }))}
      />
    </div>
  );
}
