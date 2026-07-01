import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { AdminStatus } from '../api/client';
import { ScribbleInk } from './ScribbleInk';
import { NotebookSpine } from './NotebookSpine';

interface Props {
  notify: (m: string) => void;
  onRefresh: () => void;
}

export function AdminPanel({ notify, onRefresh }: Props) {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const fetchStatus = () => {
    api.admin.status().then(setStatus).catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    notify('syncing RSS feed...');
    try {
      const r = await api.admin.sync();
      notify(`synced ${r.synced} episodes (${r.added} new)`);
      fetchStatus();
      onRefresh();
    } catch (e) {
      notify(`sync failed: ${e}`);
    }
    setSyncing(false);
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const r = await api.admin.resetPlayStates();
      notify(`${r.resetCount} episodes reset to unplayed`);
      setConfirmReset(false);
      fetchStatus();
      onRefresh();
    } catch (e) {
      notify(`reset failed: ${e}`);
    }
    setResetting(false);
  };

  return (
    <div className="admin-panel">
      <NotebookSpine />
      <ScribbleInk variant="corner" />
      <h2 className="admin-title">&gt; admin_terminal</h2>

      <div className="admin-section">
        <h3 className="admin-section-title">{'>>'} feed_sync</h3>
        <button
          className="term-btn primary"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? '[ syncing... ]' : '[ sync RSS feed ]'}
        </button>
      </div>

      <div className="admin-section">
        <h3 className="admin-section-title">{'>>'} danger_zone</h3>
        {!confirmReset ? (
          <button className="term-btn" onClick={() => setConfirmReset(true)}>
            [ reset all to unplayed ]
          </button>
        ) : (
          <div className="confirm-block">
            <p className="confirm-text">
              reset ALL episodes to unplayed? this clears all progress.
            </p>
            <div className="confirm-actions">
              <button
                className="term-btn primary"
                onClick={handleReset}
                disabled={resetting}
              >
                {resetting ? '[ resetting... ]' : '[ confirm reset ]'}
              </button>
              <button className="term-btn" onClick={() => setConfirmReset(false)}>
                [ cancel ]
              </button>
            </div>
          </div>
        )}
      </div>

      {status && (
        <div className="admin-section">
          <h3 className="admin-section-title">{'>>'} status</h3>
          <div className="admin-stats">
            <div className="stat-line">
              <span className="stat-label">TOTAL</span>
              <span className="stat-val">{status.total_episodes}</span>
            </div>
            <div className="stat-line">
              <span className="stat-label">UNPLAYED</span>
              <span className="stat-val accent">{status.unplayed}</span>
            </div>
            <div className="stat-line">
              <span className="stat-label">IN PROGRESS</span>
              <span className="stat-val">{status.in_progress}</span>
            </div>
            <div className="stat-line">
              <span className="stat-label">PLAYED</span>
              <span className="stat-val">{status.played}</span>
            </div>
          </div>
        </div>
      )}

      {!status && (
        <div className="admin-section">
          <p className="blink">connecting to database...</p>
        </div>
      )}
    </div>
  );
}
