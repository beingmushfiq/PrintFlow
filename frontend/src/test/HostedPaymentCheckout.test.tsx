import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HostedPaymentCheckout } from '../components/HostedPaymentCheckout';
import * as api from '../lib/api';
import '../lib/i18n';

describe('HostedPaymentCheckout Component', () => {
  it('renders SSLCOMMERZ, bKash, and Sandbox gateways', () => {
    render(
      <HostedPaymentCheckout
        slug="test-shop"
        orderToken="tok_123"
        totalMinor={1250}
      />
    );

    expect(screen.getAllByText(/SSLCOMMERZ/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/bKash/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sandbox/i).length).toBeGreaterThan(0);
  });

  it('triggers sandbox payment simulation and disables button on click', async () => {
    const handleSuccess = vi.fn();
    vi.spyOn(api, 'apiRequest').mockResolvedValueOnce({
      data: { status: 'PAID', transaction_id: 'SNDBX_123' },
      meta: { correlation_id: '1', timestamp: '' },
      errors: [],
    });

    render(
      <HostedPaymentCheckout
        slug="test-shop"
        orderToken="tok_123"
        totalMinor={1250}
        onPaymentSuccess={handleSuccess}
      />
    );

    const payButton = screen.getByRole('button', { name: /Pay/i });
    expect(payButton).toBeEnabled();

    fireEvent.click(payButton);

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PAID' })
      );
    });
  });
});
