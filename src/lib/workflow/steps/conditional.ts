import { WorkflowStep, StepExecutionResult } from '../types';

/**
 * Extracts a nested property value from an object via dot notation.
 */
function getValueByPath(obj: Record<string, any>, path: string): any {
  if (!obj || !path) return undefined;
  const keys = path.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Executes a Conditional Branch step.
 * Evaluates configured rules against previous step output/input and selects the execution branch.
 */
export async function executeConditionalStep(
  step: WorkflowStep,
  input: Record<string, any>
): Promise<StepExecutionResult> {
  const config = step.config || {};
  const fieldPath = config.field || '';
  const operator = config.operator || 'equals';
  const targetValue = config.value;
  const trueStepPos = config.true_step_position;
  const falseStepPos = config.false_step_position;

  const actualValue = fieldPath ? getValueByPath(input, fieldPath) : input;

  let conditionMet = false;

  switch (operator) {
    case 'equals':
      conditionMet = String(actualValue) === String(targetValue);
      break;

    case 'not_equals':
      conditionMet = String(actualValue) !== String(targetValue);
      break;

    case 'contains':
      if (typeof actualValue === 'string') {
        conditionMet = actualValue.includes(String(targetValue));
      } else if (Array.isArray(actualValue)) {
        conditionMet = actualValue.includes(targetValue);
      } else {
        conditionMet = false;
      }
      break;

    case 'greater_than':
      conditionMet = Number(actualValue) > Number(targetValue);
      break;

    case 'less_than':
      conditionMet = Number(actualValue) < Number(targetValue);
      break;

    case 'is_truthy':
      conditionMet = Boolean(actualValue);
      break;

    case 'is_falsy':
      conditionMet = !Boolean(actualValue);
      break;

    default:
      conditionMet = String(actualValue) === String(targetValue);
      break;
  }

  const selectedBranch = conditionMet ? 'true' : 'false';
  const nextStepPosition = conditionMet ? trueStepPos : falseStepPos;

  return {
    status: 'completed',
    output: {
      field: fieldPath,
      operator,
      expectedValue: targetValue,
      actualValue,
      conditionMet,
      selectedBranch,
      nextStepPosition: nextStepPosition ?? null,
    },
    nextStepPosition: nextStepPosition !== undefined ? Number(nextStepPosition) : undefined,
  };
}
