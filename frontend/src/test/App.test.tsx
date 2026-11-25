import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import i18n from '../lib/i18n';

describe('App Component', () => {
  it('renders application title, actions, and brand footer cleanly', async () => {
    await i18n.changeLanguage('en');
    render(<App />);

    expect(screen.getByRole('heading', { name: 'PrintFlow' })).toBeInTheDocument();
    expect(screen.getAllByText(/Autonomous Walk-in Print Shop Automation/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Autonomous Walk-in Print Operations/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Owner Login/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Register New Shop/i })).toBeInTheDocument();
    expect(screen.getByText(/© 2026 PrintFlow by DevCenterPoint/i)).toBeInTheDocument();
    expect(screen.queryByText(/Milestone 1/i)).not.toBeInTheDocument();
  });

  it('toggles language between English and Bengali', async () => {
    await i18n.changeLanguage('en');
    render(<App />);

    const langButton = screen.getByRole('button', { name: /toggle language/i });
    expect(langButton).toBeInTheDocument();
    expect(langButton).toHaveTextContent('বাংলা');

    fireEvent.click(langButton);
    expect(langButton).toHaveTextContent('English');
    expect(screen.getByRole('heading', { name: 'প্রিন্টফ্লো' })).toBeInTheDocument();
  });
});
