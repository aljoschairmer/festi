import LoadingComponent from "@/components/loadingComponent";

/**
 * Segment-level loading UI. Without it a navigation between dashboard pages
 * leaves the previous page on screen with no feedback at all.
 */
export default function DashboardLoading() {
  return <LoadingComponent />;
}
