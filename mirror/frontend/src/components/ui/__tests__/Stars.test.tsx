import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Stars } from '../../Stars';
import { ThemeProvider } from '../../../theme';

describe('Stars', () => {
  it('exposes an accessible rating label', () => {
    render(
      <ThemeProvider>
        <Stars value={4} count={12} />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('۴ از ۵')).toBeInTheDocument();
  });

  it('renders the review count when provided', () => {
    render(
      <ThemeProvider>
        <Stars value={3} count={5} />
      </ThemeProvider>,
    );
    expect(screen.getByText('(۵)')).toBeInTheDocument();
  });

  it('shows a placeholder when there are no reviews', () => {
    render(
      <ThemeProvider>
        <Stars value={null} />
      </ThemeProvider>,
    );
    expect(screen.getByText('هنوز نظری ثبت نشده')).toBeInTheDocument();
  });
});
