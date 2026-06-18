import { cloneElement, isValidElement, useId } from 'react';

export function FormField({
  label,
  htmlFor,
  required = false,
  error = '',
  hint = '',
  className = '',
  children}) {
  const autoId = useId();
  const fieldId = htmlFor || autoId;
  const errorId = error ? `${fieldId}-error` : undefined;
  const hintId = hint && !error ? `${fieldId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  let control = children;
  if (isValidElement(children)) {
    control = cloneElement(children, {
      id: children.props.id || fieldId,
      'aria-required': required || undefined,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy});
  }

  return (
    <div className={className}>
      {label ? (
        <label className="hms-label" htmlFor={fieldId}>
          {label}
          {required ? (
            <span className="text-red-500" aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </label>
      ) : null}
      {control}
      {hint && !error ? (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
