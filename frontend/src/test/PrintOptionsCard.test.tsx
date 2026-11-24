import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrintOptionsCard, type PrintOptions } from '../components/PrintOptionsCard';
import '../lib/i18n';

describe('PrintOptionsCard Component', () => {
  const defaultOptions: PrintOptions = {
    copies: 1,
    color_mode: 'mono',
    sides_mode: 'simplex',
    paper_size: 'A4',
    page_range: 'all',
  };

  it('renders copies counter and default options', () => {
    const handleChange = vi.fn();
    render(<PrintOptionsCard options={defaultOptions} onChange={handleChange} />);

    expect(screen.getByDisplayValue('1')).toBeInTheDocument();
    expect(screen.getByText(/A4/i)).toBeInTheDocument();
  });

  it('handles copies increment and decrement', () => {
    const handleChange = vi.fn();
    render(<PrintOptionsCard options={defaultOptions} onChange={handleChange} />);

    const incBtn = screen.getByRole('button', { name: /increase copies/i });
    fireEvent.click(incBtn);

    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ copies: 2 }));
  });

  it('allows toggling between simplex and duplex', () => {
    const handleChange = vi.fn();
    render(<PrintOptionsCard options={defaultOptions} onChange={handleChange} />);

    const duplexBtn = screen.getByRole('button', { name: /duplex/i });
    fireEvent.click(duplexBtn);

    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ sides_mode: 'duplex' }));
  });

  it('allows toggling between mono and color', () => {
    const handleChange = vi.fn();
    render(<PrintOptionsCard options={defaultOptions} onChange={handleChange} />);

    const colorBtn = screen.getByRole('button', { name: /color print/i });
    fireEvent.click(colorBtn);

    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({ color_mode: 'color' }));
  });
});
