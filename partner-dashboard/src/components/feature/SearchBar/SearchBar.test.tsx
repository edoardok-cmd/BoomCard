import { render, screen } from '@testing-library/react';
import SearchBar from './SearchBar';

describe('SearchBar', () => {
  it('renders without crashing', () => {
    render(<SearchBar>Test</SearchBar>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});