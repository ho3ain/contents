import { useState, type ReactNode } from 'react';
import { Modal } from '../Modal';
import { Alert } from './Alert';
import { Button } from './Button';
import { Textarea } from './Input';
import { Field } from './Input';
import { useI18n } from '../../i18n';

/**
 * Confirmation dialog for consequential actions (Phase 10.6): suspend,
 * refund, reject, unpublish, account status changes…
 *
 * Communicates action + consequence + affected object, supports an
 * optional required reason, prevents double-confirm while pending and
 * surfaces failures inline — replacing every window.confirm/prompt.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  reasonRequired = false,
  reasonOptional = false,
  reasonLabel,
  reasonPlaceholder,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Renders the confirm button in the danger style. */
  destructive?: boolean;
  /** When true, confirmation stays disabled until a reason is entered. */
  reasonRequired?: boolean;
  reasonOptional?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const reasonEnabled = reasonRequired || reasonOptional;
  const canConfirm = !reasonRequired || reason.trim().length >= 3;

  const handleConfirm = async () => {
    setFailure(null);
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      setSubmitting(false);
      onClose();
    } catch (error) {
      // Keep the dialog open so the user can retry or cancel.
      setSubmitting(false);
      setFailure(
        error instanceof Error ? error.message : t('errors.generic'),
      );
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setFailure(null);
    setReason('');
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={submitting}>
            {cancelLabel ?? t('actions.cancel')}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={() => void handleConfirm()}
            loading={submitting}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p className="muted" style={{ marginTop: 0 }}>{description}</p>}
      {reasonEnabled && (
        <Field
          label={reasonLabel ?? t('forms.reasonLabel')}
          hint={reasonRequired ? t('forms.reasonRequiredHint') : t('forms.reasonOptionalHint')}
          error={
            reasonRequired && reason.length > 0 && reason.trim().length < 3
              ? t('forms.reasonTooShort')
              : undefined
          }
        >
          <Textarea
            rows={3}
            value={reason}
            placeholder={reasonPlaceholder}
            onChange={(event) => setReason(event.target.value)}
            disabled={submitting}
          />
        </Field>
      )}
      {failure && <Alert kind="error" title={t('errors.actionFailed')}>{failure}</Alert>}
    </Modal>
  );
}
