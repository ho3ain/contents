import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
  testId,
  headingLevel = 3,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Heading rank so the page outline stays in order (h1 → h2 on landing pages). */
  headingLevel?: 1 | 2 | 3;
  /** Names THIS empty state. A page can render several with different copy
   *  and different actions, so tests need to address them apart. */
  testId?: string;
}) {
  const Heading = headingLevel === 1 ? 'h1' : headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="empty-state" data-testid={testId}>
      <Heading>{title}</Heading>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
