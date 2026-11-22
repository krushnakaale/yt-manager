export default function About() {
  return (
    <section>
      <h1>About YT Manager</h1>
      <div className="card prose">
        <p><strong>Version 1.0.0</strong>. A college project: organize video links and playlists, and manage downloads of files you are authorized to download.</p>
        <h2>Policy</h2>
        <ul>
          <li>YouTube playback uses the official embedded player. Metadata comes from YouTube's oEmbed endpoint and, if you add a key, the YouTube Data API.</li>
          <li>This app does not download YouTube video files and does not bypass access controls, DRM or platform restrictions.</li>
          <li>The Download center accepts direct file URLs you own or are explicitly permitted to download, and files you add yourself.</li>
          <li>No ads, no trackers, no automatic redirects. External links always ask before opening.</li>
          <li>Your library and download history are stored locally on this device.</li>
        </ul>
        <h2>Built with</h2>
        <p className="muted">React, Electron, Capacitor, Python FastAPI, SQLite.</p>
      </div>
    </section>
  );
}
