'use client';

import { onAuthStateChanged } from 'firebase/auth';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import {
  BootstrapClientError,
  fetchPortalBootstrap,
  type BootstrapData,
  type BootstrapMember,
} from '@/lib/bootstrap-client';
import {
  getPortalAuth,
  preparePortalAuth,
  signInToPortal,
  signOutFromPortal,
} from '@/lib/firebase-client';

type Member = {
  id: string;
  name: string;
  role: string;
  status: string;
  statusTone: 'green' | 'amber' | 'red';
  outfit: string;
  message: string;
};

const mapPositions = [
  ['26%', '24%'],
  ['70%', '61%'],
  ['84%', '20%'],
  ['12%', '68%'],
  ['62%', '18%'],
  ['32%', '72%'],
] as const;
const outfits = ['avatar-coral', 'avatar-blue', 'avatar-mint'] as const;

function presentMember(member: BootstrapMember, index: number): Member {
  const availability = {
    available: { status: '相談できます', tone: 'green' as const },
    focus: { status: '作業に集中', tone: 'red' as const },
    break: { status: '休憩中', tone: 'amber' as const },
    do_not_disturb: { status: '対応できません', tone: 'red' as const },
  }[member.availability];
  const status = member.connection_state === 'offline'
    ? { status: '接続待ち', tone: 'amber' as const }
    : availability;

  return {
    id: member.internal_user_id,
    name: member.display_name,
    role: member.workplace.label || 'オフィス',
    status: status.status,
    statusTone: status.tone,
    outfit: outfits[index % outfits.length],
    message: member.availability_message || member.workplace.label || status.status,
  };
}

