export default function UnitTypeBadge({ unitType }) {
  const als = (unitType || "").toUpperCase() === "ALS";
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 6,
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: 1,
      background: als ? "rgba(29,78,216,0.15)" : "rgba(22,101,52,0.15)",
      color: als ? "#1d4ed8" : "#166534",
      border: `1px solid ${als ? "rgba(29,78,216,0.5)" : "rgba(22,101,52,0.5)"}`,
    }}>
      {unitType || "—"}
    </span>
  );
}
