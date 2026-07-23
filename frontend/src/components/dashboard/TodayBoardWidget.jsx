import { useEffect, useState } from "react";

import { StatCard } from "../ui/Entity";
import { PageSection } from "../ui/Page";
import { fetchBoard } from "../../api/dispatchApi";
import { todayStr } from "../../utils/dispatchBoardUtils";

/**
 * Today's operational picture, counted from the same board the dispatcher
 * works — /api/dispatch/board for today. No separate summary endpoint and no
 * derived statistics: these are the rows on the board, counted.
 *
 * Only rendered for roles that may open the board at all; the API would refuse
 * them anyway, and a tile linking somewhere they cannot go is worse than no
 * tile.
 */
export default function TodayBoardWidget({ currentUser }) {
  const [state, setState] = useState({ status: "loading", board: null });
  const date = todayStr();

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", board: null });

    fetchBoard(date)
      .then((board) => {
        if (!cancelled) setState({ status: "ready", board });
      })
      .catch(() => {
        // A dashboard tile must not turn a slow or failing endpoint into a
        // broken page — it simply reports that it could not load.
        if (!cancelled) setState({ status: "error", board: null });
      });

    return () => { cancelled = true; };
  }, [date, currentUser?.id]);

  if (state.status === "loading") {
    return (
      <PageSection title="Today">
        <div className="stat-grid">
          <StatCard label="Open calls" value="" loading />
          <StatCard label="Units on duty" value="" loading />
        </div>
      </PageSection>
    );
  }

  if (state.status === "error") {
    return (
      <PageSection title="Today">
        <p className="text-secondary mb-0">
          Today&apos;s board could not be loaded. <a href="#/dispatch">Open the board</a> to check.
        </p>
      </PageSection>
    );
  }

  const board = state.board || {};
  // The board's own definitions, not new ones: assigning a call moves it to
  // status "assigned", so `openCalls` is exactly the unassigned column, and the
  // assigned ones live under the unit that took them.
  const unassigned = (board.openCalls || []).length;
  const units = board.units || [];
  const assigned = units.reduce((sum, u) => sum + (u.assignedCalls || []).length, 0);
  const completed = (board.completedCalls || []).length;

  return (
    <PageSection title="Today" description={`Dispatch board for ${date}.`}>
      <div className="stat-grid">
        <StatCard
          label="Calls to assign"
          value={unassigned}
          tone={unassigned > 0 ? "warning" : "success"}
          to={`/dispatch?date=${date}`}
        />
        <StatCard label="Assigned" value={assigned} tone="info" to={`/dispatch?date=${date}`} />
        <StatCard label="Units on duty" value={units.length} tone="neutral" to="/crew-planner" />
        <StatCard label="Completed" value={completed} tone="success" to={`/dispatch?date=${date}`} />
      </div>
    </PageSection>
  );
}
