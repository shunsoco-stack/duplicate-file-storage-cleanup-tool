export default function Loading() {
  return (
    <main
      className="loading-shell"
      id="main-content"
      aria-busy="true"
      aria-label="アプリを読み込んでいます"
    >
      <div className="loading-shell__header">
        <span className="skeleton skeleton--brand" />
        <span className="skeleton skeleton--action" />
      </div>
      <div className="loading-shell__workflow" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <span className="skeleton skeleton--step" key={index} />
        ))}
      </div>
      <div className="loading-shell__metrics" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span className="skeleton skeleton--metric" key={index} />
        ))}
      </div>
      <div className="loading-shell__content" aria-hidden="true">
        <span className="skeleton skeleton--panel" />
        <span className="skeleton skeleton--panel" />
      </div>
      <p className="sr-only">ローカルワークスペースを準備しています。</p>
    </main>
  );
}
