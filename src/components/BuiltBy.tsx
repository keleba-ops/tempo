export function BuiltBy({
  tone = 'default',
  className = '',
}: {
  tone?: 'default' | 'inverse';
  className?: string;
}) {
  return (
    <span className={`built-by built-by-${tone} ${className}`.trim()}>
      <span className="built-by-mark" aria-hidden="true" />
      <span>Built by <strong>Verge Dynamics</strong></span>
    </span>
  );
}
