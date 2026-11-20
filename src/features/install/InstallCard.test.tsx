import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InstallCard } from './InstallCard';

describe('InstallCard', () => {
  it('offers one-tap install when Chrome allows it, then disappears when installed', async () => {
    render(<InstallCard variant="banner" />);
    expect(screen.queryByText('Install NEXUS on this phone')).not.toBeInTheDocument(); // no prompt yet, not iOS

    const prompt = vi.fn(async () => {});
    const evt = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }) });
    act(() => {
      window.dispatchEvent(evt);
    });
    expect(screen.getByText('Install NEXUS on this phone')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Install app/ }));
    await vi.waitFor(() => expect(prompt).toHaveBeenCalled());
  });

  it('settings panel always explains how to install', () => {
    render(<InstallCard variant="panel" />);
    expect(screen.getByText(/Install NEXUS on this phone|Installed/)).toBeInTheDocument();
  });
});
