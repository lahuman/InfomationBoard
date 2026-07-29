import { ACCOUNT_STORAGE_LIMIT_BYTES } from "./images/model";

export { ACCOUNT_STORAGE_LIMIT_BYTES } from "./images/model";

const storageNumber = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 1,
});

export function formatStorageBytes(bytes: number): string {
  const safeBytes = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (safeBytes < 1_024) return `${Math.round(safeBytes)} B`;
  if (safeBytes < 1_048_576) {
    return `${storageNumber.format(safeBytes / 1_024)} KB`;
  }
  return `${storageNumber.format(safeBytes / 1_048_576)} MB`;
}

type StorageMeterProps = {
  storageBytes: number;
};

export function StorageMeter({ storageBytes }: StorageMeterProps) {
  const safeStorageBytes = Number.isFinite(storageBytes)
    ? Math.max(0, storageBytes)
    : 0;
  const meterValue = Math.min(
    safeStorageBytes,
    ACCOUNT_STORAGE_LIMIT_BYTES,
  );

  return (
    <section className="storage-card" aria-labelledby="storage-title">
      <div>
        <p className="dashboard-index" aria-hidden="true">
          STORAGE
        </p>
        <h2 id="storage-title">저장공간</h2>
      </div>
      <p className="storage-total">
        {formatStorageBytes(safeStorageBytes)} /{" "}
        {formatStorageBytes(ACCOUNT_STORAGE_LIMIT_BYTES)}
      </p>
      <meter
        aria-label="저장공간 사용량"
        min={0}
        max={ACCOUNT_STORAGE_LIMIT_BYTES}
        value={meterValue}
      >
        {Math.round((meterValue / ACCOUNT_STORAGE_LIMIT_BYTES) * 100)}%
      </meter>
      <p className="storage-note">
        계정당 최대 50MB · 안내판 편집기에서 이미지를 관리할 수 있습니다.
      </p>
    </section>
  );
}
