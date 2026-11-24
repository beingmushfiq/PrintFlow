import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from '../components/common/Logo';

describe('Logo Component', () => {
  it('renders full variant with mark and wordmark by default', () => {
    render(<Logo />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText(/Print/i)).toBeInTheDocument();
    expect(screen.getByText(/Flow/i)).toBeInTheDocument();
  });

  it('renders mark only variant', () => {
    render(<Logo variant="mark" />);
    expect(screen.getByRole('img', { name: /PrintFlow Logo Mark/i })).toBeInTheDocument();
    expect(screen.queryByText(/Print/i)).not.toBeInTheDocument();
  });

  it('renders wordmark variant without mark', () => {
    render(<Logo variant="wordmark" />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText(/Print/i)).toBeInTheDocument();
    expect(screen.getByText(/Flow/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders with tagline when requested', () => {
    render(<Logo showTagline={true} />);
    expect(screen.getByText(/Autonomous Walk-in Print Shop Automation|Autonomous Print Ops/i)).toBeInTheDocument();
  });

  it('applies custom sizing correctly', () => {
    const { container } = render(<Logo size="xl" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '64');
    expect(container.querySelector('svg')).toHaveAttribute('height', '64');
  });
});
