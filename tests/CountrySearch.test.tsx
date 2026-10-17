import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CountrySearch, { type CountryEntry } from '../components/CountrySearch';

const countries: CountryEntry[] = [
  { code: 'PT', name: 'Portugal', lat: 39, lon: -8, count: 10 },
  { code: 'ST', name: 'São Tomé and Príncipe', lat: 0, lon: 6, count: 2 },
];

function setup(selected: CountryEntry | null = null) {
  const onSelect = vi.fn();
  render(<CountrySearch countries={countries} selected={selected} onSelect={onSelect} />);
  return { input: screen.getByRole('combobox'), onSelect, user: userEvent.setup() };
}

describe('country search', () => {
  it('matches accented names and trims whitespace', async () => {
    const { user, input } = setup();
    await user.type(input, ' sao ');
    expect(screen.getByRole('option')).toHaveTextContent('São Tomé');
  });

  it('connects the active option to the combobox and selects with Enter', async () => {
    const { user, input, onSelect } = setup();
    await user.click(input);
    await user.keyboard('{ArrowDown}');
    const option = screen.getAllByRole('option')[0];
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(countries[0]);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('opens the last option with ArrowUp, without first requiring ArrowDown', async () => {
    const { user, input, onSelect } = setup();
    await user.click(input);
    await user.keyboard('{ArrowUp}{Enter}');
    expect(onSelect).toHaveBeenCalledWith(countries[1]);
  });

  it('Escape restores the selected name without clearing the filter', async () => {
    const { user, input, onSelect } = setup(countries[0]);
    await user.clear(input);
    await user.type(input, 'sao');
    await user.keyboard('{Escape}{Escape}');
    expect(input).toHaveValue('Portugal');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('closes on Tab and clears only via the explicit clear button', async () => {
    const { user, input, onSelect } = setup(countries[0]);
    await user.click(input);
    await user.tab();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(input).toHaveFocus();
  });

  it('announces empty results and handles navigation without results', async () => {
    const { user, input, onSelect } = setup();
    await user.type(input, 'zzzz');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('No countries found');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not select while an input method is composing', () => {
    const { input, onSelect } = setup();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
