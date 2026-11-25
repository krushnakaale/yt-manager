import { useState } from "react";
import { useUI } from "../ui.jsx";

export default function About() {
  const { openExternal } = useUI();
  const [avatarUnavailable, setAvatarUnavailable] = useState(false);

  return (
    <section className="about-page">
      <header className="about-hero">
        <span className="about-kicker"><i aria-hidden="true" /> LOCAL-FIRST VIDEO WORKSPACE</span>
        <h1>Keep your videos <span>organized and in your control.</span></h1>
        <p>Discover, save, play, and manage videos from one responsive workspace. Your library and watch history stay with the backend you choose.</p>
        <div className="about-highlights" aria-label="Platform highlights">
          <span>Video library</span><span>Playlists</span><span>Watch progress</span><span>Download manager</span>
        </div>
      </header>

      <section className="card about-privacy" aria-labelledby="about-privacy-heading">
        <div className="about-section-heading">
          <span className="eyebrow">PRIVACY BY DESIGN</span>
          <h2 id="about-privacy-heading">Your data. Your backend.</h2>
          <p className="muted">No YT Manager cloud account is needed. You decide where the app's local database lives.</p>
        </div>
        <div className="about-privacy-grid">
          <article>
            <span className="about-point-number">01</span>
            <div><h3>No sign-up</h3><p>No account, email address, or phone number is required to use the app.</p></div>
          </article>
          <article>
            <span className="about-point-number">02</span>
            <div><h3>Locally controlled</h3><p>Library, playlists, watch history, and settings are stored in SQLite on your configured backend. Search history stays on your device.</p></div>
          </article>
          <article>
            <span className="about-point-number">03</span>
            <div><h3>No ads or analytics</h3><p>The app does not include advertising or analytics trackers.</p></div>
          </article>
          <article>
            <span className="about-point-number">04</span>
            <div><h3>Clear connections</h3>            <p>YouTube receives requests for the YouTube features you use. Android and remote clients connect only to the backend address you configure. The public developer photo below is served by GitHub.</p></div>
          </article>
        </div>
        <div className="about-safety-note">
          <strong>Use downloads responsibly</strong>
          <span className="muted">Download only media you own or are authorized to save. YT Manager does not bypass DRM or access controls.</span>
        </div>
        <div className="about-built-with">
          <span className="eyebrow">BUILT WITH</span>
          <div className="about-tech-list" aria-label="Technology stack">
            {["React", "Electron", "Capacitor", "Python FastAPI", "SQLite"].map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </section>

      <section className="about-developer" aria-labelledby="about-developer-heading">
        <div className="about-developer-identity">
          <div className="about-avatar" aria-hidden="true">
            {avatarUnavailable
              ? <span>KK</span>
              : <img
                src="https://avatars.githubusercontent.com/u/201053453?v=4&size=160"
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={() => setAvatarUnavailable(true)}
              />}
          </div>
          <div>
            <span className="eyebrow">DEVELOPER</span>
            <h2 id="about-developer-heading">Krushna Kale</h2>
            <p className="muted">Python developer building automation tools and practical web applications.</p>
          </div>
        </div>
        <div className="about-social-links" aria-label="Developer social links">
          <button className="about-social-link" onClick={() => openExternal("https://github.com/krushnakaale")}>GitHub <span aria-hidden="true">↗</span></button>
          <button className="about-social-link" onClick={() => openExternal("https://krushnakaale.vercel.app")}>Portfolio <span aria-hidden="true">↗</span></button>
          <button className="about-social-link" onClick={() => openExternal("https://www.linkedin.com/in/krushnakaale")}>LinkedIn <span aria-hidden="true">↗</span></button>
          <button className="about-social-link" onClick={() => openExternal("https://www.instagram.com/krushna_kaale")}>Instagram <span aria-hidden="true">↗</span></button>
        </div>
      </section>
    </section>
  );
}
