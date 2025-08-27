import { render, screen } from '@testing-library/react';
import Input from './Input';

describe('Input', () => {
  it('renders without crashing', () => {
    render(<Input>Test</Input>);
    expect(screen.getByText('Test')).toBeInTheDocument();
  });
});