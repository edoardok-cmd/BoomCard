import { render, screen } from '@testing-library/react';
import FilterPanel from './FilterPanel';

describe('FilterPanel', () => {
  it('renders without crashing', () => {
    render(<FilterPanel>Test</FilterPanel>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});