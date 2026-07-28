import Link from "next/link";

export function Hero() {
  return (
    <section className="poster-hero" aria-labelledby="hero-title">
      <div className="poster-orb" aria-hidden="true" />
      <p className="poster-kicker">
        <span>무료 베타</span> · INFORMATION FOR EVERYONE
      </p>
      <h1 id="hero-title">
        한 번 만들고,
        <br />
        QR로 바로 알리세요.
      </h1>
      <p className="poster-summary">
        매장, 행사, 모임 안내를 보기 좋게 만들고 링크와 QR로 공유하세요.
      </p>
      <div className="poster-actions">
        <Link className="primary-action" href="/login">
          무료로 안내판 만들기
        </Link>
        <a className="text-action" href="#examples">
          활용 예시 보기
        </a>
      </div>
    </section>
  );
}
