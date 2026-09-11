import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import type { IChoiceStep, IStep } from '../workflows/types';
import { ChoiceGroup } from './ChoiceGroup';
import { NoticeBanner } from './NoticeBanner';
import { ProgressBar } from './ProgressBar';
import { StepRenderer } from './StepRenderer';
import { TextArea } from './TextArea';
import { TextInput } from './TextInput';

const selectStep: IChoiceStep = {
  id: 'frequency',
  type: 'select',
  title: 'How often does it happen?',
  required: true,
  options: [
    { value: 'daily', label: 'Every day' },
    { value: 'weekly', label: 'A few times a week' }
  ]
};

const multiStep: IChoiceStep = {
  id: 'categories',
  type: 'multiselect',
  title: 'What kind of information might be involved?',
  help: 'Pick all that apply.',
  required: true,
  options: [
    { value: 'public', label: 'Public information' },
    { value: 'employee', label: 'Employee information' },
    { value: 'none', label: 'None of these', exclusive: true },
    { value: 'unsure', label: 'I am not sure', exclusive: true }
  ]
};

describe('NoticeBanner', () => {
  it('renders its children next to a decorative icon', () => {
    const { container } = render(<NoticeBanner>Take care.</NoticeBanner>);
    expect(screen.getByText('Take care.')).toBeInTheDocument();
    const icon: SVGElement | null = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).toHaveClass('overture-notice');
  });
});

describe('ProgressBar', () => {
  it('describes progress through the form', () => {
    const { rerender } = render(<ProgressBar current={0} total={10} phase="form" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Progress: Just getting started');
    expect(screen.getByText('Just getting started')).toBeInTheDocument();
    expect(screen.getByRole('progressbar').querySelectorAll('span')).toHaveLength(10);
    expect(screen.getByRole('progressbar').querySelectorAll('.is-filled')).toHaveLength(1);

    rerender(<ProgressBar current={4} total={10} phase="form" />);
    expect(screen.getByText('Making progress')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByRole('progressbar').querySelectorAll('.is-filled')).toHaveLength(5);

    rerender(<ProgressBar current={7} total={10} phase="form" />);
    expect(screen.getByText('Almost there')).toBeInTheDocument();
  });

  it('marks review and result phases complete', () => {
    const { rerender } = render(<ProgressBar current={3} total={10} phase="review" />);
    expect(screen.getByText('Review your answers')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar').querySelectorAll('.is-filled')).toHaveLength(10);
    rerender(<ProgressBar current={3} total={10} phase="result" />);
    expect(screen.getByText('All done')).toBeInTheDocument();
    rerender(<ProgressBar current={3} total={10} phase="review" completeLabel="Review your draft summary" />);
    expect(screen.getByText('Review your draft summary')).toBeInTheDocument();
    rerender(<ProgressBar current={0} total={0} phase="form" />);
    expect(screen.getByRole('progressbar').querySelectorAll('span')).toHaveLength(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('ChoiceGroup', () => {
  it('reports a single selection and presses the chosen option', () => {
    const onChange: jest.Mock = jest.fn();
    const { rerender } = render(<ChoiceGroup step={selectStep} value={undefined} onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'How often does it happen?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Every day' }));
    expect(onChange).toHaveBeenCalledWith('daily');
    rerender(<ChoiceGroup step={selectStep} value="daily" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Every day' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'A few times a week' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Every day' }).querySelector('svg')).not.toBeNull();
  });

  it('toggles multiselect values and honours exclusive options', () => {
    const onChange: jest.Mock = jest.fn();
    const { rerender } = render(<ChoiceGroup step={multiStep} value={['public']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Employee information' }));
    expect(onChange).toHaveBeenLastCalledWith(['public', 'employee']);
    fireEvent.click(screen.getByRole('button', { name: 'Public information' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole('button', { name: 'None of these' }));
    expect(onChange).toHaveBeenLastCalledWith(['none']);

    rerender(<ChoiceGroup step={multiStep} value={['none']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Employee information' }));
    expect(onChange).toHaveBeenLastCalledWith(['employee']);
    fireEvent.click(screen.getByRole('button', { name: 'None of these' }));
    expect(onChange).toHaveBeenLastCalledWith([]);

    rerender(<ChoiceGroup step={multiStep} value="employee" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Public information' }));
    expect(onChange).toHaveBeenLastCalledWith(['public']);
  });
});

describe('TextInput and TextArea', () => {
  const step: IStep = { id: 'toolName', type: 'text', title: 'What is the name of the tool?', placeholder: 'Tool name' };

  it('render controlled inputs with the step id and placeholder', () => {
    const onChange: jest.Mock = jest.fn();
    const { rerender } = render(<TextInput step={step} value={undefined} onChange={onChange} />);
    const input: HTMLElement = screen.getByPlaceholderText('Tool name');
    expect(input).toHaveAttribute('id', 'toolName');
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: 'Copilot' } });
    expect(onChange).toHaveBeenCalledWith('Copilot');

    rerender(<TextArea step={{ ...step, type: 'textarea' }} value="Draft" onChange={onChange} />);
    const area: HTMLElement = screen.getByPlaceholderText('Tool name');
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveAttribute('rows', '4');
    expect(area).toHaveValue('Draft');
  });
});

describe('StepRenderer', () => {
  it('renders nothing without a step', () => {
    const { container } = render(<StepRenderer step={undefined} value={undefined} error={undefined} onAnswer={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the title, help, safety notice and optional hint for a text step', () => {
    render(
      <StepRenderer
        step={{ id: 'systems', type: 'textarea', title: 'What systems are involved?', help: 'Optional.', required: false, showSafetyNotice: true }}
        value=""
        error={undefined}
        onAnswer={jest.fn()}
      />
    );
    expect(screen.getByRole('heading', { name: 'What systems are involved?' })).toBeInTheDocument();
    expect(screen.getByText('Optional.')).toBeInTheDocument();
    expect(screen.getByText('Do not enter patient information or other sensitive personal information.')).toBeInTheDocument();
    expect(screen.getByText('This question is optional.')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders notices, choice groups and validation errors', () => {
    const { rerender } = render(
      <StepRenderer step={{ id: 'notice', type: 'notice', title: 'Thanks', body: 'We will ask more.' }} value={undefined} error={undefined} onAnswer={jest.fn()} />
    );
    expect(screen.getByText('We will ask more.')).toBeInTheDocument();
    expect(screen.queryByText('This question is optional.')).not.toBeInTheDocument();

    const onAnswer: jest.Mock = jest.fn();
    rerender(<StepRenderer step={selectStep} value={undefined} error="Please pick one option so we can keep going." onAnswer={onAnswer} />);
    expect(screen.getByRole('status')).toHaveTextContent('Please pick one option so we can keep going.');
    fireEvent.click(screen.getByRole('button', { name: 'Every day' }));
    expect(onAnswer).toHaveBeenCalledWith('daily');
  });
});
