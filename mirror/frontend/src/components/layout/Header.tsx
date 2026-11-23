import type { ReactNode } from 'react';
import { AppIcon, type IconName } from '../ui/AppIcon';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Reusable page-level header with title, optional description, icon, and action slot.
 * Uses logical CSS properties for correct RTL/LTR rendering.
 */
export function PageHeader({ title, description, icon, actions, children }: PageHeaderProps) {
  return (
    <div className="page-header row row--between row--wrap">
      <div className="page-header__text">
        <h1 className="page-header__title">
          {icon && (
            <span className="page-header__icon" aria-hidden="true">
              <AppIcon name={icon} size="md" />
            </span>
          )}
          {title}
        </h1>
        {description != null && <p className="page-header__desc">{description}</p>}
        {children}
      </div>
      {actions != null && <div className="row page-header__actions">{actions}</div>}
    </div>
  );
}