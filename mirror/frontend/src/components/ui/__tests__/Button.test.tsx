import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('renders children and applies the variant class', () => {
    render(<Button variant="primary">تأیید</Button>);
    const button = screen.getByRole('button', { name: 'تأیید' });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('btn--primary');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Button disabled>غیرفعال</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders as a block button when block is set', () => {
    render(<Button block>بلوک</Button>);
    expect(screen.getByRole('button').className).toContain('btn--block');
  });
});
