import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { AdminStatus } from '../api/client';

interface Props {
  notify: (m: string) => void;
  onRefresh: () => void;
}

export function AdminPanel({ notify, onRefresh }: Props) {
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [markingPrevious, setMarkingPrevious] = useState(false);

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

  const handleMarkAllPreviousPlayed = async () => {
    setMarkingPrevious(true);
    notify('marking all previous episodes as played...');
    try {
      const r = await api.episodes.bulkUpdate('all-previous', 'played');
      notify(`${r.updatedCount} episodes marked as played`);
      fetchStatus();
      onRefresh();
    } catch (e) {
      notify(`mark previous failed: ${e}`);
    }
    setMarkingPrevious(false);
  };

  return (
    <div className="admin-panel">
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
        <h3 className="admin-section-title">{'>>'} bulk_actions</h3>
        <button
          className="term-btn"
          onClick={handleMarkAllPreviousPlayed}
          disabled={markingPrevious}
        >
          {markingPrevious ? '[ marking... ]' : '[ mark all previous as played ]'}
        </button>
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
