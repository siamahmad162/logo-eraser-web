import { useState } from 'react';
import { GALLERY_VERTICAL, GALLERY_VIDEOS, PHOTOS, type Demo } from '../media';
import { Link } from '../router';
import { ArrowRight, Check } from './Icons';
import { MediaCompare } from './MediaCompare';

function Card({ d }: { d: Demo }) {
  return (
    <figure className="g-card">
      <MediaCompare media={d.media} logo={d.logo} alt={d.alt} />
      <figcaption>
        <span className={`src src-${d.source.toLowerCase()}`}>{d.source}</span>
        <span className="g-title">{d.title}</span>
      </figcaption>
    </figure>
  );
}

export function Gallery() {
  const [tab, setTab] = useState<'video' | 'photo'>('video');
  return (
    <div className="gallery">
      <div className="tabs" role="tablist" aria-label="Kind of result">
        <button type="button" role="tab" id="tab-video" aria-controls="panel-video" aria-selected={tab === 'video'} onClick={() => setTab('video')}>Videos</button>
        <button type="button" role="tab" id="tab-photo" aria-controls="panel-photo" aria-selected={tab === 'photo'} onClick={() => setTab('photo')}>Photos</button>
      </div>
      {tab === 'video' ? (
        <div id="panel-video" role="tabpanel" aria-labelledby="tab-video">
          <div className="g-grid">
            {GALLERY_VIDEOS.map((d) => <Card key={d.id} d={d} />)}
          </div>
          <div className="g-vertical">
            {GALLERY_VERTICAL.map((d) => <Card key={d.id} d={d} />)}
            <div className="g-note">
              <span className="eyebrow">9:16 too</span>
              <h3>Made for Reels and Shorts</h3>
              <p>Vertical clips are handled exactly like wide ones: the logo is found in its corner, and resolution, frame rate and audio stay as they were.</p>
              <ul className="ticks">
                <li><Check /> Gemini sparkle and Veo text mark</li>
                <li><Check /> No crop, so captions and framing stay put</li>
                <li><Check /> A whole series in one batch, one ZIP out</li>
              </ul>
              <Link to="/veo-watermark-remover" className="btn btn-primary">Try it on a vertical clip <ArrowRight /></Link>
            </div>
          </div>
        </div>
      ) : (
        <div id="panel-photo" role="tabpanel" aria-labelledby="tab-photo">
          <div className="g-grid">
            {PHOTOS.map((d) => <Card key={d.id} d={d} />)}
          </div>
        </div>
      )}
      <p className="g-foot">Every clip and photo above is unedited output. Hover or drag to compare; the crops show the corner where the logo sits.</p>
    </div>
  );
}
