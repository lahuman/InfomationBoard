import Link from "next/link";
import { SAMPLE_BOARDS } from "@/features/boards/examples/sample-boards";

export function UseCases() {
  return (
    <section id="examples" className="use-cases" aria-labelledby="examples-title">
      <p className="section-kicker">USE CASES</p>
      <h2 id="examples-title">필요한 안내를 선명하게</h2>
      <div className="use-case-grid">
        {SAMPLE_BOARDS.map(({ number, slug, label, description }) => (
          <article key={slug} className="use-case">
            <Link
              href={`/examples/${slug}`}
              aria-label={`${label} 샘플 보드 보기`}
            >
              <span aria-hidden="true">{number}</span>
              <h3>{label}</h3>
              <p>{description}</p>
              <span className="use-case-action" aria-hidden="true">
                샘플 보드 보기 →
              </span>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
