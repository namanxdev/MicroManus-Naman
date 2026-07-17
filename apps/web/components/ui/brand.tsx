import Link from "next/link";

interface BrandProps {
  href?: string;
  compact?: boolean;
  inverse?: boolean;
}

export function Brand({ href = "/", compact = false, inverse = false }: BrandProps) {
  return (
    <Link
      aria-label="MicroManus home"
      className={`brand ${inverse ? "brand--inverse" : ""}`}
      href={href}
    >
      <span aria-hidden="true" className="brand__mark">
        <span />
        <span />
        <span />
      </span>
      {!compact && (
        <span className="brand__word">
          Micro<span>Manus</span>
        </span>
      )}
    </Link>
  );
}
