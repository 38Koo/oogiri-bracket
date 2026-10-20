import { Link } from "@void/react";
import "./styles.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="site-head">
        <div className="site-head-inner">
          <Link href="/" className="brand">
            勝手に大喜利トーナメント
          </Link>
          <nav>
            <Link href="/stats">みんなの集計</Link>
          </nav>
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
