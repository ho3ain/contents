import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  const cls = ['input'];
  if (className) cls.push(className);
  return (
    <input
      ref={ref}
      className={cls.join(' ')}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    const cls = ['textarea'];
    if (className) cls.push(className);
    return <textarea ref={ref} className={cls.join(' ')} {...rest} />;
  },
);

export function SearchField(props: InputProps) {
  return <Input className="input--search" {...props} />;
}

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, htmlFor, children }: FieldProps) {
  return (
    <div className="field">
      {label != null && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {/* Deterministic id so inputs can reference the message via
          aria-describedby={`${htmlFor}-msg`} (a11y, Creator Foundation). */}
      {error != null ? (
        <span className="field__error" id={htmlFor ? `${htmlFor}-msg` : undefined}>
          {error}
        </span>
      ) : (
        hint != null && (
          <span className="field__hint" id={htmlFor ? `${htmlFor}-msg` : undefined}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}
