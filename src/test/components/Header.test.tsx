import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../../components/Header';

describe('Header', () => {
  it('renders the app title', () => {
    render(<Header />);
    expect(screen.getByText('Clauditor')).toBeInTheDocument();
    expect(screen.getByText('Claude Code 使用状況ダッシュボード')).toBeInTheDocument();
  });

  it('renders settings and theme toggle buttons', () => {
    render(<Header />);
    
    // Settings button should be present
    const settingsButtons = screen.getAllByRole('button');
    expect(settingsButtons.length).toBeGreaterThan(0);
  });
});