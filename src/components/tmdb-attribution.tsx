export function TmdbAttribution() {
  return <div className="text-xs text-muted space-y-2 mt-5">
    <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/branding/tmdb.svg" alt="TMDB" width={80} height={35} className="w-20 h-auto" />
    </a>
    <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
  </div>;
}
