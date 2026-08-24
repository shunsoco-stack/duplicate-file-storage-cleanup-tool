"use client";

import Image from "next/image";

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="system-state" id="main-content">
      <section className="system-state__card" aria-labelledby="error-title">
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
        <p className="system-state__eyebrow">読み込みエラー</p>
        <h1 id="error-title">画面を読み込めませんでした</h1>
        <p>
          選択したファイルが送信または削除されたわけではありません。もう一度読み込みをお試しください。
        </p>
        <div className="system-state__actions">
          <button
            className="button button--primary"
            type="button"
            onClick={reset}
          >
            もう一度試す
          </button>
        </div>
      </section>
    </main>
  );
}
