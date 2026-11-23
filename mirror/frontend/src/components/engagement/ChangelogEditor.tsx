/**
 * Gap closure (P8) — the release-notes editor, shared by the creator
 * (wizard review step) and the admin (per version). Not a <form>: it can
 * live inside the wizard's form, so saving is an explicit button.
 *
 * The server owns the rules (limits, where the notes go, the lock after
 * publish); the client mirrors the limits only to give instant feedback.
 */
import { useId, useState } from 'react';
import type { AgentChangelog } from '../../api/types';
import { CHANGELOG_LIMITS } from '../../api/types';
import {
  CHANGELOG_SECTIONS,
  changelogErrors,
  changelogToForm,
  formToChangelog,
  type ChangelogForm,
} from '../../lib/changelog';
import { errorMessage } from '../../lib/error';
import { formatCount } from '../../lib/format';
import { Alert, Button } from '../ui';
import { useToast } from '../Toast';
import { t } from '../../i18n';

export function ChangelogEditor({
  initial,
  onSave,
  locked = false,
  lockedHint,
  hint,
  testId = 'changelog-editor',
}: {
  initial: AgentChangelog | null | undefined;
  onSave: (changelog: AgentChangelog) => Promise<unknown>;
  /** Read-only (published version, creator side). */
  locked?: boolean;
  lockedHint?: string;
  hint?: string;
  testId?: string;
}) {
  const toast = useToast();
  const baseId = useId();
  const [form, setForm] = useState<ChangelogForm>(() => changelogToForm(initial));
  const [saved, setSaved] = useState<ChangelogForm>(() => changelogToForm(initial));
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const errors = changelogErrors(form);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const save = async () => {
    if (hasErrors || !dirty || locked) return;
    setBusy(true);
    setServerError(null);
    try {
      await onSave(formToChangelog(form));
      setSaved(form);
      toast.success(t('changelog.editor.saved'));
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof ChangelogForm, label: string, rows: number, help: string) => {
    const id = `${baseId}-${key}`;
    const error = errors[key];
    return (
      <div className="field" key={key}>
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <textarea
          id={id}
          className="textarea"
          rows={rows}
          value={form[key]}
          disabled={locked}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help${error ? ` ${id}-err` : ''}`}
          onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
          data-testid={`${testId}-${key}`}
        />
        <p className="field__hint" id={`${id}-help`}>
          {help}
        </p>
        {error && (
          <p className="field__error" id={`${id}-err`} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="changelog-editor" data-testid={testId} data-locked={locked || undefined}>
      {hint && <p className="small muted" style={{ marginTop: 0 }}>{hint}</p>}
      {locked && lockedHint && (
        <Alert kind="info" data-testid={`${testId}-locked`}>
          {lockedHint}
        </Alert>
      )}
      {field('whatsNew', t('changelog.whatsNew'), 3, t('changelog.editor.whatsNewHint', { max: formatCount(CHANGELOG_LIMITS.whatsNew) }))}
      {CHANGELOG_SECTIONS.map((section) =>
        field(section, t(`changelog.section.${section}`), 3, t('changelog.editor.linesHint', { max: formatCount(CHANGELOG_LIMITS[section]) })),
      )}
      {field('actionRequired', t('changelog.actionRequired'), 2, t('changelog.editor.actionRequiredHint', { max: formatCount(CHANGELOG_LIMITS.actionRequired) }))}
      {serverError && (
        <p className="field__error" role="alert" data-testid={`${testId}-error`}>
          {serverError}
        </p>
      )}
      {!locked && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={hasErrors || !dirty}
          onClick={() => void save()}
          data-testid={`${testId}-save`}
        >
          {t('changelog.editor.save')}
        </Button>
      )}
    </div>
  );
}
