import { formatStatus, Status } from "@/lib/api";

export default function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{formatStatus(status)}</span>;
}
