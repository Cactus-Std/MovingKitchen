import { useConnectionStore } from '../stores/connectionStore';

export function ConnectionBadge() {
  const status = useConnectionStore((state) => state.status);
  return (
    <div
      className={`connection-badge connection-badge--${status}`}
      role="status"
    >
      <span aria-hidden="true" />
      {status === 'connected'
        ? 'Server connected'
        : status === 'connecting'
          ? 'Connecting…'
          : 'Reconnecting…'}
    </div>
  );
}
