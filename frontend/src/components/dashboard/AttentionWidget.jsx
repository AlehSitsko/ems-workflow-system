import { StatCard } from "../ui/Entity";
import { PageSection } from "../ui/Page";

/**
 * What is waiting for this user right now.
 *
 * Every number here comes from /api/operations/attention, which counts the
 * queues that appear on no board and scopes them to the roles that can act on
 * them — so a card is never shown for work the user cannot open, and there is
 * nothing to hard-code.
 *
 * Cards are omitted at zero rather than shown as "0": an empty queue is not a
 * task, and a wall of zeroes buries the one number that is not zero.
 */
export default function AttentionWidget({ counts, loading }) {
  const cards = [
    {
      key: "schedulingInbox",
      label: "Calls with no date",
      tone: "warning",
      to: "/scheduling-inbox",
    },
    {
      key: "confirmationRound",
      label: "Trips to confirm tomorrow",
      tone: "info",
      to: "/confirmation-round",
    },
    {
      key: "leaveReview",
      label: "Leave requests to review",
      tone: "purple",
      to: "/leave",
    },
  ].filter((card) => counts[card.key] > 0);

  // Yesterday is either signed off or it is not — a count would be noise.
  const closeoutDue = counts.dayCloseout > 0;

  if (loading) {
    return (
      <PageSection title="Needs attention">
        <div className="stat-grid">
          <StatCard label="Loading" value="" loading />
          <StatCard label="Loading" value="" loading />
        </div>
      </PageSection>
    );
  }

  if (!cards.length && !closeoutDue) return null;

  return (
    <PageSection title="Needs attention">
      <div className="stat-grid">
        {cards.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={counts[card.key]}
            tone={card.tone}
            to={card.to}
          />
        ))}
        {closeoutDue && (
          <StatCard label="Yesterday not signed off" value="1 day" tone="danger" to="/day-closeout" />
        )}
      </div>
    </PageSection>
  );
}
