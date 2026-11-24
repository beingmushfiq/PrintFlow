import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuoteBreakdownCard, type QuoteBreakdownData } from '../components/QuoteBreakdownCard';
import '../lib/i18n';

describe('QuoteBreakdownCard Component', () => {
  const mockQuote: QuoteBreakdownData = {
    total_sheets: 5,
    total_sides: 9,
    subtotal_minor: 1640,
    tax_minor: 82,
    fee_minor: 0,
    discount_minor: 160,
    total_minor: 1722,
    line_items: [
      {
        type: 'duplex_front_side',
        description: 'Duplex Front Sides',
        quantity: 4,
        unitRatePoisha: 200,
        totalPoisha: 800,
      },
      {
        type: 'duplex_back_side',
        description: 'Duplex Back Sides',
        quantity: 4,
        unitRatePoisha: 160,
        totalPoisha: 640,
      },
      {
        type: 'odd_page_simplex',
        description: 'Odd Page Simplex',
        quantity: 1,
        unitRatePoisha: 200,
        totalPoisha: 200,
      },
    ],
  };

  it('renders total sheets and sides metrics', () => {
    render(<QuoteBreakdownCard quote={mockQuote} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('renders itemized line items with front, back, and odd page', () => {
    render(<QuoteBreakdownCard quote={mockQuote} />);

    expect(screen.getByText('Duplex Front Sides')).toBeInTheDocument();
    expect(screen.getByText('Duplex Back Sides')).toBeInTheDocument();
    expect(screen.getByText('Odd Page Simplex')).toBeInTheDocument();
  });

  it('renders grand total with BDT symbol', () => {
    render(<QuoteBreakdownCard quote={mockQuote} />);

    // Shows 17.22 in English and Bangla numerals
    expect(screen.getByText('৳ 17.22')).toBeInTheDocument();
  });
});
