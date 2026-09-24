import Link from "next/link";

export default function NotFound() {
  return (
    <section className="watch-page">
      <div className="wrap">
        <div className="section-head">
          <div className="tag">
            <span className="n">404</span> refused
          </div>
          <h1>This route isn&apos;t in the oath.</h1>
          <p className="watch-lede">
            The page you asked for doesn&apos;t exist, so the wall turned the request away. Nothing
            moved.
          </p>
        </div>
        <Link href="/" className="btn btn-primary has-knob">
          Back to the homepage
          <span className="knob" aria-hidden>
            <svg viewBox="0 0 18 18">
              <path d="m6.6 3.6 6 5.4-6 5.4" />
            </svg>
          </span>
        </Link>
      </div>
    </section>
  );
}
