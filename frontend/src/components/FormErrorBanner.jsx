export function FormErrorBanner({ message, title }) {
  if (!message) return null;
  return (
    <div
      className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert"
      aria-live="polite"
    >
      {title ? <div className="mb-1 font-bold">{title}</div> : null}
      <div>{message}</div>
    </div>
  );
}
