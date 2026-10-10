/** Phone layout for admin lists: stacked cards below the md breakpoint, the table from md up. */
export function ResponsiveList({ cards, table }: { cards: React.ReactNode; table: React.ReactNode }) {
  return (
    <>
      <ul className="space-y-2 md:hidden">{cards}</ul>
      <div className="hidden overflow-x-auto rounded-lg border md:block">{table}</div>
    </>
  );
}

export function MobileCard({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <li className={`rounded-lg border p-3 ${muted ? "text-muted-foreground" : ""}`}>{children}</li>;
}
