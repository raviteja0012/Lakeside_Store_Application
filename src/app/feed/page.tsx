"use client";

import StaffFeed from "@/components/StaffFeed";

// The department feed at its own route, so managers (whose home "/" is the command dashboard)
// can still open the feed from the nav. Staff see the same feed as their home at "/".
export default function FeedPage() {
  return <StaffFeed />;
}
