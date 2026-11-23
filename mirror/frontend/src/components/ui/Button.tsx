import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant =
  | 'primary'
  | 'ink'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  /**
   * Pending state for async actions (Phase 10.7): disables the control,
   * shows a spinner and preserves the label width so the layout does
   * not shift. Duplicate submission is impossible while pending.
   */
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  leftIcon,
  rightIcon,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const cls = ['btn', `btn--${variant}`];
  if (size !== 'md') cls.push(`btn--${size}`);
  if (block) cls.push('btn--block');
  if (loading) cls.push('btn--loading');
  if (className) cls.push(cls.join(' ') === className ? '' : className);
  return (
    <button
      className={cls.filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner size={size === 'sm' ? 13 : 15} />}
      {!loading && leftIcon}
      {children != null && <span>{children}</span>}
      {!loading && rightIcon}
    </button>
  );
}

export function TextButton(props: ButtonProps) {
  return <Button variant="ghost" {...props} />;
}

export function PrimaryTextButton(props: ButtonProps) {
  return <Button variant="primary" {...props} />;
}

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  /** Accessible name — icon-only controls must always have one. */
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function IconButton({
  icon,
  label,
  size = 'sm',
  variant = 'ghost',
  className,
  ...rest
}: IconButtonProps) {
  const cls = ['btn', `btn--${variant}`, 'btn--icon'];
  if (size !== 'md') cls.push(`btn--${size}`);
  if (className) cls.push(className);
  return (
    <button className={cls.join(' ')} aria-label={label} {...rest}>
      {icon}
    </button>
  );
}
