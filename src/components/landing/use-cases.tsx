const useCases = [
  ["01", "매장 안내", "영업시간, 위치, 이용 방법을 한 화면에"],
  ["02", "행사 안내", "일정, 장소, 준비물을 강한 포스터로"],
  ["03", "모임 안내", "참여자에게 필요한 내용을 빠짐없이"],
] as const;

export function UseCases() {
  return (
    <section id="examples" className="use-cases" aria-labelledby="examples-title">
      <p className="section-kicker">USE CASES</p>
      <h2 id="examples-title">필요한 안내를 선명하게</h2>
      <div className="use-case-grid">
        {useCases.map(([number, title, description]) => (
          <article key={title} className="use-case">
            <span aria-hidden="true">{number}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
