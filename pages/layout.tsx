import { Link } from "@void/react";
import "./styles.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="maku" aria-hidden="true" />
      <header className="site-head">
        <Link href="/" className="brand">
          勝手に大喜利トーナメント
        </Link>
        <nav>
          <Link href="/stats">みんなの集計</Link>
        </nav>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
