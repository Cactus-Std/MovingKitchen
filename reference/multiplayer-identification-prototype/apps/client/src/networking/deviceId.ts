const DEVICE_ID_KEY = 'roaming-player:device-id';

export function getDeviceId(): string {
  const existing = sessionStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const deviceId = crypto.randomUUID();
  sessionStorage.setItem(DEVICE_ID_KEY, deviceId);
  return deviceId;
}
