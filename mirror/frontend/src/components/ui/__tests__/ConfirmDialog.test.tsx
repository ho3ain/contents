import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../ConfirmDialog';
import { I18nProvider } from '../../../i18n';

function renderDialog(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue(undefined);
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <I18nProvider>
      <ConfirmDialog
        open
        title="تعلیق لیستینگ"
        description="این لیستینگ تعلیق می‌شود."
        confirmLabel="تعلیق"
        onConfirm={onConfirm}
        onClose={onClose}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...utils, onConfirm, onClose };
}

describe('ConfirmDialog', () => {
  it('renders title, description and actions', () => {
    renderDialog();
    expect(screen.getByText('تعلیق لیستینگ')).toBeInTheDocument();
    expect(screen.getByText('این لیستینگ تعلیق می‌شود.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تعلیق' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeInTheDocument();
  });

  it('keeps confirm disabled until a reason of 3+ chars is entered when reasonRequired', () => {
    renderDialog({ reasonRequired: true, reasonLabel: 'دلیل' });
    const confirm = screen.getByRole('button', { name: 'تعلیق' });
    expect(confirm).toBeDisabled();

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'ab' } });
    expect(confirm).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'نقض سیاست محتوا' } });
    expect(confirm).not.toBeDisabled();
  });

  it('calls onConfirm with the trimmed reason and closes on success', async () => {
    const { onConfirm, onClose } = renderDialog({ reasonRequired: true, reasonLabel: 'دلیل' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  گزارش معتبر  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'تعلیق' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('گزارش معتبر'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows a pending (aria-busy) state and blocks double-confirm', async () => {
    let resolveFn: () => void = () => {};
    const onConfirm = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveFn = resolve; }),
    );
    renderDialog({ onConfirm });
    const confirm = screen.getByRole('button', { name: 'تعلیق' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(confirm).toBeDisabled();

    resolveFn();
    await waitFor(() => expect(confirm).not.toHaveAttribute('aria-busy', 'true'));
  });

  it('surfaces an inline failure and stays open when onConfirm rejects', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('شبکه قطع است'));
    const { onClose } = renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: 'تعلیق' }));

    await waitFor(() => expect(screen.getByText('شبکه قطع است')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    // retry is possible
    fireEvent.click(screen.getByRole('button', { name: 'تعلیق' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });

  it('cancel invokes onClose without confirming', () => {
    const { onConfirm, onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