function PixelPerson({ outfit, isYou = false }: { outfit: string; isYou?: boolean }) {
  return (
    <span className={`pixel-person ${outfit} ${isYou ? 'is-you' : ''}`} aria-hidden="true">
      <span className="pixel-hair" />
      <span className="pixel-face" />
      <span className="pixel-body" />
      <span className="pixel-legs" />
      <span className="pixel-shadow" />
    </span>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<'loading' | 'signed-out' | 'loading-data' | 'ready' | 'error'>('loading');
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('会社という街へ むかっています…');
  const members = useMemo(() => {
    if (!bootstrap) return [];
    return bootstrap.office.members
      .filter((member) => member.internal_user_id !== bootstrap.me.internal_user_id)
      .map(presentMember);
  }, [bootstrap]);
  const selected = members.find((member) => member.id === selectedId) ?? members[0] ?? null;

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(getPortalAuth(), async (firebaseUser) => {
      if (!active) return;
      if (!firebaseUser) {
        setBootstrap(null);
        setPhase('signed-out');
        return;
      }

      setPhase('loading-data');
      try {
        const data = await fetchPortalBootstrap(await firebaseUser.getIdToken());
        if (!active) return;
        setBootstrap(data);
        setSelectedId(data.office.members.find(
          (member) => member.internal_user_id !== data.me.internal_user_id,
        )?.internal_user_id || '');
        setNotice(`${data.me.display_name}は アナザーオフィスに しゅっきんした！`);
        setPhase('ready');
      } catch (error) {
        if (!active) return;
        const code = error instanceof BootstrapClientError ? error.code : 'BOOTSTRAP_UNAVAILABLE';
        setErrorMessage(code === 'PORTAL_ACCESS_FORBIDDEN'
          ? 'このアカウントには、まだAnother Portalの利用範囲が設定されていません。'
          : 'APとの接続を確認できませんでした。少し待ってから、もう一度お試しください。');
        setPhase('error');
      }
    });

    preparePortalAuth().catch(() => {
      if (!active) return;
      setErrorMessage('Firebase認証を開始できませんでした。ブラウザのCookie設定も確認してください。');
      setPhase('error');
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function login() {
    setErrorMessage('');
    setPhase('loading');
    try {
      await signInToPortal();
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      const message = code === 'auth/unauthorized-domain'
        ? 'このホストがFirebaseの承認済みドメインに登録されていません。'
        : code === 'auth/operation-not-allowed'
          ? 'FirebaseでGoogleログインが有効になっていません。'
          : 'ログインを完了できませんでした。APと同じGoogleアカウントを選んでください。';
      setErrorMessage(`${message}${code ? `（${code}）` : ''}`);
      setPhase('signed-out');
    }
  }

  if (phase !== 'ready' || !bootstrap) {
    return (
      <main className="portal-shell auth-shell">
        <section className="auth-card" aria-live="polite">
          <span className="brand-mark">★</span>
          <p className="eyebrow">SHIFTCORE PRESENTS</p>
          <h1>ANOTHER PORTAL</h1>
          {phase === 'signed-out' ? (
            <>
              <p>会社という街へ入るには、APと同じGoogleアカウントでログインします。</p>
              <button type="button" onClick={login}>▶ 街へ入る</button>
            </>
          ) : phase === 'error' ? (
            <>
              <p>{errorMessage}</p>
              <button type="button" onClick={() => window.location.reload()}>▶ もう一度</button>
              <button className="secondary-auth-button" type="button" onClick={signOutFromPortal}>別のアカウントを使う</button>
            </>
          ) : (
            <p className="loading-copy"><span>◆</span> APと つないでいます…</p>
          )}
          {errorMessage && phase === 'signed-out' ? <small>{errorMessage}</small> : null}
        </section>
      </main>
    );
  }

  const currentTime = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(bootstrap.server_now));

  function startConversation(kind: 'talk' | 'message') {
    if (!selected) return;
    const action = kind === 'talk' ? '「ちょっといい？」を おくった！' : 'メッセージを ひらいた！';
    setNotice(`${selected.name}さんへ ${action}`);
  }

  return (
    <main className="portal-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">★</span>
          <div>
            <p className="eyebrow">SHIFTCORE PRESENTS</p>
            <h1>ANOTHER PORTAL</h1>
          </div>
        </div>
        <div className="today-card" aria-label="現在の勤務状態">
          <span className="today-dot" />
          <span>オフィスにいる</span>
          <strong>{currentTime}</strong>
        </div>
      </header>

      <section className="arrival-banner" role="status" aria-live="polite">
        <span className="arrival-spark">◆</span>
        <p>{notice}</p>
        <button type="button" onClick={() => setNotice('みんなに「おはよう！」と つたえた！')}>
          ▶ あいさつ
        </button>
      </section>

      <div className="portal-grid">
        <section className="office-section" aria-labelledby="office-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ANOTHER OFFICE · 1F</p>
              <h2 id="office-title">おはよう！ {bootstrap.me.display_name}さん</h2>
            </div>
            <p className="online-count"><span /> {bootstrap.office.members.length}にん いるよ</p>
          </div>

          <div className="office-map">
            <div className="wall wall-top" />
            <div className="window window-one"><i /><i /></div>
            <div className="window window-two"><i /><i /></div>
            <div className="room-label label-lounge">ひとやすみ</div>
            <div className="room-label label-desk">しごとば</div>
            <div className="room-label label-meeting">そうだん室</div>
            <div className="plant plant-one"><span /></div>
            <div className="plant plant-two"><span /></div>
            <div className="sofa sofa-left"><span /><span /></div>
            <div className="low-table"><span>☕</span></div>
            <div className="floor-rug"><span>★</span></div>
            <div className="desk desk-one"><span className="monitor" /><span className="chair" /></div>
            <div className="desk desk-two"><span className="monitor" /><span className="chair" /></div>
            <div className="meeting-table"><span /><span /><span /><span /></div>
            <div className="weird-phone">☎<span>れんらく</span></div>
            <div className="music-box">♫<span>ON AIR</span></div>

            {members.map((member, index) => (
              <button
                key={member.id}
                type="button"
                className={`map-member member-slot-${index % mapPositions.length} ${selectedId === member.id ? 'is-selected' : ''}`}
                style={{
                  '--member-left': mapPositions[index % mapPositions.length][0],
                  '--member-top': mapPositions[index % mapPositions.length][1],
                } as CSSProperties}
                onClick={() => setSelectedId(member.id)}
                aria-label={`${member.name}さんを選択`}
              >
                <span className="speech-bubble">{member.message}</span>
                <PixelPerson outfit={member.outfit} />
                <span className="map-name">{member.name}</span>
                <span className={`mini-status status-${member.statusTone}`} />
              </button>
            ))}

            <div className="map-member member-you">
              <span className="you-label">YOU</span>
              <PixelPerson outfit="avatar-yellow" isYou />
              <span className="map-name">{bootstrap.me.display_name}</span>
              <span className="mini-status status-green" />
            </div>

            <div className="entrance"><span>APからの いりぐち</span><i /></div>
          </div>
        </section>

        <aside className="people-panel" aria-labelledby="people-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">WHO IS HERE?</p>
              <h2 id="people-title">だれに はなす？</h2>
            </div>
            <button type="button" className="more-button" aria-label="ログアウト" onClick={signOutFromPortal}>退出</button>
          </div>

          <div className="member-list">
            {members.map((member) => (
              <button
                type="button"
                key={member.id}
                className={`member-card ${selectedId === member.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(member.id)}
              >
                <PixelPerson outfit={member.outfit} />
                <span className="member-copy">
                  <strong>{member.name}</strong>
                  <small>{member.role}</small>
                  <em className={`status-${member.statusTone}`}><i />{member.status}</em>
                </span>
                <span className="member-arrow">›</span>
              </button>
            ))}
          </div>

          {selected ? (
            <div className="contact-card">
              <div className="selected-person">
                <PixelPerson outfit={selected.outfit} />
                <div>
                  <p><span className={`mini-status status-${selected.statusTone}`} /> {selected.status}</p>
                  <h3>{selected.name}さんに はなしかける</h3>
                </div>
              </div>
              <button className="talk-button" type="button" onClick={() => startConversation('talk')}>
                <span>▶</span> すぐ はなす
              </button>
              <button className="message-button" type="button" onClick={() => startConversation('message')}>
                <span>▶</span> あとで メッセージ
              </button>
              <p className="contact-hint">※ まずは あいてに しらせます</p>
            </div>
          ) : (
            <div className="contact-card empty-contact-card">いまは ほかの人が いないようだ…</div>
          )}
        </aside>
      </div>

      <nav className="mobile-nav" aria-label="メインナビゲーション">
        <button className="is-active" type="button"><span>⌂</span>オフィス</button>
        <button type="button"><span>♢</span>トーク</button>
        <button type="button"><span>◎</span>みんな</button>
        <button type="button"><span>○</span>わたし</button>
      </nav>
    </main>
  );
}
