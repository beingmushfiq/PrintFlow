import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '../lib/i18n';
import { OrderStatusPage } from '../pages/customer/OrderStatusPage';

const mockApiRequest = vi.fn();

vi.mock('../lib/api', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

describe('OrderStatusPage localization and stage rendering', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({
      data: {
        reference: 'PF-GTTE-GKDS',
        status: 'paid',
        stages: ['SUBMITTED', 'UPLOADED', 'PAID', 'PRINTING', 'READY', 'COLLECTED'],
        current_stage: 2,
        shop_name: 'DCP',
        channel: 'order.test-token',
        currency: 'BDT',
        total_minor: 1000,
        total_bdt: '৳ ১০.০০',
        created_at: '2026-11-25T17:21:23Z',
        is_terminal: false,
      },
    });
  });

  it('renders localized English order tracking without raw i18n keys and toggles to Bengali', async () => {
    render(
      <MemoryRouter initialEntries={['/order/test-token']}>
        <Routes>
          <Route path="/order/:token" element={<OrderStatusPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Live Order Progress')).toBeInTheDocument();
    });

    expect(screen.getByText('Reference: PF-GTTE-GKDS')).toBeInTheDocument();
    expect(screen.getByText('৳ 10.00')).toBeInTheDocument();
    expect(screen.getByText('View / Print Receipt')).toBeInTheDocument();
    expect(screen.getByText('Documents securely scanned and processed')).toBeInTheDocument();
    expect(screen.queryByText(/order_status\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/common\./i)).not.toBeInTheDocument();

    const langButton = screen.getByRole('button', { name: /toggle language/i });
    fireEvent.click(langButton);

    await waitFor(() => {
      expect(screen.getByText('অর্ডার ট্র্যাকিং ও অগ্রগতি')).toBeInTheDocument();
    });
    expect(screen.getByText('৳১০.০০')).toBeInTheDocument();
    expect(screen.getByText('রসিদ দেখুন / প্রিন্ট করুন')).toBeInTheDocument();
  });
});
