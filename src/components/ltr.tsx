/**
 * Left-to-right text (model codes, emails, numbers) inside possibly right-to-left text. Uses <bdi>-style
 * isolation so the characters keep their order while the element still aligns with its parent.
 */
export function Ltr({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={className} style={{ unicodeBidi: "isolate" }}>
      {children}
    </span>
  );
}
