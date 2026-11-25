import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import i18n from '../lib/i18n';

describe('App Component', () => {
  it('renders application title, hero heading, actions, and brand footer cleanly', async () => {
    await i18n.changeLanguage('en');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'PrintFlow' })).toBeInTheDocument();
    expect(screen.getByText(/Smart Printing\. Simplified\./i)).toBeInTheDocument();
    expect(screen.getByText(/Autonomous Walk-in Print Operations/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Customer Point/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/\/s\/printflow-main/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Owner Login/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Register New Shop/i })).toBeInTheDocument();
    expect(screen.getByText(/© 2026 PrintFlow by/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /DevCenterPoint/i })).toHaveAttribute('href', 'https://devcenterpoint.com');
    expect(screen.queryByText(/Milestone 1/i)).not.toBeInTheDocument();
  });

  it('toggles language between English and Bengali across all landing elements', async () => {
    await i18n.changeLanguage('en');
    render(<App />);

    const langButton = screen.getByRole('button', { name: /toggle language/i });
    expect(langButton).toBeInTheDocument();
    expect(langButton).toHaveTextContent('বাংলা');

    fireEvent.click(langButton);
    expect(langButton).toHaveTextContent('English');
    expect(screen.getByRole('heading', { name: 'প্রিন্টফ্লো' })).toBeInTheDocument();
    expect(screen.getByText(/স্মার্ট প্রিন্টিং, আরও সহজ।/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /কাস্টমার পয়েন্ট/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /মালিক লগইন/i })).toBeInTheDocument();
  });
});
