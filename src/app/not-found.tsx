import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="system-state" id="main-content">
      <section className="system-state__card" aria-labelledby="not-found-title">
        <div className="system-state__brand" aria-hidden="true">
          <Image
            className="system-state__icon"
            src="/icons/storage-cleanup-mark.svg"
            width={40}
            height={40}
            alt=""
          />
          <span>重複整理</span>
        </div>
        <p className="system-state__eyebrow">404</p>
        <h1 id="not-found-title">ページが見つかりません</h1>
        <p>お探しのページは移動したか、URLが正しくない可能性があります。</p>
        <div className="system-state__actions">
          <Link className="button button--primary" href="/">
            スキャン画面へ戻る
          </Link>
        </div>
      </section>
    </main>
  );
}
